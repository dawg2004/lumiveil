export type BackgroundPreset = "studio" | "hotel" | "park" | "luxury";

export const BACKGROUND_PRESET_LABELS: Record<BackgroundPreset, string> = {
  studio: "フォトスタジオ風",
  hotel: "ホテルラウンジ風",
  park: "公園",
  luxury: "室内ラグジュアリー風",
};

export const BACKGROUND_PROMPTS: Record<BackgroundPreset, string> = {
  studio:
    "Change only the background to a professional photo studio backdrop with soft neutral gray or gradient background and clean studio lighting. Keep the subject, pose, outfit, and framing unchanged.",
  hotel:
    "Change only the background to an elegant hotel lounge interior with warm ambient lighting and upscale furnishings. Keep the subject, pose, outfit, and framing unchanged.",
  park:
    "Change only the background to a natural outdoor park setting with greenery and soft daylight. Keep the subject, pose, outfit, and framing unchanged.",
  luxury:
    "Change only the background to a luxurious indoor interior with elegant furniture and soft warm lighting. Keep the subject, pose, outfit, and framing unchanged.",
};

export const BACKGROUND_COMPOSITE_PROMPT =
  "The first image contains the main subject. The second image is the desired background. Cut out the subject naturally from the first image, remove any person already present in the second image if there is one, and composite the subject into the second image's background. Match perspective, scale, lighting direction, and color tone so the result looks natural and seamless. Keep the subject's identity, pose, and outfit unchanged.";
