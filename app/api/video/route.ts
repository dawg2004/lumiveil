import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { uploadToStorage } from "@/lib/upload-to-storage";
import { evaluateTabAccess, getRequestIp } from "@/lib/access-control";
import { falVideoCredits } from "@/lib/pricing";

const FAL_KEY = process.env.FAL_API_KEY!;
const HISTORY_PREFIX = "LUMIVEIL_HISTORY::";

function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const MODEL_IDS: Record<string, string> = {
  grok: "xai/grok-imagine-video/image-to-video",
  grok_v15: "xai/grok-imagine-video/v1.5/image-to-video",
  seedance: "bytedance/seedance-2.0/fast/image-to-video",
};

async function uploadToFal(file: File): Promise<string> {
  fal.config({ credentials: FAL_KEY });
  try {
    return await fal.storage.upload(file, { lifecycle: { expiresIn: "1d" } });
  } catch {
    return fal.storage.upload(file);
  }
}

function configureFal() {
  fal.config({ credentials: FAL_KEY });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
    return `${error.name}: ${error.message}${cause}`;
  }

  return String(error);
}

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

// generation_history に初めて記録された場合のみ true を返す（重複ポーリングでの二重処理を防ぐ）
async function saveVideoHistory({
  userId,
  model,
  prompt,
  videoUrl,
  creditsUsed,
}: {
  userId: string;
  model: string;
  prompt: string;
  videoUrl: string;
  creditsUsed: number;
}): Promise<boolean> {
  const adminClient = createAdminSupabaseClient();
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
    .contains("image_urls", [videoUrl])
    .maybeSingle();

  if (existing) return false;

  const historyPrompt = encodeHistoryPrompt({
    kind: "video",
    prompt: `${model === "seedance" ? "Seedance動画" : model === "grok_v15" ? "Grok v1.5動画" : "Grok動画"}: ${prompt}`,
    url: videoUrl,
  });

  const { error } = await adminClient.from("generation_history").insert({
    shop_id: shopId,
    avatar_id: null,
    prompt: historyPrompt,
    image_urls: [videoUrl],
    settings: { media_type: "video" },
    credits_used: creditsUsed,
  });

  if (error) {
    console.error("video history insert failed", error.message);
    return false;
  }
  return true;
}

async function decrementCredits(adminClient: SupabaseClient, shopId: string, currentCredits: number, amount: number) {
  const nextCredits = Math.max(0, currentCredits - amount);
  const { error } = await adminClient.from("shops").update({ credits: nextCredits }).eq("id", shopId);
  if (error) throw new Error(error.message);
  return nextCredits;
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
  if (error) throw new Error(error.message);
  return data;
}

export async function POST(req: NextRequest) {
  try {
    if (!FAL_KEY) {
      return NextResponse.json({ error: "FAL_API_KEY is not configured" }, { status: 500 });
    }
    configureFal();

    const { user, client } = await getAuthenticatedContext(req);
    if (!user) {
      return NextResponse.json({ error: "ログイン状態が切れています。もう一度ログインしてください。" }, { status: 401 });
    }

    const shop = await getShopRecord(client, user.id);
    if (!shop?.id) {
      return NextResponse.json({ error: "ショップ情報が見つかりません。" }, { status: 400 });
    }

    const access = evaluateTabAccess(shop, "video", getRequestIp(req));
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const model = String(formData.get("model") ?? "grok");
    const prompt = String(formData.get("prompt") ?? "natural movement, cinematic");
    const duration = Number(formData.get("duration") ?? 5);
    const resolution = String(formData.get("resolution") ?? "720p");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const modelId = MODEL_IDS[model];
    if (!modelId) {
      return NextResponse.json({ error: "invalid model" }, { status: 400 });
    }

    const creditsNeeded = falVideoCredits(model, duration, resolution);
    if (Number(shop.credits ?? 0) < creditsNeeded) {
      return NextResponse.json({ error: "クレジット不足です。チャージ後に再度お試しください。" }, { status: 402 });
    }

    const imageUrl = await uploadToFal(file);
    const input: Record<string, unknown> = {
      image_url: imageUrl,
      prompt,
      resolution,
    };

    if (model === "seedance") {
      input.duration = Math.min(15, Math.max(4, duration || 5));
      input.aspect_ratio = "auto";
      input.generate_audio = true;
    } else {
      input.duration = duration;
      input.aspect_ratio = "auto";
    }

    const data = await fal.queue.submit(modelId, {
      input,
      priority: "normal",
      storageSettings: { expiresIn: "1d" },
      startTimeout: 900,
    });

    return NextResponse.json({ requestId: data.request_id, model });
  } catch (error) {
    const msg = getErrorMessage(error);
    console.error("video submit failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requestId = searchParams.get("requestId");
  const model = searchParams.get("model") ?? "grok";
  const prompt = searchParams.get("prompt") ?? "video generation";
  const duration = Number(searchParams.get("duration") ?? 5);
  const resolution = searchParams.get("resolution") ?? "720p";

  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  const modelId = MODEL_IDS[model];
  if (!modelId) {
    return NextResponse.json({ error: "invalid model" }, { status: 400 });
  }

  try {
    if (!FAL_KEY) {
      return NextResponse.json({ error: "FAL_API_KEY is not configured" }, { status: 500 });
    }

    const { user, client } = await getAuthenticatedContext(req);
    if (!user) {
      return NextResponse.json({ error: "ログイン状態が切れています。もう一度ログインしてください。" }, { status: 401 });
    }

    const shop = await getShopRecord(client, user.id);
    if (!shop?.id) {
      return NextResponse.json({ error: "ショップ情報が見つかりません。" }, { status: 400 });
    }

    const access = evaluateTabAccess(shop, "video", getRequestIp(req));
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    configureFal();

    const statusData = await fal.queue.status(modelId, {
      requestId,
      logs: true,
    });

    if (statusData.status === "COMPLETED") {
      const result = await fal.queue.result(modelId, { requestId });
      const resultData = result.data as { video?: { url?: string } };
      const falVideoUrl = resultData.video?.url;
      if (!falVideoUrl) {
        throw new Error("result video url is missing");
      }

      let videoUrl = falVideoUrl;
      try {
        videoUrl = await uploadToStorage(falVideoUrl, "video");
      } catch (err) {
        console.error("Video storage upload failed, using fal URL:", err);
      }

      const creditsUsed = falVideoCredits(model, duration, resolution);
      const isNewCompletion = await saveVideoHistory({
        userId: user.id,
        model,
        prompt,
        videoUrl,
        creditsUsed,
      });

      let credits = Number(shop.credits ?? 0);
      if (isNewCompletion) {
        credits = await decrementCredits(createAdminSupabaseClient(), shop.id, credits, creditsUsed);
      }

      return NextResponse.json({ status: "completed", videoUrl, credits });
    }

    return NextResponse.json({
      status: "processing",
      queue_position: statusData.status === "IN_QUEUE" ? statusData.queue_position : undefined,
      falStatus: statusData.status,
      logs: "logs" in statusData ? statusData.logs?.slice(-3).map(log => log.message) : [],
    });
  } catch (error) {
    const msg = getErrorMessage(error);
    console.error("video poll failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
