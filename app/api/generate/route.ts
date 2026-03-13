import { NextRequest, NextResponse } from "next/server";
import { generateImage, buildPrompt, DEFAULT_NEGATIVE_PROMPT } from "@/lib/fal";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const body = await req.json();
    const { avatarId, location, costume, pose, hairLength, hairColor, gender, count } = body;

    if (!avatarId || !location || !costume || !pose) {
      return NextResponse.json({ error: "必須パラメータが不足しています" }, { status: 400 });
    }

    const { data: shopData } = await supabase
      .from("shops").select("id, credits").eq("user_id", user.id).single();

    if (!shopData) return NextResponse.json({ error: "店舗情報が見つかりません" }, { status: 404 });
    if (shopData.credits < count) {
      return NextResponse.json({ error: `クレジットが不足しています（残り${shopData.credits}枚）` }, { status: 402 });
    }

    const { data: avatarData } = await supabase
      .from("avatars").select("face_image_url")
      .eq("id", avatarId).eq("shop_id", shopData.id).single();

    if (!avatarData) return NextResponse.json({ error: "アバターが見つかりません" }, { status: 404 });

    const prompt = buildPrompt({ location, costume, pose, hairLength, hairColor, gender });

    const results = [];
    const batchSize = 4;
    for (let i = 0; i < count; i += batchSize) {
      const batchCount = Math.min(batchSize, count - i);
      const result = await generateImage({
        faceImageUrl: avatarData.face_image_url,
        prompt,
        negativePrompt: DEFAULT_NEGATIVE_PROMPT,
        numImages: batchCount,
        imageSize: "portrait_4_3",
      });
      results.push(...result.images);
    }

    const savedImages = await Promise.all(
      results.map(async (img, i) => {
        const imageRes = await fetch(img.url);
        const blob = await imageRes.blob();
        const fileName = `${user.id}/${avatarId}/${Date.now()}_${i}.jpg`;
        await supabase.storage.from("generated-images").upload(fileName, blob, { contentType: "image/jpeg" });
        const { data: { publicUrl } } = supabase.storage.from("generated-images").getPublicUrl(fileName);
        return publicUrl;
      })
    );

    await supabase.from("generation_history").insert({
      shop_id: shopData.id, avatar_id: avatarId, prompt,
      image_urls: savedImages, settings: { location, costume, pose, hairLength, hairColor, gender },
      credits_used: count,
    });

    await supabase.from("shops").update({ credits: shopData.credits - count }).eq("user_id", user.id);

    return NextResponse.json({ success: true, images: savedImages, creditsRemaining: shopData.credits - count });
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json({ error: "画像生成中にエラーが発生しました" }, { status: 500 });
  }
}
