export type ToolType =
  | "mosaic"
  | "background"
  | "beauty"
  | "brightness"
  | "pose";

export type AppStep =
  | "waiting_user_photo"
  | "photo_uploaded_menu"
  | "mosaic_menu"
  | "background_menu"
  | "waiting_background_photo"
  | "waiting_background_confirm"
  | "beauty_menu"
  | "brightness_menu"
  | "pose_menu"
  | "processing"
  | "completed"
  | "rejected";

export type ChatEvent =
  | "chat_opened"
  | "user_photo_uploaded"
  | "tool_selected"
  | "background_photo_uploaded"
  | "confirm_go"
  | "reset_session"
  | "continue_with_result";

export type EditSession = {
  sessionId: string;
  step: AppStep;
  sourceImageUrl?: string;
  backgroundImageUrl?: string;
  resultImageUrl?: string;
  selectedTool?: ToolType;
  options?: {
    mosaicScope?: "face" | "eyes_only" | "bust_up";
    mosaicStyle?: "blur" | "gaussian" | "mosaic";
    mosaicStrength?: 1 | 2 | 3 | 4 | 5;
    backgroundPreset?: "studio" | "hotel" | "park" | "luxury" | "merge";
    beautyMode?: "natural" | "strong" | "blemish_only";
    brightnessMode?: "natural" | "bright" | "calm";
    poseMode?: "elegant" | "hide_face" | "sofa" | "standing";
  };
};

export type ChatRequest = {
  sessionId?: string;
  event: ChatEvent;
  tool?: ToolType;
  imageUrl?: string;
  backgroundImageUrl?: string;
};

export type ChatResponse = {
  state: AppStep;
  message?: string;
  menu?: string[];
  session: EditSession;
  next?: {
    endpoint?: string;
    method?: "POST";
  };
};
