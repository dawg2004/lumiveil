"use client";

import {
  type ChangeEvent,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  useCallback,
  useMemo,
  useState,
} from "react";

import { detectFirstFace, type FaceBox } from "@/lib/faceDetector";
import type { ChatResponse, ToolType } from "@/types/chat";

type PreviewImage = {
  label: string;
  url?: string;
};

type MosaicScope = "face" | "eyes_only" | "bust_up";
type MosaicStyle = "blur" | "gaussian" | "mosaic";
type MosaicStrength = 1 | 2 | 3 | 4 | 5;
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
  backgroundImage: "背景画像",
  resultImage: "結果画像",
  previewHint: "ここに元画像・背景画像・結果画像のプレビューが並びます。",
  sessionLoading: "セッションを準備しています...",
  backgroundUploadHint: "背景合成を選んだときに有効になります",
  imageSelectHint: "画像ファイルを選択",
  processingHint: "処理のつながりを確認するための GPTs 画面です。",
  completedMenu1: "調整して続ける",
  completedMenu2: "新規修正",
  completedMenu3: "このまま続ける",
  go: "Go!",
  revise: "修正する",
  panelImages: "画像",
  panelActions: "操作",
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
  chatError: "チャット状態の更新に失敗しました。",
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
  compareTitle: "比較プレビュー",
  beforeLabel: "Before",
  afterLabel: "After",
  sliderHint: "スライダーを動かして比較",
};

const MENU = {
  tools: [
    { label: "1. モザイク処理", tool: "mosaic" as ToolType },
    { label: "2. 背景変更", tool: "background" as ToolType },
    { label: "3. 美肌補正", tool: "beauty" as ToolType },
    { label: "4. 明るさ調整", tool: "brightness" as ToolType },
    { label: "5. ポーズ変更", tool: "pose" as ToolType },
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
};

const FALLBACK_FACE_BOX = (imageSize: ImageSize): FaceBox => ({
  x: Math.floor(imageSize.width * 0.2),
  y: Math.floor(imageSize.height * 0.12),
  width: Math.floor(imageSize.width * 0.6),
  height: Math.floor(imageSize.height * 0.62),
});

export default function GptsPage() {
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
  const [compareRatio, setCompareRatio] = useState(50);

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
        throw new Error(TEXT.chatError);
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

  async function handleSourceImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setSourceFile(file);
    const bitmap = await createImageBitmap(file);
    const imageSize = { width: bitmap.width, height: bitmap.height };
    bitmap.close();

    setSourceImageSize(imageSize);
    const detected = await detectFaceOrFallback(file, imageSize);
    setDetectedFaceBox(detected);
    setFaceBox(regionBoxForScope(detected, mosaicScope, imageSize));

    const imageUrl = URL.createObjectURL(file);
    await postChat({ event: "user_photo_uploaded", imageUrl });
    event.target.value = "";
  }

  async function handleBackgroundImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const backgroundImageUrl = URL.createObjectURL(file);
    await postChat({
      event: "background_photo_uploaded",
      backgroundImageUrl,
    });
    event.target.value = "";
  }

  async function selectTool(tool: ToolType) {
    await postChat({ event: "tool_selected", tool });
  }

  async function runMockProcessing(label: string) {
    setBusyLabel(label);
    await postChat({ event: "confirm_go" });
    await new Promise((resolve) => setTimeout(resolve, 900));

    setChat((current) => ({
      ...current,
      state: "completed",
      menu: [TEXT.completedMenu1, TEXT.completedMenu2, TEXT.completedMenu3],
      session: {
        ...current.session,
        step: "completed",
        resultImageUrl:
          current.session.backgroundImageUrl ?? current.session.sourceImageUrl,
      },
    }));
    setBusyLabel(null);
  }

  async function runMosaic() {
    if (!sourceFile) return;

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

      const response = await fetch("/api/mosaic", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(TEXT.mosaicError);
      }

      const blob = await response.blob();
      const resultImageUrl = URL.createObjectURL(blob);

      setChat((current) => ({
        ...current,
        state: "completed",
        menu: [TEXT.completedMenu1, TEXT.completedMenu2, TEXT.completedMenu3],
        session: {
          ...current.session,
          step: "completed",
          resultImageUrl,
        },
      }));
    } finally {
      setBusyLabel(null);
    }
  }

  const previews = useMemo<PreviewImage[]>(() => {
    return [
      { label: TEXT.backgroundImage, url: chat.session.backgroundImageUrl },
      { label: TEXT.resultImage, url: chat.session.resultImageUrl },
    ].filter((item) => item.url);
  }, [chat.session.backgroundImageUrl, chat.session.resultImageUrl]);

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
    <main className="min-h-screen bg-stone-950 px-4 py-8 text-stone-100 sm:px-6">
      <div className="mx-auto mb-6 flex max-w-6xl items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-amber-300/80">{TEXT.appName}</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-50">{TEXT.title}</h1>
        </div>
        <a
          className="rounded-md border border-stone-700 px-4 py-2 text-sm text-stone-100 transition hover:border-stone-500 hover:bg-stone-900"
          href="/"
        >
          {TEXT.home}
        </a>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-lg border border-stone-800 bg-stone-900/90 p-5 shadow-2xl shadow-black/20 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-amber-300/80">{TEXT.appName}</p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-50">チャット編集</h2>
            </div>
            <button
              className="rounded-md border border-stone-700 px-3 py-2 text-sm text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
              onClick={() => {
                setBusyLabel(null);
                setSourceFile(null);
                setSourceImageSize(null);
                setDetectedFaceBox(null);
                setFaceBox(null);
                void postChat({ event: "reset_session" });
              }}
              type="button"
            >
              {TEXT.newSession}
            </button>
          </div>

          <div className="rounded-lg border border-stone-800 bg-stone-950/70 p-4">
            <div className="space-y-4">
              <Bubble text={chat.message} />

              {chat.menu?.length ? (
                <div className="rounded-lg border border-stone-800 bg-stone-900 p-4">
                  <ul className="space-y-2 text-sm text-stone-200">
                    {chat.menu.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {chat.state === "waiting_background_confirm" ? (
                <div className="flex flex-wrap gap-3">
                  <ActionButton label={TEXT.go} onClick={() => void runMockProcessing(TEXT.processBackground)} />
                  <ActionButton label={TEXT.revise} onClick={() => void postChat({ event: "tool_selected", tool: "background" })} muted />
                </div>
              ) : null}

              {chat.state === "completed" ? (
                <div className="flex flex-wrap gap-3">
                  <ActionButton label={TEXT.completedMenu1} onClick={() => void postChat({ event: "continue_with_result" })} />
                  <ActionButton label={TEXT.completedMenu2} onClick={() => void postChat({ event: "reset_session" })} muted />
                  <ActionButton label={TEXT.completedMenu3} onClick={() => void postChat({ event: "continue_with_result" })} muted />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <Panel title={TEXT.panelImages}>
            <div className="grid gap-4 sm:grid-cols-2">
              <UploadCard label={TEXT.userPhoto} accept="image/*" onChange={handleSourceImageChange} />
              <UploadCard
                label={TEXT.backgroundPhoto}
                accept="image/*"
                onChange={handleBackgroundImageChange}
                disabled={chat.state !== "waiting_background_photo"}
              />
            </div>

            {chat.session.sourceImageUrl ? (
              <div className="mt-5 overflow-hidden rounded-lg border border-stone-800 bg-stone-950">
                <div className="border-b border-stone-800 px-3 py-2 text-sm text-stone-300">{TEXT.sourceImage}</div>
                <SourcePreview
                  faceBox={faceBox}
                  imageSize={sourceImageSize}
                  onFaceBoxChange={setFaceBox}
                  src={chat.session.sourceImageUrl}
                />
                {faceBox && sourceImageSize ? (
                  <div className="border-t border-stone-800 px-3 py-3 text-xs text-stone-400">{TEXT.faceGuide}</div>
                ) : null}
              </div>
            ) : null}

            {previews.length ? (
              <div className="mt-5 grid gap-4">
                {previews.map((preview) => (
                  <div className="overflow-hidden rounded-lg border border-stone-800 bg-stone-950" key={preview.label}>
                    <div className="border-b border-stone-800 px-3 py-2 text-sm text-stone-300">{preview.label}</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={preview.label} className="h-52 w-full object-cover" src={preview.url} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-5 text-sm text-stone-400">{TEXT.previewHint}</p>
            )}

            {chat.session.sourceImageUrl && chat.session.resultImageUrl ? (
              <div className="mt-5 overflow-hidden rounded-lg border border-stone-800 bg-stone-950">
                <div className="border-b border-stone-800 px-3 py-2 text-sm text-stone-300">{TEXT.compareTitle}</div>
                <CompareSlider
                  afterLabel={TEXT.afterLabel}
                  afterSrc={chat.session.resultImageUrl}
                  beforeLabel={TEXT.beforeLabel}
                  beforeSrc={chat.session.sourceImageUrl}
                  onRatioChange={setCompareRatio}
                  ratio={compareRatio}
                />
              </div>
            ) : null}
          </Panel>

          <Panel title={TEXT.panelActions}>
            {chat.state === "photo_uploaded_menu" ? (
              <div className="grid gap-3">
                {MENU.tools.map((item) => (
                  <ActionButton key={item.tool} label={item.label} onClick={() => void selectTool(item.tool)} />
                ))}
              </div>
            ) : null}

            {chat.state === "mosaic_menu" ? (
              <div className="space-y-4">
                <OptionGroup title="範囲" items={MENU.mosaicScopes} selected={mosaicScope} onSelect={(value) => handleScopeChange(value as MosaicScope)} />
                <OptionGroup title="種類" items={MENU.mosaicStyles} selected={mosaicStyle} onSelect={(value) => setMosaicStyle(value as MosaicStyle)} />
                <OptionGroup title="強度" items={MENU.mosaicStrengths} selected={mosaicStrength} onSelect={(value) => setMosaicStrength(value as MosaicStrength)} />
                <ActionButton label={TEXT.runMosaic} onClick={() => void runMosaic()} />
                {faceBox && sourceImageSize ? (
                  <div className="rounded-lg border border-stone-800 bg-stone-950 p-4">
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
                ) : null}
              </div>
            ) : null}

            {chat.state === "background_menu" ? (
              <div className="grid gap-3">
                <ActionButton label="フォトスタジオ風" onClick={() => void runMockProcessing(TEXT.processStudio)} />
                <ActionButton label="ホテルラウンジ風" onClick={() => void runMockProcessing(TEXT.processHotel)} />
                <ActionButton label="公園" onClick={() => void runMockProcessing(TEXT.processPark)} />
                <ActionButton label="室内ラグジュアリー風" onClick={() => void runMockProcessing(TEXT.processLuxury)} />
                <ActionButton
                  label="背景を合成する"
                  onClick={() =>
                    setChat((current) => ({
                      ...current,
                      state: "waiting_background_photo",
                      message: "背景にしたい画像をアップロードしてください。",
                      session: {
                        ...current.session,
                        step: "waiting_background_photo",
                      },
                    }))
                  }
                />
              </div>
            ) : null}

            {chat.state === "beauty_menu" ? (
              <div className="space-y-4">
                <OptionGroup
                  title="美肌補正"
                  items={[
                    { label: "ナチュラル", value: "natural" },
                    { label: "しっかり補正", value: "strong" },
                    { label: "クマ・ニキビのみ除去", value: "blemish_only" },
                  ]}
                  selected={"natural"}
                  onSelect={() => {}}
                />
                <ActionButton label={TEXT.runBeauty} onClick={() => void runMockProcessing(TEXT.processBeauty)} />
              </div>
            ) : null}

            {chat.state === "brightness_menu" ? (
              <div className="space-y-4">
                <OptionGroup
                  title="明るさ"
                  items={[
                    { label: "自然補正", value: "natural" },
                    { label: "明るめ", value: "bright" },
                    { label: "落ち着いたトーン", value: "calm" },
                  ]}
                  selected={"natural"}
                  onSelect={() => {}}
                />
                <ActionButton label={TEXT.runBrightness} onClick={() => void runMockProcessing(TEXT.processBrightness)} />
              </div>
            ) : null}

            {chat.state === "pose_menu" ? (
              <div className="space-y-4">
                <OptionGroup
                  title="ポーズ"
                  items={[
                    { label: "エレガント", value: "elegant" },
                    { label: "顔を片手で隠す", value: "hide_face" },
                    { label: "ソファに座る", value: "sofa" },
                    { label: "立ち姿を整える", value: "standing" },
                  ]}
                  selected={"elegant"}
                  onSelect={() => {}}
                />
                <ActionButton label={TEXT.runPose} onClick={() => void runMockProcessing(TEXT.processPose)} />
              </div>
            ) : null}

            {!chat ? <p className="text-sm text-stone-400">{TEXT.sessionLoading}</p> : null}
          </Panel>
        </section>
      </div>

      {busyLabel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/75 px-4">
          <div className="w-full max-w-sm rounded-lg border border-stone-800 bg-stone-900 p-6 text-center shadow-2xl shadow-black/30">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-stone-700 border-t-amber-300" />
            <p className="mt-4 text-base font-medium text-stone-100">{busyLabel}</p>
            <p className="mt-2 text-sm text-stone-400">{TEXT.processingHint}</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-900/90 p-5 shadow-xl shadow-black/20">
      <h2 className="text-lg font-semibold text-stone-50">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Bubble({ text }: { text?: string }) {
  if (!text) return null;

  return (
    <div className="flex">
      <div className="max-w-[90%] rounded-lg bg-amber-200 px-4 py-3 text-sm text-stone-950">{text}</div>
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
            className="absolute border-2 border-amber-300 bg-amber-300/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]"
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
            <div className="absolute left-2 top-2 rounded bg-stone-950/80 px-2 py-1 text-[11px] text-amber-200">Drag</div>
            <button
              aria-label="Resize face box"
              className="absolute bottom-1 right-1 h-4 w-4 rounded-sm border border-stone-950 bg-amber-300"
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
    <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-stone-700 bg-stone-950 px-4 py-8 text-center transition hover:border-stone-500 hover:bg-stone-900">
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
              className={`rounded-md border px-3 py-3 text-left text-sm transition ${
                active
                  ? "border-amber-300 bg-amber-200 text-stone-950"
                  : "border-stone-700 bg-stone-950 text-stone-100 hover:border-amber-300/60 hover:bg-stone-900"
              }`}
              key={`${title}-${item.value}`}
              onClick={() => onSelect(item.value)}
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, muted }: { label: string; onClick: () => void; muted?: boolean }) {
  const className = muted
    ? "border-stone-700 bg-stone-900 text-stone-100 hover:border-stone-500 hover:bg-stone-800"
    : "border-amber-300/60 bg-amber-200 text-stone-950 hover:bg-amber-100";

  return (
    <button className={`rounded-md border px-4 py-3 text-sm font-medium transition ${className}`} onClick={onClick} type="button">
      {label}
    </button>
  );
}

function MiniButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100 transition hover:border-amber-300/60 hover:bg-stone-800"
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
      <div className="relative overflow-hidden rounded-md bg-stone-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={beforeLabel} className="h-72 w-full object-contain" src={beforeSrc} />
        <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${ratio}%` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={afterLabel} className="h-72 w-full max-w-none object-contain" src={afterSrc} style={{ width: "100%" }} />
        </div>
        <div aria-hidden="true" className="absolute inset-y-0 z-10 w-0.5 bg-amber-300 shadow-[0_0_0_1px_rgba(12,10,9,0.45)]" style={{ left: `calc(${ratio}% - 1px)` }} />
        <div className="pointer-events-none absolute left-3 top-3 rounded bg-stone-950/80 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-stone-300">{beforeLabel}</div>
        <div className="pointer-events-none absolute right-3 top-3 rounded bg-amber-300/90 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-stone-950">{afterLabel}</div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <input aria-label={TEXT.sliderHint} className="w-full accent-amber-300" max={100} min={0} onChange={(event) => onRatioChange(Number(event.target.value))} type="range" value={ratio} />
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
