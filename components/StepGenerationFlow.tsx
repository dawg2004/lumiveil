"use client";

import {
  type ChangeEvent,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { detectFirstFace, type FaceBox } from "@/lib/faceDetector";
import {
  BACKGROUND_COMPOSITE_PROMPT,
  BACKGROUND_PRESET_LABELS,
  BACKGROUND_PROMPTS,
  type BackgroundPreset,
} from "@/lib/background-prompts";
import type { AppStep, ChatResponse, ToolType } from "@/types/chat";

type HistoryEntry = {
  id: string;
  role: "bot" | "user";
  text: string;
  image?: string;
};

type MosaicScope = "face" | "eyes_only" | "bust_up";
type MosaicStyle = "blur" | "gaussian" | "mosaic";
type MosaicStrength = 1 | 2 | 3 | 4 | 5;
type BeautyMode = "natural" | "strong" | "blemish_only";
type BrightnessMode = "natural" | "bright" | "calm";
type PoseMode = "elegant" | "hide_face" | "sofa" | "standing";
type ImageSize = {
  width: number;
  height: number;
};
type DragState =
  | {
      mode: "move" | "resize";
      pointerId: number;
      startX: number;
      startY: number;
      initialFaceBox: FaceBox;
    }
  | null;

const TEXT = {
  appName: "Lumiveil GPTs",
  title: "Chat Flow",
  home: "ホームへ戻る",
  newSession: "新規セッション",
  uploadPrompt: "人物写真をアップロードしてください。",
  userPhoto: "人物写真を選ぶ",
  backgroundPhoto: "背景写真を選ぶ",
  sourceImage: "元画像",
  resultImage: "結果画像",
  backgroundUploadHint: "背景合成を選んだときに有効になります",
  imageSelectHint: "画像ファイルを選択",
  completedMenu1: "調整、別の写真に変更",
  completedMenu2: "新規修正",
  completedMenu3: "このまま続ける",
  go: "Go!",
  revise: "修正する",
  runMosaic: "モザイク処理を実行",
  runBeauty: "美肌補正を実行",
  runBrightness: "明るさ調整を実行",
  runPose: "ポーズ変更を実行",
  processMosaic: "モザイク処理中...",
  detectFace: "顔を検出中...",
  processBackground: "背景を自然に合成中...",
  processBeauty: "美肌補正中...",
  processBrightness: "明るさを調整中...",
  processPose: "ポーズを整えています...",
  processStudio: "フォトスタジオ風へ背景変更中...",
  processHotel: "ホテルラウンジ風へ背景変更中...",
  processPark: "公園背景へ変更中...",
  processLuxury: "室内ラグジュアリー風へ背景変更中...",
  mosaicError: "モザイク処理に失敗しました。",
  editError: "処理に失敗しました。",
  chatError: "チャット状態の更新に失敗しました。",
  recoveryTitle: "生成が止まっている可能性があります。",
  recoveryBody: "まず一番軽い設定でやり直してください。",
  recoveryReupload: "1. 写真を1枚だけアップロードし直す",
  recoveryMosaicOnly: "2. モザイク処理だけ実行",
  recoveryBrightnessOnly: "3. 明るさ調整だけ実行",
  recoverySplit: "4. 処理を分けて実行",
  recoveryRestart: "5. 最初からやり直す",
  detectAgain: "顔を再検出",
  adjustBox: "検出枠を微調整",
  moveBox: "位置",
  resizeBox: "サイズ",
  moveUp: "上",
  moveDown: "下",
  moveLeft: "左",
  moveRight: "右",
  growBox: "拡大",
  shrinkBox: "縮小",
  faceGuide: "黄色の枠がモザイク対象の基準です。",
  beforeLabel: "Before",
  afterLabel: "After",
  sliderHint: "スライダーを動かして比較",
};

const MENU = {
  tools: [
    { label: "モザイク処理", tool: "mosaic" as ToolType, icon: "🎭" },
    { label: "背景変更", tool: "background" as ToolType, icon: "🖼️" },
    { label: "美肌補正", tool: "beauty" as ToolType, icon: "✨" },
    { label: "明るさ調整", tool: "brightness" as ToolType, icon: "☀️" },
    { label: "ポーズ変更", tool: "pose" as ToolType, icon: "🧍" },
  ],
  mosaicScopes: [
    { label: "顔全体", value: "face" as MosaicScope },
    { label: "目元のみ", value: "eyes_only" as MosaicScope },
    { label: "バストアップ", value: "bust_up" as MosaicScope },
  ],
  mosaicStyles: [
    { label: "ブラー", value: "blur" as MosaicStyle },
    { label: "ガウス", value: "gaussian" as MosaicStyle },
    { label: "モザイク", value: "mosaic" as MosaicStyle },
  ],
  mosaicStrengths: [
    { label: "弱い", value: 1 as MosaicStrength },
    { label: "やや弱い", value: 2 as MosaicStrength },
    { label: "標準", value: 3 as MosaicStrength },
    { label: "やや強い", value: 4 as MosaicStrength },
    { label: "強い", value: 5 as MosaicStrength },
  ],
  beautyModes: [
    { label: "ナチュラル", value: "natural" as BeautyMode },
    { label: "しっかり補正", value: "strong" as BeautyMode },
    { label: "クマ・ニキビのみ除去", value: "blemish_only" as BeautyMode },
  ],
  brightnessModes: [
    { label: "自然補正", value: "natural" as BrightnessMode },
    { label: "明るめ", value: "bright" as BrightnessMode },
    { label: "落ち着いたトーン", value: "calm" as BrightnessMode },
  ],
  poseModes: [
    { label: "エレガント", value: "elegant" as PoseMode },
    { label: "顔を片手で隠す", value: "hide_face" as PoseMode },
    { label: "ソファに座る", value: "sofa" as PoseMode },
    { label: "立ち姿を整える", value: "standing" as PoseMode },
  ],
};

const BEAUTY_PROMPTS: Record<BeautyMode, string> = {
  natural:
    "Apply light, natural-looking skin retouching: even out skin tone and reduce minor blemishes while keeping visible skin texture. Do not change facial structure or identity.",
  strong:
    "Apply noticeably smoother, polished skin retouching while keeping the face looking realistic. Do not change facial structure or identity.",
  blemish_only:
    "Only remove dark under-eye circles and acne or blemishes from the skin. Do not smooth or alter skin texture elsewhere, and do not change facial structure or identity.",
};

const BRIGHTNESS_PROMPTS: Record<BrightnessMode, string> = {
  natural:
    "Apply a natural, balanced brightness and color correction to the whole photo without changing the subject or background content.",
  bright:
    "Make the overall photo brighter and slightly more vivid while keeping it natural. Do not change the subject or background content.",
  calm:
    "Apply a calmer, slightly muted and warmer tone to the overall photo. Do not change the subject or background content.",
};

const POSE_PROMPTS: Record<PoseMode, string> = {
  elegant:
    "Adjust the subject's pose to a graceful, elegant standing or sitting posture appropriate for a portrait, keeping the same location, outfit, and identity.",
  hide_face:
    "Adjust the subject's pose so one hand gently covers part of the face in a natural way, keeping the same location, outfit, and identity.",
  sofa:
    "Adjust the subject's pose to sitting naturally on a sofa, keeping the same location style, outfit, and identity.",
  standing:
    "Adjust the subject's pose to a neat, well-composed standing posture, keeping the same location, outfit, and identity.",
};

const FALLBACK_FACE_BOX = (imageSize: ImageSize): FaceBox => ({
  x: Math.floor(imageSize.width * 0.2),
  y: Math.floor(imageSize.height * 0.12),
  width: Math.floor(imageSize.width * 0.6),
  height: Math.floor(imageSize.height * 0.62),
});

function labelFor<T extends string | number>(items: Array<{ label: string; value: T }>, value: T): string {
  return items.find((item) => item.value === value)?.label ?? String(value);
}

const STATE_PROMPTS: Partial<Record<AppStep, string>> = {
  photo_uploaded_menu: "どの加工をしますか？",
  mosaic_menu: "モザイクの範囲・種類・強度を選んでください。",
  background_menu: "背景の候補を選んでください。",
  beauty_menu: "美肌補正の種類を選んでください。",
  brightness_menu: "明るさの調整方法を選んでください。",
  pose_menu: "ポーズを選んでください。",
  completed: "仕上がりはいかがですか？",
};

export default function StepGenerationFlow({
  embedded = false,
  initialFile = null,
  onInitialFileConsumed,
}: {
  embedded?: boolean;
  initialFile?: File | null;
  onInitialFileConsumed?: () => void;
} = {}) {
  const [chat, setChat] = useState<ChatResponse>({
    state: "waiting_user_photo",
    message: TEXT.uploadPrompt,
    session: {
      sessionId: "local-bootstrap",
      step: "waiting_user_photo",
      options: {},
    },
  });
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceImageSize, setSourceImageSize] = useState<ImageSize | null>(null);
  const [detectedFaceBox, setDetectedFaceBox] = useState<FaceBox | null>(null);
  const [faceBox, setFaceBox] = useState<FaceBox | null>(null);
  const [mosaicScope, setMosaicScope] = useState<MosaicScope>("face");
  const [mosaicStyle, setMosaicStyle] = useState<MosaicStyle>("blur");
  const [mosaicStrength, setMosaicStrength] = useState<MosaicStrength>(3);
  const [beautyMode, setBeautyMode] = useState<BeautyMode>("natural");
  const [brightnessMode, setBrightnessMode] = useState<BrightnessMode>("natural");
  const [poseMode, setPoseMode] = useState<PoseMode>("elegant");
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [lastTool, setLastTool] = useState<ToolType | null>(null);
  const [beforeStepFile, setBeforeStepFile] = useState<File | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [compareRatio, setCompareRatio] = useState(50);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const historyIdRef = useRef(0);
  const feedRef = useRef<HTMLDivElement | null>(null);

  const nextHistoryId = useCallback(() => {
    historyIdRef.current += 1;
    return `msg-${historyIdRef.current}`;
  }, []);

  const pushTurn = useCallback(
    (userText: string, options?: { userImage?: string; botImage?: string }) => {
      const botText = chat.message ?? STATE_PROMPTS[chat.state] ?? "";
      setHistory((current) => [
        ...current,
        { id: nextHistoryId(), role: "bot", text: botText, image: options?.botImage },
        { id: nextHistoryId(), role: "user", text: userText, image: options?.userImage },
      ]);
    },
    [chat.message, chat.state, nextHistoryId]
  );

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [history, busyLabel, recovery, chat.state]);

  const postChat = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: chat.session.sessionId,
          ...body,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? TEXT.chatError);
      }

      const data = (await response.json()) as ChatResponse;
      setChat(data);
      return data;
    },
    [chat.session.sessionId]
  );

  async function detectFaceOrFallback(file: File, imageSize: ImageSize) {
    const detected = await detectFirstFace(file);
    return detected ?? FALLBACK_FACE_BOX(imageSize);
  }

  async function loadSourceFile(file: File, userText = "写真をアップロードしました") {
    setSourceFile(file);
    const bitmap = await createImageBitmap(file);
    const imageSize = { width: bitmap.width, height: bitmap.height };
    bitmap.close();

    setSourceImageSize(imageSize);
    const detected = await detectFaceOrFallback(file, imageSize);
    setDetectedFaceBox(detected);
    setFaceBox(regionBoxForScope(detected, mosaicScope, imageSize));

    const imageUrl = URL.createObjectURL(file);
    pushTurn(userText, { userImage: imageUrl });
    try {
      await postChat({ event: "user_photo_uploaded", imageUrl });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : TEXT.chatError);
    }
  }

  useEffect(() => {
    if (!initialFile) return;
    void loadSourceFile(initialFile, "履歴から写真を読み込みました");
    onInitialFileConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  async function handleSourceImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await loadSourceFile(file);
    event.target.value = "";
  }

  async function handleBackgroundImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBackgroundFile(file);
    const backgroundImageUrl = URL.createObjectURL(file);
    pushTurn("背景写真をアップロードしました", { userImage: backgroundImageUrl });
    try {
      await postChat({
        event: "background_photo_uploaded",
        backgroundImageUrl,
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : TEXT.chatError);
    }
    event.target.value = "";
  }

  async function selectTool(tool: ToolType, label: string) {
    pushTurn(label);
    try {
      await postChat({ event: "tool_selected", tool });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : TEXT.chatError);
    }
  }

  async function completeStep(resultImageUrl: string) {
    await postChat({ event: "processing_completed", resultImageUrl });
  }

  function showRecovery() {
    setBusyLabel(null);
    setRecovery(`${TEXT.recoveryTitle}\n${TEXT.recoveryBody}`);
  }

  function handleRunFailure(error: unknown) {
    const message = error instanceof Error ? error.message : "";
    const isTimeout = error instanceof DOMException && error.name === "AbortError";
    const isKnownReason = message && message !== TEXT.mosaicError && message !== TEXT.editError;

    if (!isTimeout && isKnownReason) {
      setBusyLabel(null);
      window.alert(message);
      return;
    }

    showRecovery();
  }

  function buildEditFormData(file: File, prompt: string, file2?: File) {
    const formData = new FormData();
    formData.set("file", file);
    formData.set("prompt", prompt);
    formData.set("resolution", "1k");
    if (file2) formData.set("file2", file2);
    return formData;
  }

  async function runEditRequest(formData: FormData, label: string): Promise<string> {
    setBusyLabel(label);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 75000);

    try {
      const response = await fetch("/api/edit", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? TEXT.editError);
      }

      const data = (await response.json()) as { url?: string };
      if (!data.url) {
        throw new Error(TEXT.editError);
      }

      return data.url;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function refreshSourceFromResult(resultUrl: string) {
    const response = await fetch(resultUrl);
    const blob = await response.blob();
    const file = new File([blob], "step-result.jpg", { type: blob.type || "image/jpeg" });

    setSourceFile(file);
    setBeforeStepFile(file);

    const bitmap = await createImageBitmap(file);
    const imageSize = { width: bitmap.width, height: bitmap.height };
    bitmap.close();

    setSourceImageSize(imageSize);
    const detected = await detectFaceOrFallback(file, imageSize);
    setDetectedFaceBox(detected);
    setFaceBox(regionBoxForScope(detected, mosaicScope, imageSize));
  }

  async function runMosaic() {
    if (!sourceFile) return;

    setBeforeStepFile(sourceFile);
    setLastTool("mosaic");
    pushTurn(
      `${labelFor(MENU.mosaicScopes, mosaicScope)} / ${labelFor(MENU.mosaicStyles, mosaicStyle)} / ${labelFor(MENU.mosaicStrengths, mosaicStrength)} で実行`
    );
    setBusyLabel(TEXT.detectFace);
    await postChat({ event: "confirm_go" });

    try {
      const detected =
        detectedFaceBox ??
        (sourceImageSize
          ? await detectFaceOrFallback(sourceFile, sourceImageSize)
          : null);

      if (!detected) {
        throw new Error(TEXT.mosaicError);
      }

      const activeFaceBox =
        faceBox ?? regionBoxForScope(detected, mosaicScope, sourceImageSize);

      setDetectedFaceBox(detected);
      setFaceBox(activeFaceBox);
      setBusyLabel(TEXT.processMosaic);

      const modeMap: Record<MosaicStyle, string> = {
        blur: "ブラー",
        gaussian: "ガウス",
        mosaic: "モザイク",
      };

      const formData = new FormData();
      formData.set("file", sourceFile);
      formData.set("scope", mosaicScope);
      formData.set("mode", modeMap[mosaicStyle]);
      formData.set("strength", String(mosaicStrength));
      formData.set("x", String(activeFaceBox.x));
      formData.set("y", String(activeFaceBox.y));
      formData.set("width", String(activeFaceBox.width));
      formData.set("height", String(activeFaceBox.height));
      formData.set("boxMode", "region");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 75000);
      let response: Response;
      try {
        response = await fetch("/api/mosaic", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? TEXT.mosaicError);
      }

      const blob = await response.blob();
      const resultImageUrl = URL.createObjectURL(blob);
      await completeStep(resultImageUrl);
    } catch (error) {
      handleRunFailure(error);
    } finally {
      setBusyLabel(null);
    }
  }

  async function runBackgroundPreset(preset: BackgroundPreset, label: string) {
    if (!sourceFile) return;

    setBeforeStepFile(sourceFile);
    setLastTool("background");
    pushTurn(BACKGROUND_PRESET_LABELS[preset]);

    try {
      await postChat({ event: "confirm_go" });
      const url = await runEditRequest(buildEditFormData(sourceFile, BACKGROUND_PROMPTS[preset]), label);
      await completeStep(url);
    } catch (error) {
      handleRunFailure(error);
    } finally {
      setBusyLabel(null);
    }
  }

  async function runBackgroundComposite() {
    if (!sourceFile || !backgroundFile) return;

    setBeforeStepFile(sourceFile);
    setLastTool("background");
    pushTurn(TEXT.go);

    try {
      await postChat({ event: "confirm_go" });
      const url = await runEditRequest(
        buildEditFormData(sourceFile, BACKGROUND_COMPOSITE_PROMPT, backgroundFile),
        TEXT.processBackground
      );
      await completeStep(url);
    } catch (error) {
      handleRunFailure(error);
    } finally {
      setBusyLabel(null);
    }
  }

  async function runBeauty() {
    if (!sourceFile) return;

    setBeforeStepFile(sourceFile);
    setLastTool("beauty");
    pushTurn(`${labelFor(MENU.beautyModes, beautyMode)} で実行`);

    try {
      await postChat({ event: "confirm_go" });
      const url = await runEditRequest(buildEditFormData(sourceFile, BEAUTY_PROMPTS[beautyMode]), TEXT.processBeauty);
      await completeStep(url);
    } catch (error) {
      handleRunFailure(error);
    } finally {
      setBusyLabel(null);
    }
  }

  async function runBrightness() {
    if (!sourceFile) return;

    setBeforeStepFile(sourceFile);
    setLastTool("brightness");
    pushTurn(`${labelFor(MENU.brightnessModes, brightnessMode)} で実行`);

    try {
      await postChat({ event: "confirm_go" });
      const url = await runEditRequest(
        buildEditFormData(sourceFile, BRIGHTNESS_PROMPTS[brightnessMode]),
        TEXT.processBrightness
      );
      await completeStep(url);
    } catch (error) {
      handleRunFailure(error);
    } finally {
      setBusyLabel(null);
    }
  }

  async function runPose() {
    if (!sourceFile) return;

    setBeforeStepFile(sourceFile);
    setLastTool("pose");
    pushTurn(`${labelFor(MENU.poseModes, poseMode)} で実行`);

    try {
      await postChat({ event: "confirm_go" });
      const url = await runEditRequest(buildEditFormData(sourceFile, POSE_PROMPTS[poseMode]), TEXT.processPose);
      await completeStep(url);
    } catch (error) {
      handleRunFailure(error);
    } finally {
      setBusyLabel(null);
    }
  }

  function rerunLastTool() {
    if (lastTool === "mosaic") return runMosaic();
    if (lastTool === "beauty") return runBeauty();
    if (lastTool === "brightness") return runBrightness();
    if (lastTool === "pose") return runPose();
    return Promise.resolve();
  }

  async function handleCompletedAdjust() {
    pushTurn(TEXT.completedMenu1, { botImage: chat.session.resultImageUrl });
    if (beforeStepFile) setSourceFile(beforeStepFile);
    if (lastTool) await postChat({ event: "tool_selected", tool: lastTool });
  }

  async function handleCompletedRevise() {
    const resultUrl = chat.session.resultImageUrl;
    if (!resultUrl) return;
    pushTurn(TEXT.completedMenu2, { botImage: resultUrl });
    await postChat({ event: "continue_with_result" });
    await refreshSourceFromResult(resultUrl);
    if (lastTool) await postChat({ event: "tool_selected", tool: lastTool });
    else await rerunLastTool();
  }

  async function handleCompletedContinue() {
    const resultUrl = chat.session.resultImageUrl;
    pushTurn(TEXT.completedMenu3, { botImage: resultUrl });
    if (resultUrl) await refreshSourceFromResult(resultUrl);
    await postChat({ event: "continue_with_result" });
  }

  function resetAllLocalState() {
    setBusyLabel(null);
    setSourceFile(null);
    setSourceImageSize(null);
    setDetectedFaceBox(null);
    setFaceBox(null);
    setBackgroundFile(null);
    setLastTool(null);
    setBeforeStepFile(null);
    setHistory([]);
  }

  async function handleRecoveryReupload() {
    setRecovery(null);
    resetAllLocalState();
    await postChat({ event: "reset_session" });
  }

  async function handleRecoveryMosaicOnly() {
    setRecovery(null);
    if (beforeStepFile) setSourceFile(beforeStepFile);
    await postChat({ event: "tool_selected", tool: "mosaic" });
  }

  async function handleRecoveryBrightnessOnly() {
    setRecovery(null);
    if (beforeStepFile) setSourceFile(beforeStepFile);
    await postChat({ event: "tool_selected", tool: "brightness" });
  }

  function handleRecoverySplit() {
    setRecovery(null);
    if (beforeStepFile) setSourceFile(beforeStepFile);
    setChat((current) => ({
      ...current,
      state: "photo_uploaded_menu",
      message: undefined,
      menu: ["1. モザイク処理", "2. 背景変更", "3. 美肌補正", "4. 明るさ調整", "5. ポーズ変更"],
      session: { ...current.session, step: "photo_uploaded_menu", selectedTool: undefined },
    }));
  }

  async function handleRecoveryRestart() {
    setRecovery(null);
    resetAllLocalState();
    await postChat({ event: "reset_session" });
  }

  async function redetectFace() {
    if (!sourceFile || !sourceImageSize) return;
    setBusyLabel(TEXT.detectFace);
    try {
      const detected = await detectFaceOrFallback(sourceFile, sourceImageSize);
      setDetectedFaceBox(detected);
      setFaceBox(regionBoxForScope(detected, mosaicScope, sourceImageSize));
    } finally {
      setBusyLabel(null);
    }
  }

  function handleScopeChange(scope: MosaicScope) {
    setMosaicScope(scope);
    if (detectedFaceBox && sourceImageSize) {
      setFaceBox(regionBoxForScope(detectedFaceBox, scope, sourceImageSize));
    }
  }

  function nudgeFaceBox(dx: number, dy: number) {
    if (!faceBox || !sourceImageSize) return;
    setFaceBox({
      ...faceBox,
      x: clamp(faceBox.x + dx, 0, Math.max(0, sourceImageSize.width - faceBox.width)),
      y: clamp(faceBox.y + dy, 0, Math.max(0, sourceImageSize.height - faceBox.height)),
    });
  }

  function resizeFaceBox(delta: number) {
    if (!faceBox || !sourceImageSize) return;

    const nextWidth = clamp(faceBox.width + delta, 24, sourceImageSize.width);
    const nextHeight = clamp(faceBox.height + delta, 24, sourceImageSize.height);
    const centerX = faceBox.x + faceBox.width / 2;
    const centerY = faceBox.y + faceBox.height / 2;
    const nextX = clamp(
      Math.round(centerX - nextWidth / 2),
      0,
      Math.max(0, sourceImageSize.width - nextWidth)
    );
    const nextY = clamp(
      Math.round(centerY - nextHeight / 2),
      0,
      Math.max(0, sourceImageSize.height - nextHeight)
    );

    setFaceBox({
      x: nextX,
      y: nextY,
      width: nextWidth,
      height: nextHeight,
    });
  }

  return (
    <div
      className={
        embedded
          ? "rounded-lg bg-stone-950 bg-[radial-gradient(circle_at_top,rgba(201,168,76,0.08),transparent_60%)] p-4 text-stone-100 sm:p-6"
          : "min-h-screen bg-stone-950 bg-[radial-gradient(circle_at_top,rgba(201,168,76,0.1),transparent_60%)] px-4 py-8 text-stone-100 sm:px-6"
      }
    >
      {!embedded ? (
        <div className="mx-auto mb-6 flex max-w-2xl items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[#c9a84c]/80">{TEXT.appName}</p>
            <h1 className="mt-2 text-3xl font-semibold text-stone-50">{TEXT.title}</h1>
          </div>
          <a
            className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-100 transition hover:border-stone-500 hover:bg-stone-900"
            href="/"
          >
            {TEXT.home}
          </a>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-700/70 bg-stone-900/90 shadow-[0_0_0_1px_rgba(201,168,76,0.06),0_20px_45px_-20px_rgba(0,0,0,0.7)]">
        <div className="flex items-center justify-between border-b border-stone-800 bg-stone-950/40 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#c9a84c]/15 text-base">🤖</span>
            <div>
              <p className="text-sm font-semibold text-stone-50">ステップ生成アシスタント</p>
              <p className="text-xs text-stone-500">写真を選んで、順番に加工していきます</p>
            </div>
          </div>
          <button
            className="rounded-lg border border-stone-700 px-3 py-2 text-sm text-stone-200 transition hover:border-[#c9a84c]/60 hover:bg-stone-800"
            onClick={() => {
              resetAllLocalState();
              void postChat({ event: "reset_session" });
            }}
            type="button"
          >
            {TEXT.newSession}
          </button>
        </div>

        <div ref={feedRef} className="flex max-h-[70vh] min-h-[360px] flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-5">
          {history.map((entry) =>
            entry.role === "bot" ? (
              <BotMessage key={entry.id} text={entry.text} image={entry.image} />
            ) : (
              <UserMessage key={entry.id} text={entry.text} image={entry.image} />
            )
          )}

          {!(chat.state === "processing" && busyLabel) ? (
            <BotMessage text={chat.message ?? STATE_PROMPTS[chat.state] ?? ""}>
              {chat.state === "waiting_user_photo" ? (
                <UploadCard label={TEXT.userPhoto} accept="image/*" onChange={handleSourceImageChange} />
              ) : null}

              {chat.state === "photo_uploaded_menu" ? (
                <div className="grid gap-2.5">
                  {MENU.tools.map((item, index) => (
                    <StepButton
                      key={item.tool}
                      index={index + 1}
                      icon={item.icon}
                      label={item.label}
                      onClick={() => void selectTool(item.tool, `${item.icon} ${item.label}`)}
                    />
                  ))}
                </div>
              ) : null}

              {chat.state === "mosaic_menu" ? (
                <div className="space-y-4">
                  <OptionGroup title="範囲" items={MENU.mosaicScopes} selected={mosaicScope} onSelect={(value) => handleScopeChange(value as MosaicScope)} />
                  <OptionGroup title="種類" items={MENU.mosaicStyles} selected={mosaicStyle} onSelect={(value) => setMosaicStyle(value as MosaicStyle)} />
                  <OptionGroup title="強度" items={MENU.mosaicStrengths} selected={mosaicStrength} onSelect={(value) => setMosaicStrength(value as MosaicStrength)} />
                  {chat.session.sourceImageUrl && faceBox && sourceImageSize ? (
                    <div className="overflow-hidden rounded-lg border border-stone-800 bg-stone-950">
                      <SourcePreview
                        faceBox={faceBox}
                        imageSize={sourceImageSize}
                        onFaceBoxChange={setFaceBox}
                        src={chat.session.sourceImageUrl}
                      />
                      <div className="border-t border-stone-800 px-3 py-3 text-xs text-stone-400">{TEXT.faceGuide}</div>
                      <div className="border-t border-stone-800 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-stone-200">{TEXT.adjustBox}</p>
                          <ActionButton label={TEXT.detectAgain} onClick={() => void redetectFace()} muted />
                        </div>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <div>
                            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-stone-500">{TEXT.moveBox}</p>
                            <div className="grid grid-cols-3 gap-2">
                              <span />
                              <MiniButton label={TEXT.moveUp} onClick={() => nudgeFaceBox(0, -12)} />
                              <span />
                              <MiniButton label={TEXT.moveLeft} onClick={() => nudgeFaceBox(-12, 0)} />
                              <MiniButton label={TEXT.moveDown} onClick={() => nudgeFaceBox(0, 12)} />
                              <MiniButton label={TEXT.moveRight} onClick={() => nudgeFaceBox(12, 0)} />
                            </div>
                          </div>
                          <div>
                            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-stone-500">{TEXT.resizeBox}</p>
                            <div className="grid grid-cols-2 gap-2">
                              <MiniButton label={TEXT.shrinkBox} onClick={() => resizeFaceBox(-18)} />
                              <MiniButton label={TEXT.growBox} onClick={() => resizeFaceBox(18)} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <ActionButton label={TEXT.runMosaic} onClick={() => void runMosaic()} />
                </div>
              ) : null}

              {chat.state === "background_menu" ? (
                <div className="grid gap-3">
                  <ActionButton label="フォトスタジオ風" onClick={() => void runBackgroundPreset("studio", TEXT.processStudio)} />
                  <ActionButton label="ホテルラウンジ風" onClick={() => void runBackgroundPreset("hotel", TEXT.processHotel)} />
                  <ActionButton label="公園" onClick={() => void runBackgroundPreset("park", TEXT.processPark)} />
                  <ActionButton label="室内ラグジュアリー風" onClick={() => void runBackgroundPreset("luxury", TEXT.processLuxury)} />
                  <ActionButton
                    label="背景を合成する"
                    onClick={() => {
                      pushTurn("背景を合成する");
                      setChat((current) => ({
                        ...current,
                        state: "waiting_background_photo",
                        message: "背景にしたい画像をアップロードしてください。",
                        session: {
                          ...current.session,
                          step: "waiting_background_photo",
                        },
                      }));
                    }}
                  />
                </div>
              ) : null}

              {chat.state === "waiting_background_photo" ? (
                <UploadCard label={TEXT.backgroundPhoto} accept="image/*" onChange={handleBackgroundImageChange} />
              ) : null}

              {chat.state === "waiting_background_confirm" ? (
                <div className="flex flex-wrap gap-3">
                  <ActionButton label={TEXT.go} onClick={() => void runBackgroundComposite()} />
                  <ActionButton
                    label={TEXT.revise}
                    onClick={() => {
                      pushTurn(TEXT.revise);
                      void postChat({ event: "tool_selected", tool: "background" });
                    }}
                    muted
                  />
                </div>
              ) : null}

              {chat.state === "beauty_menu" ? (
                <div className="space-y-4">
                  <OptionGroup title="美肌補正" items={MENU.beautyModes} selected={beautyMode} onSelect={(value) => setBeautyMode(value as BeautyMode)} />
                  <ActionButton label={TEXT.runBeauty} onClick={() => void runBeauty()} />
                </div>
              ) : null}

              {chat.state === "brightness_menu" ? (
                <div className="space-y-4">
                  <OptionGroup title="明るさ" items={MENU.brightnessModes} selected={brightnessMode} onSelect={(value) => setBrightnessMode(value as BrightnessMode)} />
                  <ActionButton label={TEXT.runBrightness} onClick={() => void runBrightness()} />
                </div>
              ) : null}

              {chat.state === "pose_menu" ? (
                <div className="space-y-4">
                  <OptionGroup title="ポーズ" items={MENU.poseModes} selected={poseMode} onSelect={(value) => setPoseMode(value as PoseMode)} />
                  <ActionButton label={TEXT.runPose} onClick={() => void runPose()} />
                </div>
              ) : null}

              {chat.state === "completed" ? (
                <div className="space-y-4">
                  {chat.session.resultImageUrl ? (
                    chat.session.sourceImageUrl ? (
                      <div className="overflow-hidden rounded-lg border border-stone-800">
                        <CompareSlider
                          afterLabel={TEXT.afterLabel}
                          afterSrc={chat.session.resultImageUrl}
                          beforeLabel={TEXT.beforeLabel}
                          beforeSrc={chat.session.sourceImageUrl}
                          onRatioChange={setCompareRatio}
                          ratio={compareRatio}
                        />
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-lg border border-stone-800 bg-stone-950">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt={TEXT.resultImage} className="max-h-80 w-full object-contain" src={chat.session.resultImageUrl} />
                      </div>
                    )
                  ) : null}
                  <div className="flex flex-wrap gap-3">
                    <ActionButton label={TEXT.completedMenu1} onClick={() => void handleCompletedAdjust()} />
                    <ActionButton label={TEXT.completedMenu2} onClick={() => void handleCompletedRevise()} muted />
                    <ActionButton label={TEXT.completedMenu3} onClick={() => void handleCompletedContinue()} muted />
                  </div>
                </div>
              ) : null}
            </BotMessage>
          ) : null}

          {busyLabel ? <TypingBubble label={busyLabel} /> : null}
        </div>
      </div>

      {recovery ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-[#c9a84c]/20 bg-stone-900 p-6 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)]">
            <p className="whitespace-pre-line text-sm font-medium text-stone-100">{recovery}</p>
            <div className="mt-5 grid gap-2">
              <ActionButton label={TEXT.recoveryReupload} onClick={() => void handleRecoveryReupload()} />
              <ActionButton label={TEXT.recoveryMosaicOnly} onClick={() => void handleRecoveryMosaicOnly()} muted />
              <ActionButton label={TEXT.recoveryBrightnessOnly} onClick={() => void handleRecoveryBrightnessOnly()} muted />
              <ActionButton label={TEXT.recoverySplit} onClick={handleRecoverySplit} muted />
              <ActionButton label={TEXT.recoveryRestart} onClick={() => void handleRecoveryRestart()} muted />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BotMessage({
  text,
  image,
  children,
}: {
  text: string;
  image?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#c9a84c]/15 text-xs">
        🤖
      </span>
      <div className="flex max-w-[88%] flex-col gap-2">
        {text ? (
          <div className="rounded-2xl rounded-tl-sm bg-stone-800 px-4 py-2.5 text-sm leading-relaxed text-stone-100">
            {text}
          </div>
        ) : null}
        {image ? (
          <div className="overflow-hidden rounded-2xl rounded-tl-sm border border-stone-800 bg-stone-950">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" className="max-h-64 w-full object-contain" src={image} />
          </div>
        ) : null}
        {children ? <div className="flex flex-col gap-3">{children}</div> : null}
      </div>
    </div>
  );
}

function UserMessage({ text, image }: { text: string; image?: string }) {
  return (
    <div className="flex items-start justify-end gap-2.5">
      <div className="flex max-w-[80%] flex-col items-end gap-2">
        {image ? (
          <div className="overflow-hidden rounded-2xl rounded-tr-sm border border-[#c9a84c]/30 bg-stone-950">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" className="max-h-56 w-full object-contain" src={image} />
          </div>
        ) : null}
        <div className="rounded-2xl rounded-tr-sm bg-[#ddc37e] px-4 py-2.5 text-sm font-medium text-stone-950">
          {text}
        </div>
      </div>
    </div>
  );
}

function TypingBubble({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#c9a84c]/15 text-xs">
        🤖
      </span>
      <div className="flex items-center gap-2.5 rounded-2xl rounded-tl-sm bg-stone-800 px-4 py-2.5 text-sm text-stone-300">
        <span className="flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#c9a84c] [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#c9a84c] [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#c9a84c]" />
        </span>
        {label}
      </div>
    </div>
  );
}

function SourcePreview({
  src,
  imageSize,
  faceBox,
  onFaceBoxChange,
}: {
  src: string;
  imageSize: ImageSize | null;
  faceBox: FaceBox | null;
  onFaceBoxChange: Dispatch<SetStateAction<FaceBox | null>>;
}) {
  const [dragState, setDragState] = useState<DragState>(null);

  function updateFromPointer(event: ReactPointerEvent<HTMLDivElement>, mode: "move" | "resize") {
    if (!dragState || !imageSize) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const deltaX = ((event.clientX - dragState.startX) / rect.width) * imageSize.width;
    const deltaY = ((event.clientY - dragState.startY) / rect.height) * imageSize.height;

    if (mode === "move") {
      onFaceBoxChange({
        ...dragState.initialFaceBox,
        x: clamp(
          Math.round(dragState.initialFaceBox.x + deltaX),
          0,
          Math.max(0, imageSize.width - dragState.initialFaceBox.width)
        ),
        y: clamp(
          Math.round(dragState.initialFaceBox.y + deltaY),
          0,
          Math.max(0, imageSize.height - dragState.initialFaceBox.height)
        ),
      });
      return;
    }

    const nextWidth = clamp(
      Math.round(dragState.initialFaceBox.width + deltaX),
      24,
      imageSize.width - dragState.initialFaceBox.x
    );
    const nextHeight = clamp(
      Math.round(dragState.initialFaceBox.height + deltaY),
      24,
      imageSize.height - dragState.initialFaceBox.y
    );

    onFaceBoxChange({
      ...dragState.initialFaceBox,
      width: nextWidth,
      height: nextHeight,
    });
  }

  return (
    <div className="bg-stone-950 p-3">
      <div
        className="relative mx-auto max-h-[32rem] w-full overflow-hidden"
        style={imageSize ? { aspectRatio: `${imageSize.width} / ${imageSize.height}` } : undefined}
        onPointerMove={(event) => {
          if (!dragState || event.pointerId !== dragState.pointerId) return;
          updateFromPointer(event, dragState.mode);
        }}
        onPointerUp={(event) => {
          if (dragState && event.pointerId === dragState.pointerId) {
            setDragState(null);
          }
        }}
        onPointerCancel={() => setDragState(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={TEXT.sourceImage} className="h-full w-full object-contain" draggable={false} src={src} />
        {faceBox && imageSize ? (
          <div
            aria-hidden="true"
            className="absolute border-2 border-[#c9a84c] bg-[#c9a84c]/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragState({
                mode: "move",
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                initialFaceBox: faceBox,
              });
            }}
            style={{
              left: `${(faceBox.x / imageSize.width) * 100}%`,
              top: `${(faceBox.y / imageSize.height) * 100}%`,
              width: `${(faceBox.width / imageSize.width) * 100}%`,
              height: `${(faceBox.height / imageSize.height) * 100}%`,
              touchAction: "none",
            }}
          >
            <div className="absolute left-2 top-2 rounded bg-stone-950/80 px-2 py-1 text-[11px] text-[#ddc37e]">Drag</div>
            <button
              aria-label="Resize face box"
              className="absolute bottom-1 right-1 h-4 w-4 rounded-sm border border-stone-950 bg-[#c9a84c]"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragState({
                  mode: "resize",
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  initialFaceBox: faceBox,
                });
              }}
              type="button"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function UploadCard({
  label,
  accept,
  onChange,
  disabled,
}: {
  label: string;
  accept: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-stone-700 bg-stone-950 px-4 py-8 text-center transition hover:border-[#c9a84c]/60 hover:bg-stone-900">
      <span className="text-sm font-medium text-stone-100">{label}</span>
      <span className="mt-2 text-xs text-stone-400">{disabled ? TEXT.backgroundUploadHint : TEXT.imageSelectHint}</span>
      <input accept={accept} className="hidden" disabled={disabled} onChange={onChange} type="file" />
    </label>
  );
}

function OptionGroup({
  title,
  items,
  selected,
  onSelect,
}: {
  title: string;
  items: Array<{ label: string; value: string | number }>;
  selected: string | number;
  onSelect: (value: string | number) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-stone-300">{title}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const active = item.value === selected;
          return (
            <button
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-3 text-left text-sm transition ${
                active
                  ? "border-[#c9a84c] bg-[#ddc37e] text-stone-950 shadow-[0_6px_18px_-8px_rgba(201,168,76,0.6)]"
                  : "border-stone-700 bg-stone-950 text-stone-100 hover:border-[#c9a84c]/60 hover:bg-stone-900"
              }`}
              key={`${title}-${item.value}`}
              onClick={() => onSelect(item.value)}
              type="button"
            >
              <span>{item.label}</span>
              {active ? <span className="text-xs">✓</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, muted }: { label: string; onClick: () => void; muted?: boolean }) {
  const className = muted
    ? "border-stone-700 bg-stone-900 text-stone-100 shadow-sm hover:border-stone-500 hover:bg-stone-800"
    : "border-[#c9a84c]/60 bg-[#ddc37e] text-stone-950 shadow-[0_8px_24px_-10px_rgba(201,168,76,0.6)] hover:bg-[#efe3bd]";

  return (
    <button
      className={`rounded-lg border px-4 py-3 text-sm font-medium transition hover:-translate-y-0.5 active:translate-y-0 ${className}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function StepButton({
  index,
  icon,
  label,
  onClick,
}: {
  index: number;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="group flex items-center gap-3 rounded-lg border border-stone-700 bg-stone-950 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-[#c9a84c]/60 hover:bg-stone-900 hover:shadow-[0_10px_28px_-12px_rgba(201,168,76,0.45)]"
      onClick={onClick}
      type="button"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#c9a84c]/15 text-sm font-semibold text-[#c9a84c] transition group-hover:bg-[#c9a84c] group-hover:text-stone-950">
        {index}
      </span>
      <span className="flex-1 text-sm font-medium text-stone-100">
        <span className="mr-1.5">{icon}</span>
        {label}
      </span>
      <span className="text-stone-600 transition group-hover:translate-x-0.5 group-hover:text-[#c9a84c]">→</span>
    </button>
  );
}

function MiniButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100 transition hover:border-[#c9a84c]/60 hover:bg-stone-800"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function CompareSlider({
  beforeLabel,
  beforeSrc,
  afterLabel,
  afterSrc,
  ratio,
  onRatioChange,
}: {
  beforeLabel: string;
  beforeSrc: string;
  afterLabel: string;
  afterSrc: string;
  ratio: number;
  onRatioChange: (value: number) => void;
}) {
  return (
    <div className="bg-stone-950 p-3">
      <div className="relative overflow-hidden rounded-lg bg-stone-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={beforeLabel} className="h-72 w-full object-contain" src={beforeSrc} />
        <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${ratio}%` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={afterLabel} className="h-72 w-full max-w-none object-contain" src={afterSrc} style={{ width: "100%" }} />
        </div>
        <div aria-hidden="true" className="absolute inset-y-0 z-10 w-0.5 bg-[#c9a84c] shadow-[0_0_0_1px_rgba(12,10,9,0.45)]" style={{ left: `calc(${ratio}% - 1px)` }} />
        <div className="pointer-events-none absolute left-3 top-3 rounded bg-stone-950/80 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-stone-300">{beforeLabel}</div>
        <div className="pointer-events-none absolute right-3 top-3 rounded bg-[#c9a84c]/90 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-stone-950">{afterLabel}</div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <input aria-label={TEXT.sliderHint} className="w-full accent-[#c9a84c]" max={100} min={0} onChange={(event) => onRatioChange(Number(event.target.value))} type="range" value={ratio} />
        <span className="w-12 text-right text-xs text-stone-400">{ratio}%</span>
      </div>
      <p className="mt-2 text-xs text-stone-500">{TEXT.sliderHint}</p>
    </div>
  );
}

function regionBoxForScope(detectedFaceBox: FaceBox, scope: MosaicScope, imageSize: ImageSize | null) {
  if (!imageSize) {
    return detectedFaceBox;
  }

  const padX = detectedFaceBox.width * 0.08;
  const padY = detectedFaceBox.height * 0.1;
  const faceX = detectedFaceBox.x - padX;
  const faceY = detectedFaceBox.y - padY;
  const faceWidth = detectedFaceBox.width + padX * 2;
  const faceHeight = detectedFaceBox.height + padY * 1.5;

  if (scope === "eyes_only") {
    return clampFaceBox(
      {
        x: faceX + faceWidth * 0.14,
        y: faceY + faceHeight * 0.2,
        width: faceWidth * 0.72,
        height: faceHeight * 0.2,
      },
      imageSize
    );
  }

  if (scope === "bust_up") {
    return clampFaceBox(
      {
        x: faceX + faceWidth * 0.22,
        y: faceY + faceHeight * 0.62,
        width: faceWidth * 0.56,
        height: faceHeight * 0.16,
      },
      imageSize
    );
  }

  return clampFaceBox(
    {
      x: faceX,
      y: faceY,
      width: faceWidth,
      height: faceHeight,
    },
    imageSize
  );
}

function clampFaceBox(faceBox: FaceBox, imageSize: ImageSize) {
  const width = clamp(Math.round(faceBox.width), 24, imageSize.width);
  const height = clamp(Math.round(faceBox.height), 24, imageSize.height);
  const x = clamp(Math.round(faceBox.x), 0, Math.max(0, imageSize.width - width));
  const y = clamp(Math.round(faceBox.y), 0, Math.max(0, imageSize.height - height));

  return { x, y, width, height };
}
