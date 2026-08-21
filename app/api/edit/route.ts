import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { uploadToStorage } from "@/lib/upload-to-storage";
import { evaluateTabAccess, getRequestIp } from "@/lib/access-control";

export const runtime = "nodejs";

const FAL_KEY = process.env.FAL_API_KEY!;
const GROK_EDIT_MODEL = "xai/grok-imagine-image/quality/edit";
const HISTORY_PREFIX = "LUMIVEIL_HISTORY::";
const FACE_PRESERVATION_PROMPT =
  "Identity lock: preserve the exact same person from the input image. Keep the face, facial structure, eyes, nose, mouth, jawline, expression, hairstyle, hairline, skin tone, age, and body proportions unchanged. Do not beautify, replace, redraw, stylize, retouch, or reinterpret the face. Edit only the requested non-identity details and keep the image photorealistic.";
const WATERMARK_REMOVAL_PROMPT =
  "Remove all watermarks, logos, text overlays, captions, signatures, brand marks, and UI artifacts from the image. Do not add any watermark, logo, text, caption, signature, or brand mark to the result.";

function createBearerSupabaseClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    }
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
    if (error.name === "ApiError" && error.message === "Forbidden") {
      return "画像のアップロードに失敗しました（FAL API 認証エラー）。しばらく待ってから再度お試しください。";
    }
    const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
    return `${error.name}: ${error.message}${cause}`;
  }
  return String(error);
}

function getFalEditError(status: number, body: string) {
  let message = body;

  try {
    const parsed = JSON.parse(body) as { detail?: Array<{ msg?: string }> | string };
    if (Array.isArray(parsed.detail)) {
      message = parsed.detail.map(item => item.msg).filter(Boolean).join(" / ");
    } else if (typeof parsed.detail === "string") {
      message = parsed.detail;
    }
  } catch {
    // noop
  }

  if (message.includes("content could not be processed")) {
    return "Grok側の安全フィルターで編集できませんでした。露出や性的表現を弱めて、別の表現で試してください。";
  }

  const redacted = message.replace(/data:image\/[^"'\\s]+/g, "[uploaded image]");
  return `Grok編集に失敗しました。(${status}) ${redacted.slice(0, 240)}`;
}

function encodeHistoryPrompt(input: { kind: "image" | "video"; prompt: string; url: string }) {
  return `${HISTORY_PREFIX}${JSON.stringify(input)}`;
}

async function getShopRecord(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("shops")
    .select("id, credits, allowed_tabs, last_login_ip")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function saveGenerationHistory(adminClient: SupabaseClient, userId: string, prompt: string, generatedUrl: string) {
  const { data: shop, error: shopError } = await adminClient
    .from("shops")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (shopError) {
    throw new Error(shopError.message);
  }

  const shopId = shop?.id ?? userId;

  const { data: existing } = await adminClient
    .from("generation_history")
    .select("id")
    .eq("shop_id", shopId)
    .contains("image_urls", [generatedUrl])
    .maybeSingle();

  if (existing) return;

  const { error } = await adminClient.from("generation_history").insert({
    shop_id: shopId,
    avatar_id: null,
    prompt: encodeHistoryPrompt({
      kind: "image",
      prompt: `画像編集: ${prompt}`,
      url: generatedUrl,
    }),
    image_urls: [generatedUrl],
    settings: { media_type: "image" },
    credits_used: 1,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function decrementCredits(adminClient: SupabaseClient, shopId: string, currentCredits: number) {
  const nextCredits = Math.max(0, currentCredits - 1);

  const { error } = await adminClient
    .from("shops")
    .update({ credits: nextCredits })
    .eq("id", shopId);

  if (error) {
    throw new Error(error.message);
  }

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

    const access = evaluateTabAccess(shop, "edit", getRequestIp(req));
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    if (currentCredits <= 0) {
      return NextResponse.json({ error: "クレジット不足です。チャージ後に再度お試しください。" }, { status: 402 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const prompt = String(formData.get("prompt") ?? "").trim();
    const resolution = String(formData.get("resolution") ?? "1k");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    if (resolution !== "1k" && resolution !== "2k") {
      return NextResponse.json({ error: "invalid resolution" }, { status: 400 });
    }

    const imageUrl = await uploadToFal(file);
    const response = await fetch(`https://fal.run/${GROK_EDIT_MODEL}`, {
      method: "POST",
      headers: {
        "Authorization": `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: `${FACE_PRESERVATION_PROMPT}\n${WATERMARK_REMOVAL_PROMPT}\n\n${prompt}`,
        image_urls: [imageUrl],
        num_images: 1,
        aspect_ratio: "auto",
        resolution,
        output_format: "jpeg",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(getFalEditError(response.status, text));
    }

    const data = await response.json();
    const falUrl = data.images?.[0]?.url;
    if (!falUrl) {
      throw new Error("URL not found");
    }

    let url = falUrl;
    try {
      url = await uploadToStorage(falUrl, "image");
    } catch (err) {
      console.error("Edit storage upload failed, using fal URL:", err);
    }

    const adminClient = createAdminSupabaseClient();
    await saveGenerationHistory(adminClient, user.id, prompt, url);
    const credits = await decrementCredits(adminClient, shop.id, currentCredits);

    return NextResponse.json({
      url,
      revisedPrompt: data.revised_prompt ?? "",
      credits,
    });
  } catch (error) {
    const msg = getErrorMessage(error);
    console.error("edit route failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
