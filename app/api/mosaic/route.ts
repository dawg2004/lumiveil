import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, mode, area, strength } = await req.json();

    if (!imageUrl) {
      return NextResponse.json({ error: "imageUrlは必須です" }, { status: 400 });
    }

    const strengthMap: Record<string, number> = {
      "弱": 0.2,
      "中": 0.5,
      "強": 0.8,
      "最強": 1.0,
    };

    const blurStrength = strengthMap[strength] || 0.5;

    const response = await fetch("https://fal.run/fal-ai/face-blur", {
      method: "POST",
      headers: {
        "Authorization": `Key ${process.env.FAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        blur_type: mode === "gaussian" ? "gaussian" : "blur",
        blur_strength: blurStrength,
        face_region: area === "顔全体" ? "full" : area === "目元のみ" ? "eyes" : "mouth",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`FAL API error: ${err}`);
    }

    const data = await response.json();
    const resultUrl = data.image?.url || data.images?.[0]?.url;

    return NextResponse.json({ url: resultUrl });
  } catch (error) {
    console.error("Mosaic error:", error);
    return NextResponse.json({ error: "モザイク処理に失敗しました" }, { status: 500 });
  }
}
