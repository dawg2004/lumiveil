import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { uploadToStorage } from "@/lib/upload-to-storage";

export const runtime = "nodejs";
export const maxDuration = 300;

const FAL_KEY = process.env.FAL_API_KEY!;
const ATLAS_KEY = process.env.ATLASCLOUD_API_KEY!;
const ATLAS_BASE = "https://api.atlascloud.ai";
const HISTORY_PREFIX = "LUMIVEIL_HISTORY::";

type VariantConfig = {
  model: string;
  label: string;
  resolutions: string[];
  durations: number[];
  defaultResolution: string;
  defaultDuration: number;
};

const VARIANTS: Record<string, VariantConfig> = {
  turbo: {
    model: "atlascloud/wan-2.2-turbo-spicy/image-to-video",
    label: "Wan-2.2 Turbo",
    resolutions: ["480p", "720p", "1080p"],
    durations: [5, 8],
    defaultResolution: "480p",
    defaultDuration: 5,
  },
  wan26: {
    model: "atlascloud/wan-2.6-spicy/image-to-video",
    label: "Wan-2.6",
    resolutions: ["720p", "1080p", "1080p-sr", "1440p-sr"],
    durations: [5, 10, 15],
    defaultResolution: "720p",
    defaultDuration: 5,
  },
};

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

async function uploadToFal(file: File): Promise<string> {
  fal.config({ credentials: FAL_KEY });
  try {
    return await fal.storage.upload(file, { lifecycle: { expiresIn: "1d" } });
  } catch {
    return fal.storage.upload(file);
  }
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

async function decrementCredits(adminClient: SupabaseClient, shopId: string, currentCredits: number) {
  const nextCredits = Math.max(0, currentCredits - 1);
  const { error } = await adminClient.from("shops").update({ credits: nextCredits }).eq("id", shopId);
  if (error) throw new Error(error.message);
  return nextCredits;
}

async function saveHistory(adminClient: SupabaseClient, userId: string, label: string, prompt: string, url: string) {
  const { data: shop } = await adminClient.from("shops").select("id").eq("user_id", userId).maybeSingle();
  const shopId = shop?.id ?? userId;

  const { data: existing } = await adminClient
    .from("generation_history")
    .select("id")
    .eq("shop_id", shopId)
    .contains("image_urls", [url])
    .maybeSingle();
  if (existing) return;

  await adminClient.from("generation_history").insert({
    shop_id: shopId,
    prompt: `${HISTORY_PREFIX}${JSON.stringify({ kind: "video", prompt: `${label}動画: ${prompt}`, url })}`,
    image_urls: [url],
    settings: { media_type: "video" },
    credits_used: 1,
  });
}

async function pollPrediction(predictionId: string, timeoutMs = 270_000): Promise<string> {
  const url = `${ATLAS_BASE}/api/v1/model/prediction/${predictionId}`;
  const headers = { Authorization: `Bearer ${ATLAS_KEY}` };
  const deadline = Date.now() + timeoutMs;
  const INTERVAL = 3000;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, INTERVAL));
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`AtlasCloud polling error: ${res.status}`);
    const json = await res.json() as { data?: { status?: string; outputs?: string[]; error?: string } };
    const data = json.data ?? {};
    const status = data.status ?? "";

    if (status === "completed" || status === "succeeded") {
      const videoUrl = data.outputs?.[0];
      if (!videoUrl) throw new Error("AtlasCloud: outputs が空です");
      return videoUrl;
    }
    if (status === "failed") {
      throw new Error(`AtlasCloud生成失敗: ${data.error ?? "不明なエラー"}`);
    }
  }
  throw new Error("AtlasCloud: タイムアウトしました");
}

export async function POST(req: NextRequest) {
  try {
    if (!ATLAS_KEY) return NextResponse.json({ error: "ATLASCLOUD_API_KEY が設定されていません" }, { status: 500 });
    if (!FAL_KEY) return NextResponse.json({ error: "FAL_API_KEY が設定されていません" }, { status: 500 });

    const { user, client } = await getAuthenticatedContext(req);
    if (!user) return NextResponse.json({ error: "ログイン状態が切れています" }, { status: 401 });

    const shop = await getShopRecord(client, user.id);
    const currentCredits = Number(shop?.credits ?? 0);
    if (!shop?.id) return NextResponse.json({ error: "ショップ情報が見つかりません" }, { status: 400 });
    if (currentCredits <= 0) return NextResponse.json({ error: "クレジット不足です。チャージ後に再度お試しください。" }, { status: 402 });

    const formData = await req.formData();
    const file = formData.get("file");
    const prompt = String(formData.get("prompt") ?? "").trim();
    const variantKey = String(formData.get("variant") ?? "turbo");
    const variant = VARIANTS[variantKey];
    if (!variant) return NextResponse.json({ error: "variant が不正です" }, { status: 400 });

    const resolution = String(formData.get("resolution") ?? variant.defaultResolution);
    const durationRaw = Number(formData.get("duration") ?? variant.defaultDuration);
    const duration = variant.durations.includes(durationRaw) ? durationRaw : variant.defaultDuration;

    if (!(file instanceof File)) return NextResponse.json({ error: "file が必要です" }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: "prompt が必要です" }, { status: 400 });
    if (!variant.resolutions.includes(resolution)) {
      return NextResponse.json({ error: "resolution が不正です" }, { status: 400 });
    }

    const imageUrl = await uploadToFal(file);

    const submitRes = await fetch(`${ATLAS_BASE}/api/v1/model/generateVideo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ATLAS_KEY}`,
      },
      body: JSON.stringify({
        model: variant.model,
        image: imageUrl,
        prompt,
        resolution,
        duration,
        seed: -1,
      }),
    });

    if (!submitRes.ok) {
      const text = await submitRes.text();
      throw new Error(`AtlasCloud送信エラー (${submitRes.status}): ${text.slice(0, 300)}`);
    }

    const submitJson = await submitRes.json() as { data?: { id?: string } };
    const predictionId = submitJson.data?.id;
    if (!predictionId) throw new Error("AtlasCloud: prediction ID が取得できませんでした");

    const resultUrl = await pollPrediction(predictionId);

    let url = resultUrl;
    try {
      url = await uploadToStorage(resultUrl, "video");
    } catch (err) {
      console.error("AtlasCloud video storage upload failed, using original URL:", err);
    }

    const adminClient = createAdminSupabaseClient();
    await saveHistory(adminClient, user.id, variant.label, prompt, url);
    const credits = await decrementCredits(adminClient, shop.id, currentCredits);

    return NextResponse.json({ url, credits });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("atlascloud-video route failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
