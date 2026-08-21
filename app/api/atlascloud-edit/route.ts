import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { uploadToStorage } from "@/lib/upload-to-storage";
import { evaluateTabAccess, getRequestIp } from "@/lib/access-control";

export const runtime = "nodejs";
export const maxDuration = 300;

const FAL_KEY = process.env.FAL_API_KEY!;
const ATLAS_KEY = process.env.ATLASCLOUD_API_KEY!;
const ATLAS_BASE = "https://api.atlascloud.ai";
const ATLAS_MODEL = "alibaba/wan-2.6/image-edit";
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
    .select("id, credits, allowed_tabs, last_login_ip")
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

async function saveHistory(adminClient: SupabaseClient, userId: string, prompt: string, url: string) {
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
    prompt: `${HISTORY_PREFIX}${JSON.stringify({ kind: "image", prompt: `Wan-2.6編集: ${prompt}`, url })}`,
    image_urls: [url],
    settings: { media_type: "image" },
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
      const imageUrl = data.outputs?.[0];
      if (!imageUrl) throw new Error("AtlasCloud: outputs が空です");
      return imageUrl;
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

    const access = evaluateTabAccess(shop, "edit", getRequestIp(req));
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    if (currentCredits <= 0) return NextResponse.json({ error: "クレジット不足です。チャージ後に再度お試しください。" }, { status: 402 });

    const formData = await req.formData();
    const file = formData.get("file");
    const prompt = String(formData.get("prompt") ?? "").trim();
    const size = String(formData.get("size") ?? "1280*1280");

    if (!(file instanceof File)) return NextResponse.json({ error: "file が必要です" }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: "prompt が必要です" }, { status: 400 });

    // ファイルをfal.storageにアップロードして公開URLを取得
    const imageUrl = await uploadToFal(file);

    // AtlasCloud に送信
    const submitRes = await fetch(`${ATLAS_BASE}/api/v1/model/generateImage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ATLAS_KEY}`,
      },
      body: JSON.stringify({
        model: ATLAS_MODEL,
        images: [imageUrl],
        prompt,
        negative_prompt: "",
        size,
        enable_prompt_expansion: false,
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

    // ポーリングして結果を待つ
    const resultUrl = await pollPrediction(predictionId);

    // Supabaseストレージに永続保存
    let url = resultUrl;
    try {
      url = await uploadToStorage(resultUrl, "image");
    } catch (err) {
      console.error("AtlasCloud storage upload failed, using original URL:", err);
    }

    const adminClient = createAdminSupabaseClient();
    await saveHistory(adminClient, user.id, prompt, url);
    const credits = await decrementCredits(adminClient, shop.id, currentCredits);

    return NextResponse.json({ url, credits });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("atlascloud-edit route failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
