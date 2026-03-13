const FAL_API_URL = "https://fal.run/fal-ai/instant-id";

const BACKGROUNDS: Record<string, string> = {
  studio: "professional photo studio, clean white background, soft lighting",
  outdoor: "beautiful outdoor garden, natural lighting, bokeh background",
  hotel: "luxury hotel lobby, elegant interior, warm lighting",
  japanese_inn: "traditional japanese inn ryokan, tatami floor, shoji screens",
  beach: "tropical resort beach, white sand, crystal clear water, sunset",
  lounge: "high-end lounge bar, dim moody lighting, velvet seating",
};

export async function generateImage(
  imageUrl: string,
  prompt: string,
  background: string = "studio"
): Promise<string> {
  const bgPrompt = BACKGROUNDS[background] || BACKGROUNDS.studio;
  const fullPrompt = `${prompt}, ${bgPrompt}, professional photography, high quality, 8k`;

  const response = await fetch(FAL_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Key ${process.env.FAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: imageUrl,
      prompt: fullPrompt,
      negative_prompt: "ugly, blurry, low quality, distorted",
      num_inference_steps: 30,
      guidance_scale: 7.5,
    }),
  });

  if (!response.ok) {
    throw new Error(`FAL API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.images[0].url;
}
