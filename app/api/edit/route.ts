import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, prompt } = await req.json();
    const response = await fetch("https://fal.run/fal-ai/flux/dev/image-to-image", {
      method: "POST",
      headers: {
        "Authorization": `Key ${process.env.FAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        prompt: prompt,
        strength: 0.75,
        num_inference_steps: 28,
      }),
    });
    const data = await response.json();
    const url = data.images?.[0]?.url;
    if (!url) throw new Error("URL not found");
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json({ error: "編集に失敗しました" }, { status: 500 });
  }
}
