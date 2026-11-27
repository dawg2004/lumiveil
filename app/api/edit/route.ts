import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import sharp from "sharp";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { computeFlux2ImageSize, type Flux2ImageSize } from "@/lib/flux2-image-size";
import { uploadBufferToStorage, uploadToStorage } from "@/lib/upload-to-storage";
import { evaluateTabAccess, getRequestIp } from "@/lib/access-control";

export const runtime = "nodejs";
export const maxDuration = 300;

const FAL_KEY = process.env.FAL_API_KEY!;
const GROK_EDIT_MODEL = "xai/grok-imagine-image/quality/edit";
const QWEN_EDIT_MODEL = "fal-ai/qwen-image-2/edit";
const SEEDREAM_EDIT_MODEL = "bytedance/seedream/v5/pro/edit";
const FLUX_KONTEXT_EDIT_MODEL = "fal-ai/flux-pro/kontext/multi";
// ステップ生成の背景変更・背景合成用。クライアントからは provider 名だけ受け取り、モデル ID はここで固定する。
const FLUX2_EDIT_MODELS = {
  flux2: { id: "fal-ai/flux-2/edit", label: "FLUX.2" },
  "flux2-turbo": { id: "fal-ai/flux-2/turbo/edit", label: "FLUX.2 turbo" },
} as const;
type Flux2Provider = keyof typeof FLUX2_EDIT_MODELS;

function isFlux2Provider(value: string): value is Flux2Provider {
  return value === "flux2" || value === "flux2-turbo";
}
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EDIT_MODEL = "gpt-image-1.5";
const OPENAI_EDIT_TIMEOUT_MS = 165_000;
const SPICY_API_BASE = "https://api.spicyapi.ai";
const SPICY_SEEDREAM_EDIT_MODEL = "bytedance/seedream-5.0-pro/edit";
const SPICY_POLL_TIMEOUT_MS = 180_000;
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

async function getPersonImageSize(file: File): Promise<Flux2ImageSize | null> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const meta = await sharp(buffer).rotate().metadata();
    if (meta.width && meta.height) {
      return computeFlux2ImageSize(meta.width, meta.height);
    }
  } catch (error) {
    console.error("FLUX.2 image size detection failed", getErrorMessage(error));
  }
  return null;
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

function getFalEditError(providerLabel: string, status: number, body: string) {
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
    return `${providerLabel}側の安全フィルターで編集できませんでした。露出や性的表現を弱めて、別の表現で試してください。`;
  }

  const redacted = message.replace(/data:image\/[^"'\\s]+/g, "[uploaded image]");
  return `${providerLabel}編集に失敗しました。(${status}) ${redacted.slice(0, 240)}`;
}

async function callFalEditModel(
  modelId: string,
  providerLabel: string,
  imageUrls: string[],
  prompt: string,
  extraBody: Record<string, unknown>
): Promise<{ url: string; revisedPrompt: string }> {
  const response = await fetch(`https://fal.run/${modelId}`, {
    method: "POST",
    headers: {
      "Authorization": `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_urls: imageUrls,
      ...extraBody,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(getFalEditError(providerLabel, response.status, text));
  }

  const data = await response.json();
  // FLUX 等は安全フィルターに掛かると真っ黒な画像を返し has_nsfw_concepts を true にする。
  // 黒画像を保存・クレジット消費しないよう、ここでエラーにする。
  if (Array.isArray(data.has_nsfw_concepts) && data.has_nsfw_concepts[0] === true) {
    throw new Error(`${providerLabel}側の安全フィルターで編集できませんでした（黒い画像が返されました）。露出や性的表現を弱めるか、別のモデルで試してください。`);
  }
  const falUrl = data.images?.[0]?.url;
  if (!falUrl) {
    throw new Error("URL not found");
  }

  let url = falUrl;
  try {
    url = await uploadToStorage(falUrl, "image");
  } catch (err) {
    console.error(`${providerLabel} edit storage upload failed, using fal URL:`, err);
  }

  return { url, revisedPrompt: data.revised_prompt ?? "" };
}

type SpicyTaskAsset = {
  url?: string;
  unavailable?: boolean;
};

type SpicyTaskData = {
  taskId?: string;
  state?: string;
  errorCode?: string;
  errorMessage?: string;
  output?: {
    assets?: SpicyTaskAsset[];
  };
};

type SpicyEnvelope = {
  code?: number;
  msg?: string;
  request_id?: string;
  data?: SpicyTaskData;
};

function getSpicyErrorMessage(status: number, body: string, fallback: string) {
  let message = fallback;

  try {
    const parsed = JSON.parse(body) as SpicyEnvelope;
    if (parsed.data?.errorMessage) {
      message = parsed.data.errorMessage;
    } else if (parsed.msg && parsed.msg !== "success") {
      message = parsed.msg;
    }
  } catch {
    if (body.trim()) {
      message = body;
    }
  }

  const redacted = message.replace(/data:image\/[^"'\s]+/g, "[uploaded image]");
  return `Spicy編集に失敗しました。(${status}) ${redacted.slice(0, 240)}`;
}

async function isMostlyBlackImage(buffer: Buffer): Promise<boolean> {
  try {
    const { data, info } = await sharp(buffer)
      .rotate()
      .resize(64, 64, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = info.width * info.height;
    if (pixels === 0) return false;

    let dark = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i] < 8 && data[i + 1] < 8 && data[i + 2] < 8) {
        dark += 1;
      }
    }
    return dark / pixels >= 0.98;
  } catch (error) {
    console.error("Spicy black-image check failed", getErrorMessage(error));
    return false;
  }
}

async function uploadFilesForSpicy(files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "image/jpeg";
    urls.push(await uploadBufferToStorage(buffer, contentType, "image"));
  }
  return urls;
}

async function readSpicyTask(apiKey: string, taskId: string): Promise<{ data: SpicyTaskData; retryAfterMs?: number }> {
  const response = await fetch(
    `${SPICY_API_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  const text = await response.text();

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after") ?? "2");
    return { data: {}, retryAfterMs: Math.max(1, retryAfter) * 1000 };
  }

  if (!response.ok) {
    throw new Error(getSpicyErrorMessage(response.status, text, "タスクの確認に失敗しました。"));
  }

  const parsed = JSON.parse(text) as SpicyEnvelope;
  if (!parsed.data) {
    throw new Error(getSpicyErrorMessage(response.status, text, "タスク情報を取得できませんでした。"));
  }
  return { data: parsed.data };
}

async function waitForSpicyTask(apiKey: string, created: SpicyTaskData): Promise<SpicyTaskData> {
  const taskId = created.taskId;
  if (!taskId) {
    throw new Error("Spicy編集に失敗しました。taskId が返りませんでした。");
  }

  const started = Date.now();
  let wait = 2000;
  let current = created;

  while (current.state === "queued" || current.state === "running") {
    if (Date.now() - started > SPICY_POLL_TIMEOUT_MS) {
      throw new Error("Spicy編集が時間内に完了しませんでした。しばらくしてから再度お試しください。");
    }

    await new Promise((resolve) => setTimeout(resolve, wait));
    wait = Math.min(wait * 1.5, 15_000);

    const result = await readSpicyTask(apiKey, taskId);
    if (result.retryAfterMs) {
      wait = result.retryAfterMs;
      continue;
    }
    current = result.data;
  }

  return current;
}

async function callSpicySeedreamEdit(
  apiKey: string,
  files: File[],
  prompt: string,
  resolution: string
): Promise<{ url: string; revisedPrompt: string }> {
  const imageUrls = await uploadFilesForSpicy(files);
  const spicyResolution = resolution === "2k" ? "2k" : "1k";

  const response = await fetch(`${SPICY_API_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      model: SPICY_SEEDREAM_EDIT_MODEL,
      input: {
        prompt,
        image_urls: imageUrls,
        aspect_ratio: "auto",
        background: "opaque",
        output_format: "jpeg",
        resolution: spicyResolution,
      },
    }),
  });

  const text = await response.text();
  let parsed: SpicyEnvelope;
  try {
    parsed = JSON.parse(text) as SpicyEnvelope;
  } catch {
    throw new Error(getSpicyErrorMessage(response.status, text, "タスクの作成に失敗しました。"));
  }

  if (response.status !== 202 && response.status !== 200) {
    throw new Error(getSpicyErrorMessage(response.status, text, parsed.msg ?? "タスクの作成に失敗しました。"));
  }
  if (!parsed.data?.taskId) {
    throw new Error(getSpicyErrorMessage(response.status, text, "taskId が返りませんでした。"));
  }

  const task = await waitForSpicyTask(apiKey, parsed.data);
  if (task.state !== "succeeded") {
    const detail = [task.errorCode, task.errorMessage].filter(Boolean).join(": ");
    throw new Error(
      detail
        ? `Spicy編集に失敗しました。(${task.state}) ${detail}`
        : `Spicy編集に失敗しました。(${task.state ?? "unknown"})`
    );
  }

  const resultUrl = task.output?.assets?.find((asset) => asset.url && !asset.unavailable)?.url;
  if (!resultUrl) {
    throw new Error("Spicy編集の結果画像URLを取得できませんでした。");
  }

  const resultResponse = await fetch(resultUrl);
  if (!resultResponse.ok) {
    throw new Error(`Spicy編集の結果画像の取得に失敗しました。(${resultResponse.status})`);
  }

  const resultBuffer = Buffer.from(await resultResponse.arrayBuffer());
  if (await isMostlyBlackImage(resultBuffer)) {
    throw new Error("Spicy側の安全フィルターで編集できませんでした（黒い画像が返されました）。露出や性的表現を弱めるか、別のモデルで試してください。");
  }

  const contentType = resultResponse.headers.get("content-type") || "image/jpeg";
  let url: string;
  try {
    url = await uploadBufferToStorage(resultBuffer, contentType, "image");
  } catch (err) {
    console.error("Spicy edit storage upload failed, using Spicy URL:", err);
    url = resultUrl;
  }

  return { url, revisedPrompt: "" };
}

function getOpenAiEditError(status: number, body: string) {
  let message = body;

  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; code?: string } };
    if (parsed.error?.message) {
      message = parsed.error.message;
    }
  } catch {
    // noop
  }

  if (status === 403 || /organization|verif/i.test(message)) {
    return "GPT Image APIの利用には組織の本人確認（Organization Verification）が必要です。OpenAIの管理画面で確認してください。";
  }

  if (/safety|content_policy/i.test(message)) {
    return "GPT Image側の安全フィルターで編集できませんでした。表現を弱めて別の内容で試してください。";
  }

  const redacted = message.replace(/data:image\/[^"'\s]+/g, "[uploaded image]");
  return `GPT Image編集に失敗しました。(${status}) ${redacted.slice(0, 240)}`;
}

async function callOpenAiEdit(files: File[], prompt: string, resolution: string): Promise<Buffer> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const formData = new FormData();
  formData.set("model", OPENAI_EDIT_MODEL);
  formData.set("prompt", prompt);
  formData.set("size", "auto");
  formData.set("quality", resolution === "2k" ? "high" : "medium");
  formData.set("n", "1");
  formData.set("output_format", "jpeg");
  for (const file of files) {
    formData.append("image[]", file);
  }

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
      // クライアント側の待ち時間（180秒）より先に切り、JSON のエラーとして返す
      signal: AbortSignal.timeout(OPENAI_EDIT_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("GPT Imageの応答が時間内に返ってきませんでした。少し時間をおいてもう一度お試しください。");
    }
    throw error;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(getOpenAiEditError(response.status, text));
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("GPT Imageのレスポンスに画像データが含まれていませんでした。");
  }

  return Buffer.from(b64, "base64");
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
      const stepAccess = evaluateTabAccess(shop, "step", getRequestIp(req));
      const faceswapAccess = evaluateTabAccess(shop, "faceswap", getRequestIp(req));
      if (!stepAccess.ok && !faceswapAccess.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
      }
    }

    if (currentCredits <= 0) {
      return NextResponse.json({ error: "クレジット不足です。チャージ後に再度お試しください。" }, { status: 402 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const file2 = formData.get("file2");
    const prompt = String(formData.get("prompt") ?? "").trim();
    const resolution = String(formData.get("resolution") ?? "1k");
    const providerRaw = String(formData.get("provider") ?? "grok");
    const provider =
      providerRaw === "openai" ? "openai" :
      providerRaw === "spicy-seedream" ? "spicy-seedream" :
      providerRaw === "qwen" ? "qwen" :
      providerRaw === "seedream" ? "seedream" :
      providerRaw === "flux" ? "flux" :
      isFlux2Provider(providerRaw) ? providerRaw :
      "grok";
    // 顔ハメページの「AI生成で頭部合成」から呼ばれた場合は "headswap"
    const mode = String(formData.get("mode") ?? "") === "headswap" ? "headswap" : "edit";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    if (resolution !== "1k" && resolution !== "2k") {
      return NextResponse.json({ error: "invalid resolution" }, { status: 400 });
    }

    let url: string;
    let revisedPrompt = "";

    const fullPrompt = `${FACE_PRESERVATION_PROMPT}\n${WATERMARK_REMOVAL_PROMPT}\n\n${prompt}`;

    if (provider === "openai") {
      const files = [file, ...(file2 instanceof File ? [file2] : [])];
      const buffer = await callOpenAiEdit(files, fullPrompt, resolution);
      url = await uploadBufferToStorage(buffer, "image/jpeg", "image");
    } else if (provider === "spicy-seedream") {
      const spicyKey = process.env.SPICY_API_KEY;
      if (!spicyKey) {
        return NextResponse.json({ error: "SPICY_API_KEY is not configured" }, { status: 500 });
      }

      const files = [file, ...(file2 instanceof File ? [file2] : [])];
      const result = await callSpicySeedreamEdit(spicyKey, files, fullPrompt, resolution);
      url = result.url;
      revisedPrompt = result.revisedPrompt;
    } else {
      if (!FAL_KEY) {
        return NextResponse.json({ error: "FAL_API_KEY is not configured" }, { status: 500 });
      }

      const imageUrl = await uploadToFal(file);
      const imageUrls = [imageUrl];
      if (file2 instanceof File) {
        imageUrls.push(await uploadToFal(file2));
      }

      const fluxPrompt = `Change the clothing according to this instruction: ${prompt}. Keep the person's face, identity, pose, and background as close as possible. Remove any watermarks.`;
      const flux2ImageSize = isFlux2Provider(provider) ? await getPersonImageSize(file) : null;

      const result = provider === "qwen"
        ? await callFalEditModel(QWEN_EDIT_MODEL, "Qwen Image", imageUrls, fullPrompt, {
            num_images: 1,
            output_format: "jpeg",
            enable_safety_checker: false,
          })
        : provider === "seedream"
        ? await callFalEditModel(SEEDREAM_EDIT_MODEL, "Seedream", imageUrls, fullPrompt, {
            num_images: 1,
            enable_safety_checker: false,
          })
        : isFlux2Provider(provider)
        ? await callFalEditModel(FLUX2_EDIT_MODELS[provider].id, FLUX2_EDIT_MODELS[provider].label, imageUrls, fullPrompt, {
            num_images: 1,
            output_format: "jpeg",
            enable_safety_checker: false,
            ...(flux2ImageSize ? { image_size: flux2ImageSize } : {}),
          })
        : provider === "flux" && mode === "headswap"
        ? await callFalEditModel(FLUX_KONTEXT_EDIT_MODEL, "FLUX Kontext", imageUrls, prompt, {
            num_images: 1,
            output_format: "jpeg",
            safety_tolerance: "5",
            guidance_scale: 3.5,
            enhance_prompt: false,
          })
        : provider === "flux"
        ? await callFalEditModel(FLUX_KONTEXT_EDIT_MODEL, "FLUX Kontext", imageUrls, fluxPrompt, {
            num_images: 1,
            output_format: "jpeg",
            safety_tolerance: "5",
            guidance_scale: 8,
            enhance_prompt: true,
          })
        : await callFalEditModel(GROK_EDIT_MODEL, "Grok", imageUrls, fullPrompt, {
            num_images: 1,
            aspect_ratio: "auto",
            resolution,
            output_format: "jpeg",
          });

      url = result.url;
      revisedPrompt = result.revisedPrompt;
    }

    const adminClient = createAdminSupabaseClient();
    await saveGenerationHistory(adminClient, user.id, prompt, url);
    const credits = await decrementCredits(adminClient, shop.id, currentCredits);

    return NextResponse.json({
      url,
      revisedPrompt,
      credits,
    });
  } catch (error) {
    const msg = getErrorMessage(error);
    console.error("edit route failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
