import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { uploadToStorage } from "@/lib/upload-to-storage";

export const runtime = "nodejs";

const FAL_KEY = process.env.FAL_API_KEY!;
const TEXT_TO_IMAGE_MODEL = "fal-ai/flux/dev";
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
    const sb = createBearerSupabaseClient(token);
    const { data: { user } } = await sb.auth.getUser(token);
    if (user) return { user, client: sb };
  }
  const sb = await createServerSupabaseClient();
  const { data: { user } } = await sb.auth.getUser();
  return { user, client: sb };
}

export async function POST(req: NextRequest) {
  try {
    if (!FAL_KEY) {
      return NextResponse.json({ error: "FAL_API_KEY is not configured" }, { status: 500 });
    }

    const { user, client } = await getAuthenticatedContext(req);
    if (!user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const { prompt } = await req.json() as { prompt?: string };
    if (!prompt?.trim()) {
      return NextResponse.json({ error: "prompt が必要です" }, { status: 400 });
    }

    const { data: shop, error: shopError } = await client
      .from("shops")
      .select("id, credits")
      .eq("user_id", user.id)
      .maybeSingle();
    if (shopError) throw new Error(shopError.message);
    if (!shop?.id) return NextResponse.json({ error: "ショップ情報が見つかりません" }, { status: 400 });
    if (Number(shop.credits) <= 0) {
      return NextResponse.json({ error: "クレジット不足です。チャージ後に再度お試しください。" }, { status: 402 });
    }

    fal.config({ credentials: FAL_KEY });

    const result = await fal.subscribe(TEXT_TO_IMAGE_MODEL, {
      input: {
        prompt: prompt.trim(),
        image_size: "portrait_4_3",
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        enable_safety_checker: false,
      },
    });

    const data = result.data as { images?: Array<{ url?: string }> };
    const imageUrl = data.images?.[0]?.url;
    if (!imageUrl) throw new Error("生成された画像URLがありません");

    let finalUrl = imageUrl;
    try {
      finalUrl = await uploadToStorage(imageUrl, "image");
    } catch (err) {
      console.error("Storage upload failed, using fal URL:", err);
    }

    const adminClient = createAdminSupabaseClient();
    await adminClient.from("generation_history").insert({
      shop_id: shop.id,
      avatar_id: null,
      prompt: `${HISTORY_PREFIX}${JSON.stringify({ kind: "image", prompt, url: finalUrl })}`,
      image_urls: [finalUrl],
      settings: { media_type: "image" },
      credits_used: 1,
    });

    const nextCredits = Math.max(0, Number(shop.credits) - 1);
    await adminClient.from("shops").update({ credits: nextCredits }).eq("id", shop.id);

    return NextResponse.json({ url: finalUrl, credits: nextCredits });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("text-to-image failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
