import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { uploadToStorage } from "@/lib/upload-to-storage";

export const runtime = "nodejs";

const FAL_KEY = process.env.FAL_API_KEY!;
const FACE_SWAP_MODEL = "fal-ai/face-swap";
const HISTORY_PREFIX = "LUMIVEIL_HISTORY::";

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

    if (!(faceFile instanceof File) || !(targetFile instanceof File)) {
      return NextResponse.json({ error: "face_file と target_file の両方が必要です" }, { status: 400 });
    }

    fal.config({ credentials: FAL_KEY });

    // 両画像を並列アップロード
    const [faceUrl, targetUrl] = await Promise.all([
      uploadToFal(faceFile),
      uploadToFal(targetFile),
    ]);

    // fal-ai/face-swap: base_image_url=体(合成先), swap_image_url=顔
    const result = await fal.subscribe(FACE_SWAP_MODEL, {
      input: {
        base_image_url: targetUrl,
        swap_image_url: faceUrl,
      },
    });

    const resultData = result.data as { image?: { url?: string } };
    const falUrl = resultData.image?.url;
    if (!falUrl) throw new Error("result image url is missing");

    let url = falUrl;
    try {
      url = await uploadToStorage(falUrl, "image");
    } catch (err) {
      console.error("Faceswap storage upload failed, using fal URL:", err);
    }

    const adminClient = createAdminSupabaseClient();
    await saveGenerationHistory(adminClient, user.id, url);
    const credits = await decrementCredits(adminClient, shop.id, currentCredits);

    return NextResponse.json({ url, credits });
  } catch (error) {
    const msg = getErrorMessage(error);
    console.error("faceswap route failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
