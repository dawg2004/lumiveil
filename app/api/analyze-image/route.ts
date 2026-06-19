import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const FAL_KEY = process.env.FAL_API_KEY!;
const VISION_MODEL = "fal-ai/moondream/batched";

function createBearerSupabaseClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

async function getUser(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (token) {
    const sb = createBearerSupabaseClient(token);
    const { data: { user } } = await sb.auth.getUser(token);
    if (user) return user;
  }
  const sb = await createServerSupabaseClient();
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

async function uploadToFal(file: File): Promise<string> {
  fal.config({ credentials: FAL_KEY });
  try {
    return await fal.storage.upload(file, { lifecycle: { expiresIn: "1d" } });
  } catch {
    return fal.storage.upload(file);
  }
}

function extractText(item: unknown): string {
  if (typeof item === "string") return item.trim();
  if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    return String(obj.output ?? obj.text ?? obj.answer ?? "").trim();
  }
  return "";
}

export async function POST(req: NextRequest) {
  try {
    if (!FAL_KEY) {
      return NextResponse.json({ error: "FAL_API_KEY is not configured" }, { status: 500 });
    }

    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const formData = await req.formData();
    const imageFile = formData.get("image_file");
    if (!(imageFile instanceof File)) {
      return NextResponse.json({ error: "image_file が必要です" }, { status: 400 });
    }

    fal.config({ credentials: FAL_KEY });
    const imageUrl = await uploadToFal(imageFile);

    const result = await fal.subscribe(VISION_MODEL, {
      input: {
        inputs: [
          {
            image_url: imageUrl,
            prompt:
              "You are an AI image generation expert. Analyze this image and write a detailed English prompt for AI image generation. Describe: the main subject (person/object), physical appearance, clothing/style, background/setting, lighting, mood, camera angle, and visual style. Format as a comma-separated list of descriptive English phrases. Be specific and detailed. Do NOT start with 'The image shows' — just list the phrases directly.",
          },
        ],
      },
    });

    const data = result.data as { outputs?: unknown[] };
    const outputs = Array.isArray(data.outputs) ? data.outputs : [];
    const prompt = extractText(outputs[0]);

    if (!prompt) {
      return NextResponse.json({ error: "プロンプトの生成に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ prompt });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("analyze-image failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
