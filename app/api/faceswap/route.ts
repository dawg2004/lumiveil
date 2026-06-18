import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { uploadToStorage } from "@/lib/upload-to-storage";

export const runtime = "nodejs";

const FAL_KEY = process.env.FAL_API_KEY!;
const GROK_API_KEY = process.env.XAI_API_KEY ?? process.env.FAL_API_KEY!;
const FACE_SWAP_MODEL = "fal-ai/face-swap";
const HAIR_CHANGE_MODEL = "fal-ai/image-apps-v2/hair-change";
const HISTORY_PREFIX = "LUMIVEIL_HISTORY::";

const HAIRSTYLE_ENUMS = [
  "short_hair","medium_long_hair","long_hair","curly_hair","wavy_hair",
  "high_ponytail","bun","bob_cut","pixie_cut","braids","straight_hair",
  "afro","dreadlocks","buzz_cut","mohawk","bangs","side_part","middle_part",
] as const;

const HAIR_COLOR_ENUMS = [
  "black","dark_brown","light_brown","blonde","platinum_blonde","red",
  "auburn","gray","silver","blue","green","purple","pink","rainbow",
  "natural","highlights","ombre","balayage",
] as const;

type HairstyleEnum = typeof HAIRSTYLE_ENUMS[number];
type HairColorEnum = typeof HAIR_COLOR_ENUMS[number];

function createBearerSupabaseClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getAuthenticatedContext(req: NextRequest): Promise<{ user: User | null; client: SupabaseClient }> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (token) {
    const tokenSupabase = createBearerSupabaseClient(token);
    const { data: { user } } = await tokenSupabase.auth.getUser(token);
    if (user) return { user, client: tokenSupabase };
  }
  const cookieSupabase = await createServerSupabaseClient();
  const { data: { user } } = await cookieSupabase.auth.getUser();
  return { user, client: cookieSupabase };
}

async function uploadToFal(file: File): Promise<string> {
  fal.config({ credentials: FAL_KEY });
  try {
    return await fal.storage.upload(file, { lifecycle: { expiresIn: "1d" } });
  } catch {
    return fal.storage.upload(file);
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
    return `${error.name}: ${error.message}${cause}`;
  }
  return String(error);
}

async function getShopRecord(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("shops")
    .select("id, credits")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function saveGenerationHistory(adminClient: SupabaseClient, userId: string, generatedUrl: string) {
  const { data: shop } = await adminClient
    .from("shops")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  const shopId = shop?.id ?? userId;

  const { data: existing } = await adminClient
    .from("generation_history")
    .select("id")
    .eq("shop_id", shopId)
    .contains("image_urls", [generatedUrl])
    .maybeSingle();
  if (existing) return;

  await adminClient.from("generation_history").insert({
    shop_id: shopId,
    avatar_id: null,
    prompt: `${HISTORY_PREFIX}${JSON.stringify({ kind: "image", prompt: "顔ハメ編集", url: generatedUrl })}`,
    image_urls: [generatedUrl],
    settings: { media_type: "image" },
    credits_used: 1,
  });
}

async function decrementCredits(adminClient: SupabaseClient, shopId: string, currentCredits: number) {
  const nextCredits = Math.max(0, currentCredits - 1);
  await adminClient.from("shops").update({ credits: nextCredits }).eq("id", shopId);
  return nextCredits;
}

// Grok Visionで顔画像の髪型・髪色をenum値に変換
async function detectHairFromImage(faceImageUrl: string): Promise<{ hairstyle: HairstyleEnum; hairColor: HairColorEnum }> {
  const prompt = `Look at this person's hairstyle and hair color carefully.

Choose EXACTLY ONE value for hairstyle from this list:
${HAIRSTYLE_ENUMS.join(", ")}

Choose EXACTLY ONE value for hair color from this list:
${HAIR_COLOR_ENUMS.join(", ")}

Reply in JSON only, no explanation:
{"hairstyle": "<value>", "hairColor": "<value>"}`;

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-2-vision-latest",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: faceImageUrl } },
            { type: "text", text: prompt },
          ],
        },
      ],
      max_tokens: 100,
    }),
  });

  if (!res.ok) {
    throw new Error(`Grok vision failed: ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "{}";

  // JSONを抽出してパース
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Grok response parse failed");

  const parsed = JSON.parse(jsonMatch[0]) as { hairstyle?: string; hairColor?: string };

  const hairstyle = HAIRSTYLE_ENUMS.includes(parsed.hairstyle as HairstyleEnum)
    ? (parsed.hairstyle as HairstyleEnum)
    : "medium_long_hair";

  const hairColor = HAIR_COLOR_ENUMS.includes(parsed.hairColor as HairColorEnum)
    ? (parsed.hairColor as HairColorEnum)
    : "natural";

  return { hairstyle, hairColor };
}

export async function POST(req: NextRequest) {
  try {
    if (!FAL_KEY) {
      return NextResponse.json({ error: "FAL_API_KEY is not configured" }, { status: 500 });
    }

    const { user, client } = await getAuthenticatedContext(req);
    if (!user) {
      return NextResponse.json({ error: "ログイン状態が切れています。もう一度ログインしてください。" }, { status: 401 });
    }

    const shop = await getShopRecord(client, user.id);
    const currentCredits = Number(shop?.credits ?? 0);
    if (!shop?.id) {
      return NextResponse.json({ error: "ショップ情報が見つかりません。" }, { status: 400 });
    }
    if (currentCredits <= 0) {
      return NextResponse.json({ error: "クレジット不足です。チャージ後に再度お試しください。" }, { status: 402 });
    }

    const formData = await req.formData();
    const faceFile = formData.get("face_file");
    const targetFile = formData.get("target_file");
    const applyHair = formData.get("apply_hair") === "true";

    if (!(faceFile instanceof File) || !(targetFile instanceof File)) {
      return NextResponse.json({ error: "face_file と target_file の両方が必要です" }, { status: 400 });
    }

    fal.config({ credentials: FAL_KEY });

    // Step 1: 両画像を並列アップロード
    const [faceUrl, targetUrl] = await Promise.all([
      uploadToFal(faceFile),
      uploadToFal(targetFile),
    ]);

    // Step 2: 顔ハメ
    const swapResult = await fal.subscribe(FACE_SWAP_MODEL, {
      input: {
        base_image_url: targetUrl,
        swap_image_url: faceUrl,
      },
    });

    const swapData = swapResult.data as { image?: { url?: string } };
    const swappedUrl = swapData.image?.url;
    if (!swappedUrl) throw new Error("face-swap result url is missing");

    let finalUrl = swappedUrl;

    // Step 3: 髪型マッチング（オプション）
    let detectedHair: { hairstyle: HairstyleEnum; hairColor: HairColorEnum } | null = null;
    if (applyHair) {
      try {
        detectedHair = await detectHairFromImage(faceUrl);

        // swappedUrlをfal storageに再アップロードしてpublicなURLを確保
        const swappedBlob = await fetch(swappedUrl).then(r => r.blob());
        const swappedFile = new File([swappedBlob], "swapped.jpg", { type: "image/jpeg" });
        const swappedFalUrl = await uploadToFal(swappedFile);

        const hairResult = await fal.subscribe(HAIR_CHANGE_MODEL, {
          input: {
            image_url: swappedFalUrl,
            target_hairstyle: detectedHair.hairstyle,
            hair_color: detectedHair.hairColor,
          },
        });

        const hairData = hairResult.data as { images?: Array<{ url?: string }> };
        const hairUrl = hairData.images?.[0]?.url;
        if (hairUrl) {
          finalUrl = hairUrl;
        }
      } catch (err) {
        // 髪型変更が失敗しても顔ハメ結果は返す
        console.error("Hair change failed, returning swap result:", err);
      }
    }

    // Supabaseに保存
    try {
      finalUrl = await uploadToStorage(finalUrl, "image");
    } catch (err) {
      console.error("Storage upload failed, using fal URL:", err);
    }

    const adminClient = createAdminSupabaseClient();
    await saveGenerationHistory(adminClient, user.id, finalUrl);
    const credits = await decrementCredits(adminClient, shop.id, currentCredits);

    return NextResponse.json({
      url: finalUrl,
      credits,
      detectedHair,
    });
  } catch (error) {
    const msg = getErrorMessage(error);
    console.error("faceswap route failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
