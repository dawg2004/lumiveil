const FAL_API_URL = "https://fal.run/fal-ai/instant-id";
const FAL_KEY = process.env.FAL_API_KEY!;

export type GenerateImageParams = {
  faceImageUrl: string;
  prompt: string;
  negativePrompt?: string;
  numImages?: number;
  imageSize?: "portrait_4_3" | "portrait_16_9" | "square_hd";
  guidanceScale?: number;
};

export type GenerateImageResult = {
  images: { url: string; width: number; height: number }[];
  timings: { inference: number };
  seed: number;
};

const LOCATION_PROMPTS: Record<string, string> = {
  white_classic: "elegant white classical studio, marble floor, vintage antique sofa, soft diffused window light, luxury interior",
  luxury_hotel: "luxury hotel room, floor-to-ceiling windows, city skyline view, warm ambient lighting, king size bed, premium decor",
  outdoor_night: "outdoor night cityscape, neon lights bokeh background, atmospheric fog, dramatic evening lighting",
  japanese_inn: "traditional japanese inn ryokan, tatami floor, shoji paper screen, zen garden view, warm lantern light",
  beach: "tropical resort beach, white sand, crystal clear turquoise ocean, palm trees, golden hour sunlight",
  lounge: "high-end lounge bar, dim moody lighting, velvet

cat > ~/lumiveil/lib/fal.ts << 'ENDOFFILE'
const FAL_API_URL = "https://fal.run/fal-ai/instant-id";
const FAL_KEY = process.env.FAL_API_KEY!;

export type GenerateImageParams = {
  faceImageUrl: string;
  prompt: string;
  negativePrompt?: string;
  numImages?: number;
  imageSize?: "portrait_4_3" | "portrait_16_9" | "square_hd";
  guidanceScale?: number;
};

export type GenerateImageResult = {
  images: { url: string; width: number; height: number }[];
  timings: { inference: number };
  seed: number;
};

const LOCATION_PROMPTS: Record<string, string> = {
  white_classic: "elegant white classical studio, marble floor, vintage antique sofa, soft diffused window light, luxury interior",
  luxury_hotel: "luxury hotel room, floor-to-ceiling windows, city skyline view, warm ambient lighting, king size bed, premium decor",
  outdoor_night: "outdoor night cityscape, neon lights bokeh background, atmospheric fog, dramatic evening lighting",
  japanese_inn: "traditional japanese inn ryokan, tatami floor, shoji paper screen, zen garden view, warm lantern light",
  beach: "tropical resort beach, white sand, crystal clear turquoise ocean, palm trees, golden hour sunlight",
  lounge: "high-end lounge bar, dim moody lighting, velvet seating, crystal glassware, sophisticated atmosphere",
};

const COSTUME_PROMPTS: Record<string, string> = {
  knee_dress: "elegant knee-length dress, feminine silhouette, flowing fabric, sophisticated style",
  kimono: "beautiful traditional japanese kimono, intricate pattern, obi sash belt, graceful elegant pose",
  santa: "festive santa christmas costume, red velvet with white trim, seasonal holiday theme",
  school: "school uniform blazer, plaid pleated skirt, neat appearance, youthful style",
  casual: "stylish casual outfit, natural relaxed look, contemporary fashion",
  black_dress: "sleek black evening dress, sophisticated allure, elegant neckline, premium fabric",
};

const POSE_PROMPTS: Record<string, string> = {
  floor_sit: "sitting gracefully on floor, legs to one side, upper body upright, looking at camera with soft expression",
  standing: "standing pose, confident elegant posture, slight natural lean, direct camera gaze",
  sofa: "relaxed on sofa, natural comfortable pose, one arm resting, warm inviting expression",
  selfie: "selfie angle, slightly raised camera perspective, casual natural expression, close-up framing",
};

const HAIR_LENGTH_PROMPTS: Record<string, string> = {
  ショート: "short hair", ボブ: "bob cut hair", ミディアム: "medium length hair",
  ロング: "long flowing hair", 超ロング: "very long straight hair past waist",
};

const HAIR_COLOR_PROMPTS: Record<string, string> = {
  黒髪: "black hair", 茶髪: "warm brown hair", 金髪: "blonde hair",
  ピンク: "soft pink hair", グレー: "silver gray hair",
};

export function buildPrompt(params: {
  location: string; costume: string; pose: string;
  hairLength: string; hairColor: string; gender: "female" | "male";
}): string {
  const { location, costume, pose, hairLength, hairColor, gender } = params;
  const genderPrompt = gender === "female"
    ? "1girl, beautiful japanese woman, flawless skin, natural makeup"
    : "1boy, handsome japanese man, clean appearance";
  const parts = [
    "professional photo", genderPrompt,
    HAIR_COLOR_PROMPTS[hairColor] || "", HAIR_LENGTH_PROMPTS[hairLength] || "",
    LOCATION_PROMPTS[location] || "", COSTUME_PROMPTS[costume] || "",
    POSE_PROMPTS[pose] || "",
    "photorealistic, high quality, 8k resolution, professional photography",
    "studio lighting, sharp focus, detailed skin texture",
  ].filter(Boolean);
  return parts.join(", ");
}

export const DEFAULT_NEGATIVE_PROMPT = [
  "ugly, deformed, disfigured, bad anatomy, blurry",
  "low quality, pixelated, noise, grain",
  "multiple people, group photo", "text, watermark, logo",
  "unrealistic, cartoon, anime style",
].join(", ");

export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  const response = await fetch(FAL_API_URL, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      face_image_url: params.faceImageUrl,
      prompt: params.prompt,
      negative_prompt: params.negativePrompt || DEFAULT_NEGATIVE_PROMPT,
      num_images: params.numImages || 4,
      image_size: params.imageSize || "portrait_4_3",
      guidance_scale: params.guidanceScale || 7.5,
      ip_adapter_scale: 0.8,
      controlnet_conditioning_scale: 0.8,
      enable_safety_checker: false,
    }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`FAL.ai API error: ${error.detail || response.statusText}`);
  }
  return response.json();
}
