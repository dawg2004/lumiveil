import { NextRequest, NextResponse } from "next/server";
import { generateImage } from "@/lib/fal";
import { createClient } from "@supabase/supabase-js";
import { uploadToStorage } from "@/lib/upload-to-storage";
import { evaluateTabAccess, getRequestIp } from "@/lib/access-control";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
const HISTORY_PREFIX = "LUMIVEIL_HISTORY::";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    const { data: { user } } = await getAdminClient().auth.getUser(token!);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { imageUrl, prompt, background, avatarId } = await req.json();
    if (!imageUrl || !prompt) {
      return NextResponse.json({ error: "imageUrlとpromptは必須です" }, { status: 400 });
    }

    const { data: shop } = await getAdminClient()
      .from("shops")
      .select("id, allowed_tabs, last_login_ip")
      .eq("user_id", user.id)
      .maybeSingle();

    const access = evaluateTabAccess(shop, "generate", getRequestIp(req));
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const falUrl = await generateImage(imageUrl, prompt, background);

    let storedUrl = falUrl;
    try {
      storedUrl = await uploadToStorage(falUrl, "image");
    } catch (err) {
      console.error("Storage upload failed, falling back to fal URL:", err);
    }

    await getAdminClient().from("generation_history").insert({
      shop_id: shop?.id ?? user.id,
      avatar_id: avatarId || null,
      prompt: `${HISTORY_PREFIX}${JSON.stringify({ kind: "image", prompt, url: storedUrl })}`,
      image_urls: [storedUrl],
      credits_used: 1,
    });

    return NextResponse.json({ url: storedUrl });
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json({ error: "画像生成に失敗しました" }, { status: 500 });
  }
}

