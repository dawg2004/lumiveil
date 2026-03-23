import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, prompt } = await req.json();
    const response = await fetch("https://fal.run/fal-ai/kling-video/v1.6/standard/image-to-video", {
      method: "POST",
      headers: {
        "Authorization": `Key ${process.env.FAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        prompt: prompt || "natural movement, cinematic",
        duration: "5",
      }),
    });
    const data = await response.json();
    const url = data.video?.url;
    if (!url) throw new Error("Video URL not found");
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json({ error: "動画生成に失敗しました" }, { status: 500 });
  }
}
