"use client";

import { detectFaceRegions, type FacePoint, type FaceRegions } from "@/lib/faceDetector";
import { TOPUP_PACKS, type TopupPackId } from "@/lib/credit-packs";
import { createClient } from "@/lib/supabase";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

type TabId = "generate" | "avatar" | "mosaic" | "edit" | "faceswap" | "video" | "analyze" | "history" | "plan" | "mypage";
type MosaicBox = { x: number; y: number; width: number; height: number };
type ImageSize = { width: number; height: number };
type MosaicMode = "blur" | "gaussian" | "simple";
type VideoModel = "grok" | "grok_v15" | "seedance";
type EditResolution = "1k" | "2k";
type EditModel = "grok" | "lumiveil_v1.0";
type RegisteredAvatar = {
  id: string;
  name: string;
  face_image_url: string | null;
  created_at: string;
  status: string;
};
type GenerationHistoryItem = {
  id: string;
  avatar_id: string | null;
  prompt: string | null;
  generated_image_url: string;
  media_type?: "image" | "video";
  credits_used: number | null;
  created_at: string;
};

const NAV_ITEMS: Array<{ id: TabId; label: string; mobileLabel: string }> = [
  { id: "generate", label: "画像生成（工事中）", mobileLabel: "生成" },
  { id: "avatar", label: "キャスト登録", mobileLabel: "キャスト" },
  { id: "mosaic", label: "モザイク", mobileLabel: "モザイク" },
  { id: "edit", label: "画像編集", mobileLabel: "編集" },
  { id: "faceswap", label: "顔ハメ", mobileLabel: "顔ハメ" },
  { id: "video", label: "動画生成", mobileLabel: "動画" },
  { id: "analyze", label: "AI変換", mobileLabel: "変換" },
  { id: "history", label: "履歴", mobileLabel: "履歴" },
  { id: "plan", label: "プラン", mobileLabel: "プラン" },
  { id: "mypage", label: "マイページ", mobileLabel: "設定" },
];

const AREAS = ["顔全体", "目元のみ", "口元のみ"] as const;
const STRENGTHS = ["弱", "中", "強", "最強"] as const;
const NUDGE_STEP = 2;
const RESIZE_STEP = 4;
const PHOTO_CREDITS_ESTIMATE = 1;
const VIDEO_CREDITS_ESTIMATE = 8;
const MAX_AVATARS = 200;
const TOPUP_PACK_LIST = Object.entries(TOPUP_PACKS).map(([id, pack]) => ({ id: id as TopupPackId, ...pack }));

function isVideoHistoryUrl(url: string) {
  const cleanUrl = url.split("?")[0].toLowerCase();
  return cleanUrl.endsWith(".mp4") || cleanUrl.endsWith(".webm") || cleanUrl.endsWith(".mov");
}

async function imageUrlToFile(url: string, name: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("キャスト画像を読み込めませんでした");
  }

  const blob = await response.blob();
  const extension = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
  return new File([blob], `${name || "cast"}.${extension}`, { type: blob.type || "image/jpeg" });
}

function buildIncrementedFileName(sourceName: string | null | undefined, fallbackName: string) {
  const rawName = (sourceName && sourceName.trim()) || fallbackName;
  const lastDot = rawName.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < rawName.length - 1;
  const base = hasExt ? rawName.slice(0, lastDot) : rawName;
  const ext = hasExt ? rawName.slice(lastDot) : (fallbackName.includes(".") ? fallbackName.slice(fallbackName.lastIndexOf(".")) : "");
  const key = `lumiveil_download_counter:${rawName}`;
  const current = Number(window.localStorage.getItem(key) || "0");
  const next = current + 1;
  window.localStorage.setItem(key, String(next));
  return `${base}_${next}${ext}`;
}

async function saveFileAs(url: string, sourceName: string | null | undefined, fallbackName: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("ファイルを取得できませんでした");
  }

  const blob = await response.blob();
  const suggestedName = buildIncrementedFileName(sourceName, fallbackName);
  const ext = suggestedName.includes(".") ? `.${suggestedName.split(".").pop()}` : "";
  const win = window as Window & {
    showSaveFilePicker?: (options?: {
      id?: string;
      suggestedName?: string;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };

  if (win.showSaveFilePicker) {
    const isVideo = blob.type.startsWith("video/") || ext === ".mp4" || ext === ".webm";
    const handle = await win.showSaveFilePicker({
      id: isVideo ? "lumiveil-video" : "lumiveil-image",
      suggestedName,
      types: [
        {
          description: "Download file",
          accept: {
            [blob.type || "application/octet-stream"]: ext ? [ext] : [".bin"],
          },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

function findBlockedMatches(prompt: string, keywords: Array<{ keyword: string; reason: string | null }>) {
  const lower = prompt.toLowerCase();
  return keywords.filter(kw => lower.includes(kw.keyword.toLowerCase()));
}

const LUMIVEIL_HISTORY_PREFIX = "LUMIVEIL_HISTORY::";
function extractDisplayPrompt(raw: string | null): string {
  if (!raw) return "";
  if (raw.startsWith(LUMIVEIL_HISTORY_PREFIX)) {
    try {
      const parsed = JSON.parse(raw.slice(LUMIVEIL_HISTORY_PREFIX.length)) as { prompt?: string };
      return parsed.prompt ?? "";
    } catch {
      return "";
    }
  }
  return raw;
}

function BlockedKeywordWarning({ prompt, keywords }: { prompt: string; keywords: Array<{ keyword: string; reason: string | null }> }) {
  const matches = findBlockedMatches(prompt, keywords);
  if (matches.length === 0) return null;
  return (
    <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "#3d1a00", border: "1px solid #a04020", color: "#f4a460", fontSize: 12, lineHeight: 1.6 }}>
      <span style={{ fontWeight: 700 }}>⚠ 注意: </span>
      生成エラーやアダルトフィルターが発生しやすいキーワードが含まれています。
      {matches.map((kw, i) => (
        <span key={i}>
          {" "}
          <span style={{ background: "rgba(255,100,0,0.2)", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>{kw.keyword}</span>
          {kw.reason ? <span style={{ color: "#c89060" }}>（{kw.reason}）</span> : null}
        </span>
      ))}
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<TabId>("generate");
  const [mosaicSrc, setMosaicSrc] = useState<string | null>(null);
  const [mosaicImage, setMosaicImage] = useState<string | null>(null);
  const [mosaicImageSize, setMosaicImageSize] = useState<ImageSize | null>(null);
  const [mosaicRegions, setMosaicRegions] = useState<FaceRegions | null>(null);
  const [mosaicBox, setMosaicBox] = useState<MosaicBox | null>(null);
  const [mosaicArea, setMosaicArea] = useState<(typeof AREAS)[number]>("顔全体");
  const [mosaicStrength, setMosaicStrength] = useState<(typeof STRENGTHS)[number]>("中");
  const [mosaicStage, setMosaicStage] = useState("");
  const [mosaicLoading, setMosaicLoading] = useState(false);

  const [avatarName, setAvatarName] = useState("");
  const [avatarFiles, setAvatarFiles] = useState<File[]>([]);
  const [avatarPreviews, setAvatarPreviews] = useState<string[]>([]);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState("");
  const [avatars, setAvatars] = useState<RegisteredAvatar[]>([]);
  const [avatarListLoading, setAvatarListLoading] = useState(false);

  const [editFile, setEditFile] = useState<File | null>(null);
  const [editSrc, setEditSrc] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editResolution, setEditResolution] = useState<EditResolution>("1k");
  const [editModel, setEditModel] = useState<EditModel>("grok");
  const [editLoading, setEditLoading] = useState(false);
  const [editResult, setEditResult] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("");
  // faceswap
  const [faceFile, setFaceFile] = useState<File | null>(null);
  const [faceSrc, setFaceSrc] = useState<string | null>(null);
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [targetSrc, setTargetSrc] = useState<string | null>(null);
  const [faceswapLoading, setFaceswapLoading] = useState(false);
  const [faceswapResult, setFaceswapResult] = useState<string | null>(null);
  const [faceswapStatus, setFaceswapStatus] = useState("");
  // analyze
  const [analyzeFile, setAnalyzeFile] = useState<File | null>(null);
  const [analyzeSrc, setAnalyzeSrc] = useState<string | null>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzePrompt, setAnalyzePrompt] = useState("");
  const [analyzePromptJa, setAnalyzePromptJa] = useState("");
  const [analyzeGenLoading, setAnalyzeGenLoading] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);
  const [analyzeStatus, setAnalyzeStatus] = useState("");

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoModel, setVideoModel] = useState<VideoModel>("grok");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoDuration, setVideoDuration] = useState(5);
  const [videoResolution, setVideoResolution] = useState("480p");
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoResult, setVideoResult] = useState<string | null>(null);
  const [videoRequestId, setVideoRequestId] = useState<string | null>(null);
  const [videoRequestId2, setVideoRequestId2] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState("");
  const videoPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoPollRef2 = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoPollErrorCountRef = useRef(0);
  const videoPollErrorCountRef2 = useRef(0);
  const lastSavedEditResultRef = useRef<string | null>(null);
  const lastSavedVideoResultRef = useRef<string | null>(null);
  const paypalCaptureStartedRef = useRef(false);
  // favorites
  const FAVORITES_KEY = "lumiveil_prompt_favorites";
  const [promptFavorites, setPromptFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"); } catch { return []; }
  });
  const [favoritesOpenFor, setFavoritesOpenFor] = useState<string | null>(null);
  const addFavorite = useCallback((prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setPromptFavorites(prev => {
      if (prev.includes(trimmed)) return prev;
      const next = [trimmed, ...prev].slice(0, 30);
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const removeFavorite = useCallback((index: number) => {
    setPromptFavorites(prev => {
      const next = prev.filter((_, i) => i !== index);
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  // stitch mode (Grok v1.5 限定: 15秒×2本を連続生成して30秒として再生)
  const [videoStitchMode, setVideoStitchMode] = useState(false);
  const [videoStitchPart1, setVideoStitchPart1] = useState<string | null>(null);
  const [videoStitchPart2, setVideoStitchPart2] = useState<string | null>(null);
  const [videoStitchStatus, setVideoStitchStatus] = useState("");
  const [credits, setCredits] = useState<number | null>(null);
  const [topupLoadingPack, setTopupLoadingPack] = useState<TopupPackId | null>(null);
  const [topupStatus, setTopupStatus] = useState("");
  const [trialInviteCode, setTrialInviteCode] = useState("");
  const [historyItems, setHistoryItems] = useState<GenerationHistoryItem[]>([]);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDeleting, setHistoryDeleting] = useState(false);
  const [historyDownloadingId, setHistoryDownloadingId] = useState<string | null>(null);
  const [historyToVideoId, setHistoryToVideoId] = useState<string | null>(null);
  const [historyToEditId, setHistoryToEditId] = useState<string | null>(null);
  const [historyToAvatarId, setHistoryToAvatarId] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const HISTORY_PAGE_SIZE = 500;
  const [userEmail, setUserEmail] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [mypageEmail, setMypageEmail] = useState("");
  const [mypagePassword, setMypagePassword] = useState("");
  const [mypageStatus, setMypageStatus] = useState("");
  const [mypageLoading, setMypageLoading] = useState(false);

  const [blockedKeywords, setBlockedKeywords] = useState<Array<{ keyword: string; reason: string | null }>>([]);

  const buildRegionBox = useCallback((regions: FaceRegions, area: (typeof AREAS)[number]) => {
    if (area === "目元のみ") {
      return regions.eyesBox;
    }

    if (area === "口元のみ") {
      return regions.mouthBox;
    }

    return regions.faceBox;
  }, []);

  const clampMosaicRegion = useCallback(
    (region: MosaicBox) => {
      if (!mosaicImageSize) {
        return region;
      }

      const width = Math.max(1, Math.min(Math.round(region.width), mosaicImageSize.width));
      const height = Math.max(1, Math.min(Math.round(region.height), mosaicImageSize.height));

      return {
        x: Math.max(0, Math.min(Math.round(region.x), mosaicImageSize.width - width)),
        y: Math.max(0, Math.min(Math.round(region.y), mosaicImageSize.height - height)),
        width,
        height,
      };
    },
    [mosaicImageSize]
  );

  const resetMosaic = useCallback(() => {
    setMosaicSrc(null);
    setMosaicImage(null);
    setMosaicImageSize(null);
    setMosaicRegions(null);
    setMosaicBox(null);
    setMosaicStage("");
    setMosaicLoading(false);
  }, []);

  const handleMosaicUpload = useCallback(
    async (file: File) => {
      const objectUrl = URL.createObjectURL(file);
      setMosaicSrc(objectUrl);
      setMosaicImage(null);
      setMosaicRegions(null);
      setMosaicBox(null);

      const bitmap = await createImageBitmap(file);
      const imageSize = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      setMosaicImageSize(imageSize);

      setMosaicStage("MediaPipe Face Landmarker で顔を検出中...");
      try {
        const regions = await detectFaceRegions(file);
        setMosaicRegions(regions);
        setMosaicBox(regions ? buildRegionBox(regions, mosaicArea) : null);
        setMosaicStage(regions ? "顔輪郭を検出しました。必要なら枠を微調整してください。" : "顔が見つかりませんでした。");
      } catch {
        setMosaicStage("顔検出に失敗しました。位置は手動で微調整できます。");
      }
    },
    [buildRegionBox, mosaicArea]
  );

  const redetectMosaicFace = useCallback(async () => {
    if (!mosaicSrc) return;

    setMosaicStage("MediaPipe Face Landmarker で再検出中...");
    try {
      const response = await fetch(mosaicSrc);
      const blob = await response.blob();
      const file = new File([blob], "mosaic-redetect.jpg", { type: blob.type || "image/jpeg" });
      const regions = await detectFaceRegions(file);
      setMosaicRegions(regions);
      setMosaicBox(regions ? buildRegionBox(regions, mosaicArea) : null);
      setMosaicStage(regions ? "再検出しました。必要なら枠を微調整してください。" : "顔が見つかりませんでした。");
    } catch {
      setMosaicStage("再検出に失敗しました。");
    }
  }, [buildRegionBox, mosaicArea, mosaicSrc]);

  const nudgeMosaicBox = useCallback(
    (dx: number, dy: number) => {
      setMosaicBox(current => {
        if (!current) return current;
        return clampMosaicRegion({
          ...current,
          x: current.x + dx,
          y: current.y + dy,
        });
      });
    },
    [clampMosaicRegion]
  );

  const resizeMosaicBox = useCallback(
    (delta: number) => {
      setMosaicBox(current => {
        if (!current) return current;
        const nextWidth = current.width + delta;
        const nextHeight = current.height + delta;
        const centerX = current.x + current.width / 2;
        const centerY = current.y + current.height / 2;

        return clampMosaicRegion({
          x: centerX - nextWidth / 2,
          y: centerY - nextHeight / 2,
          width: nextWidth,
          height: nextHeight,
        });
      });
    },
    [clampMosaicRegion]
  );

  const buildAdjustedPolygon = useCallback(
    (
      polygon: FacePoint[] | undefined,
      baseBox: MosaicBox,
      currentBox: MosaicBox
    ): FacePoint[] | null => {
      if (!polygon?.length) {
        return null;
      }

      return polygon.map(point => ({
        x: currentBox.x + ((point.x - baseBox.x) / baseBox.width) * currentBox.width,
        y: currentBox.y + ((point.y - baseBox.y) / baseBox.height) * currentBox.height,
      }));
    },
    []
  );

  const runMosaic = useCallback(
    async (mode: MosaicMode) => {
      if (!mosaicSrc || !mosaicBox) return;

      setMosaicLoading(true);
      setMosaicStage(
        mode === "blur"
          ? "ブラー加工中..."
          : mode === "gaussian"
            ? "ガウス加工中..."
            : "自動モザイク加工中..."
      );

      try {
        const response = await fetch(mosaicSrc);
        const blob = await response.blob();
        const file = new File([blob], "mosaic.jpg", { type: blob.type || "image/jpeg" });

        const modeMap: Record<MosaicMode, string> = {
          blur: "ブラー",
          gaussian: "ガウス",
          simple: "自動モザイク",
        };

        const strengthMap: Record<(typeof STRENGTHS)[number], string> = {
          弱: "1",
          中: "3",
          強: "4",
          最強: "5",
        };

        const scope =
          mosaicArea === "顔全体" ? "face" : mosaicArea === "目元のみ" ? "eyes_only" : "mouth_only";

        const formData = new FormData();
        formData.append("file", file);
        formData.append("mode", modeMap[mode]);
        formData.append("boxMode", "region");
        formData.append("x", String(mosaicBox.x));
        formData.append("y", String(mosaicBox.y));
        formData.append("width", String(mosaicBox.width));
        formData.append("height", String(mosaicBox.height));
        formData.append("scope", scope);
        formData.append("strength", strengthMap[mosaicStrength]);

        if (mosaicRegions) {
          const polygon =
            mosaicArea === "顔全体"
              ? buildAdjustedPolygon(mosaicRegions.facePolygon, mosaicRegions.faceBox, mosaicBox)
              : mosaicArea === "目元のみ"
                ? buildAdjustedPolygon(mosaicRegions.eyesPolygon, mosaicRegions.eyesBox, mosaicBox)
                : buildAdjustedPolygon(mosaicRegions.mouthPolygon, mosaicRegions.mouthBox, mosaicBox);

          if (polygon) {
            formData.append("regionPolygon", JSON.stringify(polygon));
          }
        }

        const apiRes = await fetch("/api/mosaic", { method: "POST", body: formData });
        if (!apiRes.ok) {
          throw new Error("モザイク処理に失敗しました");
        }

        const resultBlob = await apiRes.blob();
        setMosaicImage(URL.createObjectURL(resultBlob));
        setMosaicStage("加工が完了しました。");
      } catch (error) {
        const message = error instanceof Error ? error.message : "モザイク処理に失敗しました";
        setMosaicStage(message);
      } finally {
        setMosaicLoading(false);
      }
    },
    [buildAdjustedPolygon, mosaicArea, mosaicBox, mosaicRegions, mosaicSrc, mosaicStrength]
  );

  const getAuthToken = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const now = Math.floor(Date.now() / 1000);
    const session = data.session;

    if (session?.access_token && (!session.expires_at || session.expires_at > now + 60)) {
      return session.access_token;
    }

    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (error) {
      return null;
    }

    return refreshed.session?.access_token ?? null;
  }, []);

  const loadCredits = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;

      const res = await fetch("/api/credits", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "クレジット残高を取得できませんでした");
      }

      setCredits(Number(data.credits ?? 0));
    } catch {
      setCredits(null);
    }
  }, [getAuthToken]);

  const handleLogout = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  const loadHistory = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    setHistoryStatus("");
    try {
      const token = await getAuthToken();
      if (!token) {
        setHistoryItems([]);
        setHistoryStatus("ログイン状態を確認できませんでした。");
        return;
      }
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

      const res = await fetch(`/api/history?page=${page}&pageSize=500`, { headers });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "履歴を取得できませんでした");
      }

      setHistoryItems(data.history ?? []);
      setHistoryTotal(data.total ?? 0);
      setHistoryPage(page);
      setSelectedHistoryIds([]);
    } catch (error) {
      setHistoryItems([]);
      setSelectedHistoryIds([]);
      setHistoryStatus(error instanceof Error ? error.message : "履歴を取得できませんでした");
    } finally {
      setHistoryLoading(false);
    }
  }, [getAuthToken]);

  const toggleHistorySelection = useCallback((id: string) => {
    setSelectedHistoryIds(current =>
      current.includes(id) ? current.filter(selectedId => selectedId !== id) : [...current, id]
    );
  }, []);

  const deleteSelectedHistory = useCallback(async () => {
    if (selectedHistoryIds.length === 0 || historyDeleting) return;
    if (!window.confirm(`選択した${selectedHistoryIds.length}件の履歴を削除します。よろしいですか？`)) return;

    setHistoryDeleting(true);
    setHistoryStatus("選択した履歴を削除中...");
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error("ログイン状態を確認できませんでした。");
      }

      const res = await fetch("/api/history", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: selectedHistoryIds }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "履歴の削除に失敗しました");
      }

      const deletedIds = new Set<string>(data.deletedIds ?? selectedHistoryIds);
      setHistoryItems(current => current.filter(item => !deletedIds.has(item.id)));
      setSelectedHistoryIds([]);
      setHistoryStatus(`${deletedIds.size}件の履歴を削除しました。`);
    } catch (error) {
      setHistoryStatus(error instanceof Error ? error.message : "履歴の削除に失敗しました");
    } finally {
      setHistoryDeleting(false);
    }
  }, [getAuthToken, historyDeleting, selectedHistoryIds]);

  const loadCurrentUser = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    setUserEmail(data.user?.email ?? "");
  }, []);

  const handleUpdateAccount = useCallback(async () => {
    setMypageLoading(true);
    setMypageStatus("アカウント情報を更新中...");
    try {
      const supabase = createClient();
      const updates: { email?: string; password?: string } = {};
      if (mypageEmail && mypageEmail !== userEmail) updates.email = mypageEmail;
      if (mypagePassword) updates.password = mypagePassword;

      if (Object.keys(updates).length === 0) {
        setMypageStatus("変更内容がありません。");
        setMypageLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser(updates);
      if (error) throw error;

      setMypageStatus("アカウント情報を更新しました。メールアドレスを変更した場合は、確認メールのリンクをクリックしてください。");
      setMypagePassword("");
    } catch (error) {
      setMypageStatus(error instanceof Error ? error.message : "更新に失敗しました。");
    } finally {
      setMypageLoading(false);
    }
  }, [mypageEmail, mypagePassword, userEmail]);

  const startTopupCheckout = useCallback(async (packId: TopupPackId) => {
    setTopupLoadingPack(packId);
    const pack = TOPUP_PACKS[packId];
    setTopupStatus(pack.requiresInviteCode ? "招待コードを確認中..." : "PayPal決済ページを準備中...");
    try {
      const inviteCode = pack.requiresInviteCode ? trialInviteCode.trim() : undefined;
      if (pack.requiresInviteCode && !inviteCode) {
        throw new Error("お試しプランは招待コードを入力してください。");
      }

      const token = await getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      if (pack.requiresInviteCode) {
        const res = await fetch("/api/invite/redeem", {
          method: "POST",
          headers,
          body: JSON.stringify({ inviteCode }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error ?? "招待コードを適用できませんでした");
        }

        setCredits(Number(data.credits ?? 0));
        setTopupStatus(data.alreadyRedeemed ? "この招待コードは適用済みです。" : "無料お試しクレジットを付与しました。");
        setTopupLoadingPack(null);
        return;
      }

      const res = await fetch("/api/paypal/create-order", {
        method: "POST",
        headers,
        body: JSON.stringify({ packId, inviteCode }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        if (res.status === 401) {
          throw new Error("ログイン状態が切れています。もう一度ログインしてからチャージしてください。");
        }
        throw new Error(data.error ?? "PayPal決済ページを作成できませんでした");
      }

      window.location.href = data.url;
    } catch (error) {
      setTopupStatus(error instanceof Error ? error.message : "PayPal決済ページを作成できませんでした");
      setTopupLoadingPack(null);
    }
  }, [getAuthToken, trialInviteCode]);

  const loadAvatars = useCallback(async () => {
    setAvatarListLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        setAvatars([]);
        setAvatarStatus("ログインが必要です。");
        return;
      }

      const res = await fetch("/api/avatar", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "キャスト一覧を取得できませんでした");
      }

      setAvatars(data.avatars ?? []);
    } catch (error) {
      setAvatars([]);
      setAvatarStatus(error instanceof Error ? error.message : "キャスト一覧を取得できませんでした");
    } finally {
      setAvatarListLoading(false);
    }
  }, [getAuthToken]);

  const handleAvatarFiles = useCallback((files: FileList | null) => {
    const selected = Array.from(files ?? []).filter(file => file.type.startsWith("image/"));
    setAvatarFiles(selected);
    setAvatarPreviews(current => {
      current.forEach(url => URL.revokeObjectURL(url));
      return selected.map(file => URL.createObjectURL(file));
    });
    setAvatarStatus("");
  }, []);

  const submitAvatar = useCallback(async () => {
    if (!avatarName.trim() || avatarFiles.length === 0) return;
    if (avatars.length >= MAX_AVATARS) {
      setAvatarStatus(`登録済みキャストは${MAX_AVATARS}人までです。`);
      return;
    }

    setAvatarLoading(true);
    setAvatarStatus("キャストを登録中...");
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error("ログインが必要です。");
      }

      const formData = new FormData();
      formData.append("castName", avatarName.trim());
      avatarFiles.forEach(file => formData.append("photos", file));

      const res = await fetch("/api/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "キャスト登録に失敗しました");
      }

      setAvatarName("");
      setAvatarFiles([]);
      setAvatarPreviews(current => {
        current.forEach(url => URL.revokeObjectURL(url));
        return [];
      });
      setAvatarStatus("キャストを登録しました。");
      await loadAvatars();
    } catch (error) {
      setAvatarStatus(error instanceof Error ? error.message : "キャスト登録に失敗しました");
    } finally {
      setAvatarLoading(false);
    }
  }, [avatarFiles, avatarName, avatars.length, getAuthToken, loadAvatars]);

  const resetAvatarForm = useCallback(() => {
    setAvatarName("");
    setAvatarFiles([]);
    setAvatarStatus("");
    setAvatarPreviews(current => {
      current.forEach(url => URL.revokeObjectURL(url));
      return [];
    });
  }, []);

  const handleVideoUpload = useCallback((file: File) => {
    setVideoFile(file);
    setVideoSrc(URL.createObjectURL(file));
    setVideoResult(null);
    setVideoStatus("");
  }, []);

  const useAvatarForMosaic = useCallback(
    async (avatar: RegisteredAvatar) => {
      if (!avatar.face_image_url) {
        setMosaicStage("このキャストには使用できる画像がありません。");
        return;
      }

      setMosaicStage(`${avatar.name} の画像を読み込み中...`);
      try {
        const file = await imageUrlToFile(avatar.face_image_url, avatar.name);
        await handleMosaicUpload(file);
      } catch (error) {
        setMosaicStage(error instanceof Error ? error.message : "キャスト画像を読み込めませんでした。");
      }
    },
    [handleMosaicUpload]
  );

  const useAvatarForVideo = useCallback(
    async (avatar: RegisteredAvatar) => {
      if (!avatar.face_image_url) {
        setVideoStatus("このキャストには使用できる画像がありません。");
        return;
      }

      setVideoStatus(`${avatar.name} の画像を読み込み中...`);
      try {
        const file = await imageUrlToFile(avatar.face_image_url, avatar.name);
        handleVideoUpload(file);
        setVideoStatus(`${avatar.name} を元画像に設定しました。`);
      } catch (error) {
        setVideoStatus(error instanceof Error ? error.message : "キャスト画像を読み込めませんでした。");
      }
    },
    [handleVideoUpload]
  );

  const handleEditUpload = useCallback((file: File) => {
    setEditFile(file);
    setEditSrc(URL.createObjectURL(file));
    setEditResult(null);
    setEditStatus("");
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editFile) return;

    setEditLoading(true);
    setEditStatus("Grok Imagine で編集中...");

    try {
      const formData = new FormData();
      formData.append("file", editFile);
      formData.append("prompt", editPrompt);
      formData.append("model", editModel);
      formData.append("resolution", editResolution);

      const res = await fetch("/api/edit", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "編集に失敗しました");
      }

      setEditResult(data.url);
      lastSavedEditResultRef.current = data.url;
      void loadHistory();
      setEditStatus("編集が完了しました。");
    } catch (error) {
      setEditStatus(error instanceof Error ? error.message : "編集に失敗しました");
    } finally {
      setEditLoading(false);
    }
  }, [editFile, editPrompt, editResolution, loadHistory]);

  const resetEdit = useCallback(() => {
    setEditFile(null);
    setEditSrc(null);
    setEditResult(null);
    setEditStatus("");
  }, []);

  const submitFaceswap = useCallback(async () => {
    if (!faceFile || !targetFile) return;
    setFaceswapLoading(true);
    setFaceswapStatus("画像をアップロード中...");
    setFaceswapResult(null);
    try {
      const token = await getAuthToken();
      const formData = new FormData();
      formData.append("face_file", faceFile);
      formData.append("target_file", targetFile);
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      setFaceswapStatus("顔ハメ処理中...");
      const res = await fetch("/api/faceswap", { method: "POST", headers, body: formData });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "顔ハメに失敗しました");
      setFaceswapResult(data.url);
      setFaceswapStatus("完成！");
      if (data.credits != null) setCredits(data.credits);
      void loadHistory();
    } catch (error) {
      setFaceswapStatus(error instanceof Error ? error.message : "エラーが発生しました");
    } finally {
      setFaceswapLoading(false);
    }
  }, [faceFile, targetFile, getAuthToken, loadHistory]);

  const resetFaceswap = useCallback(() => {
    setFaceFile(null);
    setFaceSrc(null);
    setTargetFile(null);
    setTargetSrc(null);
    setFaceswapResult(null);
    setFaceswapStatus("");
  }, []);

  const submitAnalyze = useCallback(async () => {
    if (!analyzeFile) return;
    setAnalyzeLoading(true);
    setAnalyzeStatus("画像を解析中...");
    setAnalyzePrompt("");
    setAnalyzePromptJa("");
    setAnalyzeResult(null);
    try {
      const token = await getAuthToken();
      const formData = new FormData();
      formData.append("image_file", analyzeFile);
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/analyze-image", { method: "POST", headers, body: formData });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "解析に失敗しました");
      setAnalyzePrompt(data.prompt);
      setAnalyzePromptJa(data.promptJa ?? "");
      setAnalyzeStatus("プロンプト生成完了！内容を確認・編集して「画像生成」を押してください。");
    } catch (error) {
      setAnalyzeStatus(error instanceof Error ? error.message : "エラーが発生しました");
    } finally {
      setAnalyzeLoading(false);
    }
  }, [analyzeFile, getAuthToken]);

  const submitTextToImage = useCallback(async () => {
    const effectivePrompt = analyzePromptJa.trim() || analyzePrompt.trim();
    if (!effectivePrompt || !analyzeFile) return;
    setAnalyzeGenLoading(true);
    setAnalyzeStatus("画像を編集中...");
    setAnalyzeResult(null);
    try {
      const token = await getAuthToken();
      const formData = new FormData();
      formData.append("file", analyzeFile);
      formData.append("prompt", effectivePrompt);
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/edit", { method: "POST", headers, body: formData });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "画像編集に失敗しました");
      setAnalyzeResult(data.url);
      setAnalyzeStatus("完成！");
      if (data.credits != null) setCredits(data.credits);
      void loadHistory();
    } catch (error) {
      setAnalyzeStatus(error instanceof Error ? error.message : "エラーが発生しました");
    } finally {
      setAnalyzeGenLoading(false);
    }
  }, [analyzePromptJa, analyzePrompt, analyzeFile, getAuthToken, loadHistory]);

  const useResultForFurtherEdit = useCallback(async () => {
    if (!analyzeResult) return;
    try {
      const resp = await fetch(analyzeResult);
      const blob = await resp.blob();
      const file = new File([blob], "edited-result.jpg", { type: blob.type || "image/jpeg" });
      setAnalyzeFile(file);
      setAnalyzeSrc(analyzeResult);
      setAnalyzeResult(null);
      setAnalyzeStatus("編集結果を読み込みました。プロンプトを変更して再編集できます。");
    } catch {
      setAnalyzeStatus("画像の読み込みに失敗しました");
    }
  }, [analyzeResult]);

  const sendResultToVideo = useCallback(async () => {
    if (!analyzeResult) return;
    try {
      const resp = await fetch(analyzeResult);
      const blob = await resp.blob();
      const file = new File([blob], "edited-result.jpg", { type: blob.type || "image/jpeg" });
      handleVideoUpload(file);
      setTab("video");
    } catch {
      setAnalyzeStatus("画像の読み込みに失敗しました");
    }
  }, [analyzeResult, handleVideoUpload]);

  const useEditResultForFurtherEdit = useCallback(async () => {
    if (!editResult) return;
    try {
      const resp = await fetch(editResult);
      const blob = await resp.blob();
      const file = new File([blob], "edit-result.jpg", { type: blob.type || "image/jpeg" });
      handleEditUpload(file);
      setEditStatus("編集結果を読み込みました。プロンプトを変えて再編集できます。");
    } catch {
      setEditStatus("画像の読み込みに失敗しました");
    }
  }, [editResult, handleEditUpload]);

  const submitVideo = useCallback(async () => {
    if (!videoFile) return;
    setVideoLoading(true);
    setVideoStitchPart1(null);
    setVideoStitchPart2(null);
    setVideoStitchStatus("");
    setVideoStatus("画像をアップロード中...");
    videoPollErrorCountRef.current = 0;
    videoPollErrorCountRef2.current = 0;
    try {
      const formData = new FormData();
      formData.append("file", videoFile);
      formData.append("model", videoModel);
      formData.append("prompt", videoPrompt);
      formData.append("duration", String(videoDuration));
      formData.append("resolution", videoResolution);
      const res = await fetch("/api/video", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "提出に失敗しました");
      setVideoRequestId(data.requestId);
      if (videoStitchMode && videoModel === "grok_v15") {
        // 2本目も同時投入
        const formData2 = new FormData();
        formData2.append("file", videoFile);
        formData2.append("model", videoModel);
        formData2.append("prompt", videoPrompt);
        formData2.append("duration", String(videoDuration));
        formData2.append("resolution", videoResolution);
        const res2 = await fetch("/api/video", { method: "POST", body: formData2 });
        const data2 = await res2.json();
        if (!res2.ok || data2.error) throw new Error(data2.error ?? "2本目の提出に失敗しました");
        setVideoRequestId2(data2.requestId);
        setVideoStatus("30秒動画を生成中（2本同時生成）...");
      } else {
        setVideoStatus("生成キューに追加しました。しばらくお待ちください...");
      }
    } catch (error) {
      setVideoStatus(error instanceof Error ? error.message : "エラーが発生しました");
      setVideoLoading(false);
    }
  }, [videoDuration, videoFile, videoModel, videoPrompt, videoResolution, videoStitchMode]);

  useEffect(() => {
    if (!videoRequestId) return;
    const pollVideoStatus = async () => {
      try {
        const params = new URLSearchParams({
          requestId: videoRequestId,
          model: videoModel,
          prompt: videoPrompt,
          duration: String(videoDuration),
          resolution: videoResolution,
        });
        const res = await fetch(`/api/video?${params.toString()}`);
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error ?? "動画生成の状態確認に失敗しました");
        }
        videoPollErrorCountRef.current = 0;
        if (data.status === "completed") {
          clearInterval(videoPollRef.current!);
          setVideoRequestId(null);
          if (videoStitchMode && videoModel === "grok_v15") {
            setVideoStitchPart1(data.videoUrl);
            setVideoStitchStatus(prev => prev === "part2_done" ? "both_done" : "part1_done");
            setVideoStatus("1本目完成！2本目を待機中...");
          } else {
            setVideoResult(data.videoUrl);
            lastSavedVideoResultRef.current = data.videoUrl;
            void loadHistory();
            setVideoLoading(false);
            setVideoStatus("完成！");
          }
        } else if (data.status === "failed") {
          clearInterval(videoPollRef.current!);
          setVideoRequestId(null);
          setVideoLoading(false);
          setVideoStatus("生成に失敗しました");
        } else {
          const pos = (data as { queue_position?: number }).queue_position;
          const falStatus = (data as { falStatus?: string }).falStatus;
          setVideoStatus(
            pos != null
              ? `生成待ち... (キュー位置: ${pos})`
              : falStatus === "IN_PROGRESS"
                ? "生成処理中..."
                : "生成中..."
          );
        }
      } catch (error) {
        videoPollErrorCountRef.current += 1;
        if (videoPollErrorCountRef.current >= 2) {
          clearInterval(videoPollRef.current!);
          setVideoRequestId(null);
          setVideoLoading(false);
          setVideoStatus(error instanceof Error ? error.message : "動画生成の状態確認に失敗しました");
        }
      }
    };
    void pollVideoStatus();
    videoPollRef.current = setInterval(() => void pollVideoStatus(), 5000);
    return () => { if (videoPollRef.current) clearInterval(videoPollRef.current); };
  }, [videoDuration, videoModel, videoPrompt, videoRequestId, videoResolution, loadHistory]);

  // stitch 2本目ポーリング
  useEffect(() => {
    if (!videoRequestId2) return;
    const modelId = videoModel;
    const pollVideo2 = async () => {
      try {
        const params = new URLSearchParams({
          requestId: videoRequestId2,
          model: modelId,
          prompt: videoPrompt,
          duration: String(videoDuration),
          resolution: videoResolution,
        });
        const res = await fetch(`/api/video?${params.toString()}`);
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? "2本目の状態確認に失敗しました");
        videoPollErrorCountRef2.current = 0;
        if (data.status === "completed") {
          clearInterval(videoPollRef2.current!);
          setVideoRequestId2(null);
          setVideoStitchPart2(data.videoUrl);
          setVideoStitchStatus(prev => prev === "part1_done" ? "both_done" : "part2_done");
        } else {
          const pos = (data as { queue_position?: number }).queue_position;
          const falStatus = (data as { falStatus?: string }).falStatus;
          setVideoStatus(
            pos != null
              ? `30秒動画を生成中... 2本目 (キュー: ${pos})`
              : falStatus === "IN_PROGRESS"
                ? "30秒動画を生成中... 2本目処理中"
                : "30秒動画を生成中..."
          );
        }
      } catch (error) {
        videoPollErrorCountRef2.current += 1;
        if (videoPollErrorCountRef2.current >= 2) {
          clearInterval(videoPollRef2.current!);
          setVideoRequestId2(null);
          setVideoLoading(false);
          setVideoStatus(error instanceof Error ? error.message : "2本目の生成に失敗しました");
        }
      }
    };
    void pollVideo2();
    videoPollRef2.current = setInterval(() => void pollVideo2(), 5000);
    return () => { if (videoPollRef2.current) clearInterval(videoPollRef2.current); };
  }, [videoDuration, videoModel, videoPrompt, videoRequestId2, videoResolution]);

  // stitch: 両方完了したらloadingを解除
  useEffect(() => {
    if (videoStitchStatus === "both_done" || (videoStitchPart1 && videoStitchPart2 && !videoRequestId && !videoRequestId2)) {
      setVideoLoading(false);
      setVideoStatus("完成！（30秒 2本連続再生）");
      void loadHistory();
    }
  }, [videoStitchPart1, videoStitchPart2, videoRequestId, videoRequestId2, videoStitchStatus, loadHistory]);

  useEffect(() => {
    if (tab === "avatar" || tab === "mosaic" || tab === "video") {
      void loadAvatars();
    }
  }, [loadAvatars, tab]);

  useEffect(() => {
    if (tab === "history") {
      void loadHistory();
    }
  }, [loadHistory, tab]);

  useEffect(() => {
    void loadCredits();
  }, [loadCredits]);

  useEffect(() => {
    fetch("/api/blocked-keywords")
      .then(r => r.json())
      .then(data => { if (data.keywords) setBlockedKeywords(data.keywords); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void loadCurrentUser();
  }, [loadCurrentUser]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paypalStatus = params.get("paypal");
    const orderId = params.get("token");

    if (paypalStatus === "canceled") {
      setTab("plan");
      setTopupStatus("PayPal決済をキャンセルしました。");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (paypalStatus !== "success" || !orderId || paypalCaptureStartedRef.current) {
      return;
    }

    paypalCaptureStartedRef.current = true;
    setTab("plan");
    setTopupStatus("PayPal決済を確認中...");

    void (async () => {
      try {
        const token = await getAuthToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch("/api/paypal/capture-order", {
          method: "POST",
          headers,
          body: JSON.stringify({ orderId }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          if (res.status === 401) {
            throw new Error("ログイン状態が切れています。もう一度ログインしてからPayPal決済を確定してください。");
          }
          throw new Error(data.error ?? "PayPal決済の確定に失敗しました");
        }

        setCredits(Number(data.credits ?? 0));
        setTopupStatus(data.alreadyProcessed ? "このPayPal決済は反映済みです。" : "PayPalチャージが完了しました。");
        window.history.replaceState({}, "", window.location.pathname);
      } catch (error) {
        setTopupStatus(error instanceof Error ? error.message : "PayPal決済の確定に失敗しました");
      }
    })();
  }, [getAuthToken]);

  const renderPlaceholder = (title: string, body: string) => (
    <div style={panelStyle}>
      <div style={{ fontSize: 18, fontWeight: 500, color: "#f0ece4", marginBottom: 12 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#b8c0c4", lineHeight: 1.8 }}>{body}</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#071e28", color: "#f0ece4", fontFamily: "var(--font-lumiveil-sans)" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .sidebar { display: flex; }
        .mobile-menu-button { display: none !important; }
        .mobile-email { display: block; }
        @media (max-width: 820px) {
          .layout-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 680px) {
          .sidebar { display: none !important; }
          .mobile-menu-button { display: inline-flex !important; }
          .mobile-email { display: none !important; }
          .main-content { padding-bottom: 18px !important; }
        }
        @keyframes lumiveil-orbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes lumiveil-breathe {
          0%, 100% { opacity: 0.45; transform: scale(0.88); }
          50% { opacity: 1; transform: scale(1); }
        }
        @keyframes lumiveil-shimmer {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(120%); }
        }
        .lumiveil-loader-orbit {
          animation: lumiveil-orbit 1.15s linear infinite;
        }
        .lumiveil-loader-dot {
          animation: lumiveil-breathe 1.2s ease-in-out infinite;
        }
        .lumiveil-loader-dot:nth-child(2) {
          animation-delay: 0.18s;
        }
        .lumiveil-loader-dot:nth-child(3) {
          animation-delay: 0.36s;
        }
        .lumiveil-loader-shimmer {
          animation: lumiveil-shimmer 1.45s ease-in-out infinite;
        }
      `}</style>

      <div style={{ background: "#071e28", borderBottom: "1px solid #163645", padding: "0 16px", height: 48, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            className="mobile-menu-button"
            aria-label="メニューを開く"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(current => !current)}
            style={{
              width: 32,
              height: 32,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: "1px solid rgba(201,168,76,0.28)",
              background: "rgba(255,255,255,0.04)",
              color: "#f0ece4",
              cursor: "pointer",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <span style={{ width: 15, height: 1, background: "currentColor", display: "block" }} />
            <span style={{ width: 15, height: 1, background: "currentColor", display: "block" }} />
            <span style={{ width: 15, height: 1, background: "currentColor", display: "block" }} />
          </button>
          <div style={{ width: 24, height: 24, background: "#c9a84c", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, color: "#071e28" }}>L</div>
          <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: "0.08em" }}>LUMIVEIL</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)", borderRadius: 999, padding: "3px 10px", fontSize: 11, color: "#c9a84c" }}>
            ◆ {credits == null ? "--" : credits.toLocaleString("ja-JP")} クレジット
          </div>
          <button
            onClick={() => { window.location.href = "/account"; }}
            style={{
              padding: "5px 10px",
              borderRadius: 999,
              border: "1px solid rgba(201,168,76,0.25)",
              background: "rgba(201,168,76,0.08)",
              color: "#c9a84c",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            マイページ
          </button>
          {userEmail ? (
            <div
              className="mobile-email"
              title={userEmail}
              style={{
                maxWidth: 220,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "#b8c0c4",
                fontSize: 11,
              }}
            >
              {userEmail}
            </div>
          ) : null}
          <button
            onClick={() => void handleLogout()}
            style={{
              padding: "5px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.04)",
              color: "#b8c0c4",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ログアウト
          </button>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.46)",
            zIndex: 80,
          }}
        >
          <nav
            aria-label="スマホメニュー"
            onClick={event => event.stopPropagation()}
            style={{
              width: "min(82vw, 300px)",
              height: "100%",
              background: "#071e28",
              borderRight: "1px solid #163645",
              padding: "64px 0 18px",
              boxShadow: "18px 0 42px rgba(0,0,0,0.32)",
            }}
          >
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setTab(item.id);
                  setMobileMenuOpen(false);
                }}
                style={{
                  width: "100%",
                  padding: "13px 18px",
                  border: "none",
                  background: tab === item.id ? "rgba(201,168,76,0.1)" : "transparent",
                  borderLeft: tab === item.id ? "3px solid #c9a84c" : "3px solid transparent",
                  color: tab === item.id ? "#c9a84c" : "#d8dde0",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 14,
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      ) : null}

      <div style={{ display: "flex", minHeight: "calc(100vh - 48px)" }}>
        <div className="sidebar" style={{ width: 168, background: "#071e28", borderRight: "1px solid #163645", flexDirection: "column", padding: "12px 0", flexShrink: 0 }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "none",
                background: tab === item.id ? "rgba(201,168,76,0.08)" : "transparent",
                borderLeft: tab === item.id ? "2px solid #c9a84c" : "2px solid transparent",
                color: tab === item.id ? "#c9a84c" : "#9ba8ae",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                textAlign: "left",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="main-content" style={{ flex: 1, padding: 16, overflowY: "auto" }}>
          {tab === "generate"
            ? renderPlaceholder(
                NAV_ITEMS.find(item => item.id === tab)?.label ?? "LUMIVEIL",
                "この画面は順次移植中です。まずはモザイク機能を安定させ、MediaPipe Face Landmarker と微調整UIを優先しています。"
              )
            : null}

          {tab === "analyze" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* 画像アップロード */}
              <DropZone onFile={file => { setAnalyzeFile(file); setAnalyzeSrc(URL.createObjectURL(file)); setAnalyzePrompt(""); setAnalyzePromptJa(""); setAnalyzeResult(null); setAnalyzeStatus(""); }} style={panelStyle}>
                <div style={sectionLabelStyle}>解析する画像</div>
                <label style={uploadButtonStyle}>
                  画像を選択する
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setAnalyzeFile(file);
                      setAnalyzeSrc(URL.createObjectURL(file));
                      setAnalyzePrompt("");
                      setAnalyzePromptJa("");
                      setAnalyzeResult(null);
                      setAnalyzeStatus("");
                    }}
                  />
                </label>
                {analyzeSrc && (
                  <div style={{ marginTop: 12, borderRadius: 10, overflow: "hidden", background: "#000", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <img src={analyzeSrc} alt="解析画像" style={{ width: "100%", maxHeight: 320, objectFit: "contain", display: "block" }} />
                  </div>
                )}
                <button
                  onClick={() => void submitAnalyze()}
                  disabled={!analyzeFile || analyzeLoading}
                  style={{ ...actionButtonStyle, width: "100%", marginTop: 12, opacity: !analyzeFile || analyzeLoading ? 0.5 : 1, cursor: !analyzeFile || analyzeLoading ? "not-allowed" : "pointer" }}
                >
                  {analyzeLoading ? "解析中..." : "① プロンプトを生成"}
                </button>
              </DropZone>

              {/* 生成プロンプト */}
              <div style={panelStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={sectionLabelStyle}>生成プロンプト（編集可）</div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: "#9b8c5a", padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(155,140,90,0.4)", background: "rgba(155,140,90,0.08)" }}>
                    {analyzeSrc
                      ? <img src={analyzeSrc} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4 }} />
                      : <span style={{ fontSize: 16 }}>＋</span>}
                    画像を選択
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setAnalyzeFile(file);
                        setAnalyzeSrc(URL.createObjectURL(file));
                        setAnalyzeResult(null);
                        setAnalyzeStatus("");
                      }}
                    />
                  </label>
                </div>
                <div style={{ fontSize: 11, color: "#8a7e6a", marginBottom: 4, marginTop: 8 }}>英語プロンプト</div>
                <textarea
                  value={analyzePrompt}
                  onChange={e => setAnalyzePrompt(e.target.value)}
                  placeholder="① でプロンプトが生成されます。手動で入力することもできます。"
                  rows={4}
                  style={{
                    width: "100%",
                    background: "rgba(0,0,0,0.15)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8,
                    color: "#f5f0e8",
                    fontSize: 12,
                    padding: "10px 12px",
                    resize: "vertical",
                    fontFamily: "inherit",
                    lineHeight: 1.6,
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ fontSize: 11, color: "#8a7e6a", marginBottom: 4, marginTop: 10 }}>日本語プロンプト（編集可）</div>
                <textarea
                  value={analyzePromptJa}
                  onChange={e => setAnalyzePromptJa(e.target.value)}
                  placeholder="① でプロンプトが生成されます。"
                  rows={4}
                  style={{
                    width: "100%",
                    background: "rgba(0,0,0,0.15)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8,
                    color: "#f5f0e8",
                    fontSize: 12,
                    padding: "10px 12px",
                    resize: "vertical",
                    fontFamily: "inherit",
                    lineHeight: 1.6,
                    boxSizing: "border-box",
                  }}
                />
                <FavoritesPanel
                  currentPrompt={analyzePromptJa || analyzePrompt}
                  panelId="analyze"
                  favorites={promptFavorites}
                  openFor={favoritesOpenFor}
                  onToggle={id => setFavoritesOpenFor(prev => prev === id ? null : id)}
                  onAdd={addFavorite}
                  onRemove={removeFavorite}
                  onSelect={p => setAnalyzePromptJa(p)}
                />
                {analyzeStatus && (
                  <div style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: analyzeStatus.includes("エラー") || analyzeStatus.includes("失敗") ? "#e06060" : analyzeStatus === "完成！" ? "#4a8a6a" : "#6a6258",
                    background: "rgba(0,0,0,0.06)",
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}>
                    {analyzeStatus}
                  </div>
                )}
                <button
                  onClick={() => void submitTextToImage()}
                  disabled={!(analyzePromptJa.trim() || analyzePrompt.trim()) || !analyzeFile || analyzeGenLoading}
                  style={{ ...actionButtonStyle, width: "100%", marginTop: 12, opacity: !(analyzePromptJa.trim() || analyzePrompt.trim()) || !analyzeFile || analyzeGenLoading ? 0.5 : 1, cursor: !(analyzePromptJa.trim() || analyzePrompt.trim()) || !analyzeFile || analyzeGenLoading ? "not-allowed" : "pointer" }}
                >
                  {analyzeGenLoading ? "編集中..." : "② 画像を編集（1クレジット）"}
                </button>
              </div>

              {/* 編集結果 */}
              {analyzeResult && (
                <div style={panelStyle}>
                  <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>編集結果</div>
                  <div style={{ borderRadius: 10, overflow: "hidden", background: "#000", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <img src={analyzeResult} alt="編集結果" style={{ width: "100%", objectFit: "contain", display: "block" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={() => void useResultForFurtherEdit()}
                      style={{ ...actionButtonStyle, flex: 1, minWidth: 100 }}
                    >
                      追加編集
                    </button>
                    <button
                      onClick={() => void sendResultToVideo()}
                      style={{ ...actionButtonStyle, flex: 1, minWidth: 100 }}
                    >
                      動画生成へ
                    </button>
                    <button
                      onClick={() => void saveFileAs(analyzeResult, undefined, "ai-generated.jpg")}
                      style={{ ...actionButtonStyle, flex: 1, minWidth: 100 }}
                    >
                      ダウンロード
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {tab === "history" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={panelStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={sectionLabelStyle}>生成履歴</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                      <div style={{ fontSize: 20, fontWeight: 500, color: "#171717" }}>生成した画像・動画</div>
                      <div style={{ fontSize: 11, color: "#9b8c5a" }}>※ 動画は約1時間で失効します</div>
                    </div>
                    <div style={{ fontSize: 12, color: "#4e4a43", lineHeight: 1.7 }}>
                      アカウントに紐づいた画像・動画生成の結果を新しい順に500件ずつ表示します。{historyTotal > 0 ? `（全${historyTotal}件）` : ""}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: "#9b8c5a", lineHeight: 1.6 }}>
                      ※ 過去に生成したファイルは約1時間で失効します。現在は生成時にサーバーへ自動保存されるため、以降の生成物は永続的に保持されます。
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button onClick={() => void loadHistory()} disabled={historyLoading || historyDeleting} style={smallButtonStyle}>
                      {historyLoading ? "更新中..." : "更新"}
                    </button>
                    <button
                      onClick={() => void deleteSelectedHistory()}
                      disabled={selectedHistoryIds.length === 0 || historyDeleting}
                      style={{
                        ...smallButtonStyle,
                        borderColor: selectedHistoryIds.length > 0 ? "#b84242" : "#a89e8e",
                        color: selectedHistoryIds.length > 0 ? "#b84242" : "#5f5648",
                        opacity: selectedHistoryIds.length === 0 || historyDeleting ? 0.5 : 1,
                        cursor: selectedHistoryIds.length === 0 || historyDeleting ? "not-allowed" : "pointer",
                      }}
                    >
                      {historyDeleting ? "削除中..." : selectedHistoryIds.length > 0 ? `${selectedHistoryIds.length}件削除` : "選択削除"}
                    </button>
                  </div>
                </div>
              </div>

              {historyStatus ? (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "rgba(201,168,76,0.14)",
                    border: "1px solid rgba(201,168,76,0.35)",
                    color: historyStatus.includes("ログイン") || historyStatus.includes("取得できません") ? "#b84242" : "#6f5310",
                    fontSize: 12,
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ flex: 1 }}>{historyStatus}</span>
                  {historyStatus.includes("ログイン状態を確認できませんでした") && (
                    <a
                      href="/login"
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid #b84242",
                        background: "rgba(184,66,66,0.12)",
                        color: "#b84242",
                        fontSize: 11,
                        fontWeight: 600,
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      再ログイン
                    </a>
                  )}
                </div>
              ) : null}

              {historyLoading ? (
                <div style={panelStyle}>
                  <div style={{ minHeight: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#5f5648", fontSize: 13 }}>
                    履歴を読み込み中...
                  </div>
                </div>
              ) : historyItems.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14 }}>
                  {historyItems.map(item => {
                    const hasMedia = Boolean(item.generated_image_url);
                    const isVideo = item.media_type === "video" || isVideoHistoryUrl(item.generated_image_url);
                    const selected = selectedHistoryIds.includes(item.id);
                    const displayPrompt = extractDisplayPrompt(item.prompt);

                    return (
                    <div key={item.id} style={{ ...panelStyle, padding: 0, overflow: "hidden", borderColor: selected ? "#b84242" : "#a89e8e", position: "relative" }}>
                      <label
                        style={{
                          position: "absolute",
                          top: 8,
                          left: 8,
                          zIndex: 2,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 8px",
                          borderRadius: 999,
                          background: selected ? "rgba(184,66,66,0.92)" : "rgba(0,0,0,0.62)",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleHistorySelection(item.id)}
                          style={{ width: 13, height: 13, accentColor: "#b84242" }}
                        />
                        選択
                      </label>
                      <div style={{ display: "block", aspectRatio: "3 / 4", background: "#111", overflow: "hidden" }}>
                        {!hasMedia ? (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 12, padding: 16, textAlign: "center" }}>
                            メディアURL未保存
                          </div>
                        ) : isVideo ? (
                          <video
                            src={item.generated_image_url}
                            controls
                            muted
                            playsInline
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          />
                        ) : (
                          <a href={item.generated_image_url} target="_blank" rel="noreferrer" style={{ display: "block", width: "100%", height: "100%" }}>
                            <img
                              src={item.generated_image_url}
                              alt={item.prompt ?? "生成画像"}
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />
                          </a>
                        )}
                      </div>
                      <div style={{ padding: 12 }}>
                        <div style={{ fontSize: 11, color: "#6a6258", marginBottom: 8 }}>
                          {new Date(item.created_at).toLocaleString("ja-JP", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        <div
                          style={{
                            minHeight: 42,
                            color: "#171717",
                            fontSize: 12,
                            lineHeight: 1.6,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {displayPrompt || "プロンプトなし"}
                        </div>
                        {displayPrompt && (
                          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                            <button
                              onClick={() => void navigator.clipboard.writeText(displayPrompt)}
                              style={{ ...smallButtonStyle, fontSize: 10, padding: "2px 8px" }}
                            >
                              コピー
                            </button>
                            <button
                              onClick={() => addFavorite(displayPrompt)}
                              style={{ ...smallButtonStyle, fontSize: 10, padding: "2px 8px", background: "#9b8c5a", color: "#fff", border: "1px solid #9b8c5a" }}
                            >
                              ★ お気に入り
                            </button>
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10 }}>
                          <span style={{ fontSize: 11, color: "#6a6258" }}>
                            {item.credits_used ?? 1} credit
                          </span>
                          <button
                            disabled={!hasMedia || historyDownloadingId === item.id}
                            onClick={async () => {
                              if (!hasMedia || historyDownloadingId) return;
                              setHistoryDownloadingId(item.id);
                              const fallback = isVideo ? "video.mp4" : "image.jpg";
                              try {
                                await saveFileAs(item.generated_image_url, null, fallback);
                              } catch {
                                // ignore user cancel
                              } finally {
                                setHistoryDownloadingId(null);
                              }
                            }}
                            style={{ ...smallButtonStyle, opacity: hasMedia ? 1 : 0.5, cursor: hasMedia ? "pointer" : "not-allowed" }}
                          >
                            {historyDownloadingId === item.id ? "保存中..." : "保存"}
                          </button>
                        </div>
                        {!isVideo && hasMedia && (
                          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                            <button
                              disabled={historyToEditId === item.id}
                              onClick={async () => {
                                if (historyToEditId) return;
                                setHistoryToEditId(item.id);
                                try {
                                  const filename = item.generated_image_url.split("/").pop() ?? "image.jpg";
                                  const file = await imageUrlToFile(item.generated_image_url, filename);
                                  handleEditUpload(file);
                                  setTab("edit");
                                } catch {
                                  // ignore
                                } finally {
                                  setHistoryToEditId(null);
                                }
                              }}
                              style={{
                                ...smallButtonStyle,
                                flex: 1,
                                background: historyToEditId === item.id ? "#555" : "#4a3a28",
                                color: "#f5f0e8",
                                cursor: historyToEditId === item.id ? "not-allowed" : "pointer",
                              }}
                            >
                              {historyToEditId === item.id ? "読み込み中..." : "✏ 画像編集"}
                            </button>
                            <button
                              disabled={historyToVideoId === item.id}
                              onClick={async () => {
                                if (historyToVideoId) return;
                                setHistoryToVideoId(item.id);
                                try {
                                  const filename = item.generated_image_url.split("/").pop() ?? "image.jpg";
                                  const file = await imageUrlToFile(item.generated_image_url, filename);
                                  handleVideoUpload(file);
                                  setTab("video");
                                } catch {
                                  // ignore
                                } finally {
                                  setHistoryToVideoId(null);
                                }
                              }}
                              style={{
                                ...smallButtonStyle,
                                flex: 1,
                                background: historyToVideoId === item.id ? "#555" : "#3a3028",
                                color: "#f5f0e8",
                                cursor: historyToVideoId === item.id ? "not-allowed" : "pointer",
                              }}
                            >
                              {historyToVideoId === item.id ? "読み込み中..." : "▶ 動画生成"}
                            </button>
                            {!isVideo && (
                              <button
                                disabled={historyToAvatarId === item.id}
                                onClick={async () => {
                                  if (historyToAvatarId) return;
                                  setHistoryToAvatarId(item.id);
                                  try {
                                    const filename = item.generated_image_url.split("/").pop() ?? "image.jpg";
                                    const file = await imageUrlToFile(item.generated_image_url, filename);
                                    setAvatarFiles([file]);
                                    setAvatarPreviews([URL.createObjectURL(file)]);
                                    setAvatarName("");
                                    setTab("avatar");
                                  } catch {
                                    // ignore
                                  } finally {
                                    setHistoryToAvatarId(null);
                                  }
                                }}
                                style={{
                                  ...smallButtonStyle,
                                  flex: 1,
                                  background: historyToAvatarId === item.id ? "#555" : "#283a30",
                                  color: "#f5f0e8",
                                  cursor: historyToAvatarId === item.id ? "not-allowed" : "pointer",
                                }}
                              >
                                {historyToAvatarId === item.id ? "読み込み中..." : "👤 キャスト登録"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              ) : (
                <div style={panelStyle}>
                  <div
                    style={{
                      minHeight: 260,
                      borderRadius: 12,
                      border: "1px dashed #9b927f",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#5f5648",
                      background: "rgba(0,0,0,0.03)",
                      fontSize: 13,
                      textAlign: "center",
                      padding: 20,
                    }}
                  >
                    まだ生成履歴はありません。
                  </div>
                </div>
              )}

              {/* ページネーション */}
              {historyTotal > HISTORY_PAGE_SIZE && (() => {
                const totalPages = Math.ceil(historyTotal / HISTORY_PAGE_SIZE);
                const btnStyle: CSSProperties = {
                  fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer",
                  border: "1px solid rgba(155,140,90,0.5)", background: "rgba(155,140,90,0.08)",
                  color: "#7a6a40", fontFamily: "inherit",
                };
                const disabledStyle: CSSProperties = { ...btnStyle, opacity: 0.35, cursor: "not-allowed" };
                return (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", flexWrap: "wrap" }}>
                    <button style={historyPage === 1 ? disabledStyle : btnStyle} disabled={historyPage === 1 || historyLoading} onClick={() => void loadHistory(1)}>最初</button>
                    <button style={historyPage === 1 ? disabledStyle : btnStyle} disabled={historyPage === 1 || historyLoading} onClick={() => void loadHistory(historyPage - 1)}>← 前</button>
                    <span style={{ fontSize: 12, color: "#5f5648", padding: "0 4px" }}>{historyPage} / {totalPages} ページ（全{historyTotal}件）</span>
                    <button style={historyPage === totalPages ? disabledStyle : btnStyle} disabled={historyPage === totalPages || historyLoading} onClick={() => void loadHistory(historyPage + 1)}>次 →</button>
                    <button style={historyPage === totalPages ? disabledStyle : btnStyle} disabled={historyPage === totalPages || historyLoading} onClick={() => void loadHistory(totalPages)}>最後</button>
                  </div>
                );
              })()}
            </div>
          ) : null}

          {tab === "plan" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={panelStyle}>
                <div style={sectionLabelStyle}>クレジット</div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 500, color: "#171717", marginBottom: 6 }}>クレジットチャージ</div>
                    <div style={{ fontSize: 12, color: "#4e4a43", lineHeight: 1.7 }}>
                      画像生成、画像編集、動画生成、キャスト登録に使うクレジットを追加できます。
                      目安は写真1枚あたり約{PHOTO_CREDITS_ESTIMATE}クレジット、動画1本あたり約{VIDEO_CREDITS_ESTIMATE}クレジットです。
                    </div>
                  </div>
                  <div style={{ minWidth: 140, padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,0.07)", border: "1px solid #a89e8e" }}>
                    <div style={{ fontSize: 10, color: "#6a6258", fontWeight: 500, marginBottom: 4 }}>現在の残高</div>
                    <div style={{ fontSize: 20, color: "#111", fontWeight: 500 }}>
                      {credits == null ? "--" : credits.toLocaleString("ja-JP")}
                    </div>
                  </div>
                </div>
              </div>

              {topupStatus ? (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "rgba(201,168,76,0.14)",
                    border: "1px solid rgba(201,168,76,0.35)",
                    color: topupStatus.includes("必要") || topupStatus.includes("できません") || topupStatus.includes("正しく") ? "#b84242" : "#6f5310",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {topupStatus}
                </div>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
                {TOPUP_PACK_LIST.map(pack => (
                  <div key={pack.id} style={panelStyle}>
                    <div style={{ display: "flex", flexDirection: "column", minHeight: 168 }}>
                      <div style={sectionLabelStyle}>{pack.caption}</div>
                      <div style={{ fontSize: 18, fontWeight: 500, color: "#171717", marginBottom: 8 }}>{pack.name}</div>
                      <div style={{ fontSize: 28, fontWeight: 500, color: "#111", lineHeight: 1 }}>
                        {pack.credits.toLocaleString("ja-JP")}
                      </div>
                      <div style={{ fontSize: 11, color: "#6a6258", marginTop: 4 }}>クレジット</div>
                      <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,0.06)", border: "1px solid rgba(0,0,0,0.08)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#171717", marginBottom: 6 }}>
                          <span>写真</span>
                          <strong style={{ fontWeight: 500 }}>
                            約{(pack.freeImageGenerations ?? Math.floor(pack.credits / PHOTO_CREDITS_ESTIMATE)).toLocaleString("ja-JP")}枚
                          </strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#171717" }}>
                          <span>動画</span>
                          <strong style={{ fontWeight: 500 }}>
                            約{(pack.freeVideoGenerations ?? Math.floor(pack.credits / VIDEO_CREDITS_ESTIMATE)).toLocaleString("ja-JP")}本
                          </strong>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 10, color: "#6a6258", lineHeight: 1.5 }}>
                          画質・動画サイズ・動画の長さによって異なります。
                        </div>
                      </div>
                      {pack.requiresInviteCode ? (
                        <label style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 12 }}>
                          <span style={sectionLabelStyle}>招待コード</span>
                          <input
                            value={trialInviteCode}
                            onChange={event => setTrialInviteCode(event.target.value)}
                            placeholder="招待コードを入力"
                            style={{
                              width: "100%",
                              padding: "9px 10px",
                              borderRadius: 8,
                              border: "1px solid #a89e8e",
                              background: "rgba(0,0,0,0.06)",
                              color: "#111",
                              fontSize: 12,
                              fontFamily: "inherit",
                              outline: "none",
                            }}
                          />
                        </label>
                      ) : null}
                      <div style={{ marginTop: "auto", paddingTop: 18 }}>
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 16, fontWeight: 500, color: "#111" }}>
                            {pack.amount === 0 ? "無料" : `¥${pack.amount.toLocaleString("ja-JP")}`}
                          </div>
                        </div>
                        <button
                          onClick={() => void startTopupCheckout(pack.id)}
                          disabled={topupLoadingPack != null}
                          style={{
                            ...actionButtonStyle,
                            width: "100%",
                            opacity: topupLoadingPack != null ? 0.55 : 1,
                            cursor: topupLoadingPack != null ? "not-allowed" : "pointer",
                          }}
                        >
                          {topupLoadingPack === pack.id ? "準備中..." : pack.requiresInviteCode ? "無料クレジットを受け取る" : "PayPalでチャージ"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {tab === "mypage" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={panelStyle}>
                <div style={sectionLabelStyle}>アカウント設定</div>
                <div style={{ fontSize: 22, fontWeight: 500, color: "#171717", marginBottom: 6 }}>マイページ</div>
                <div style={{ fontSize: 12, color: "#4e4a43", lineHeight: 1.7, marginBottom: 16 }}>
                  登録しているメールアドレスやパスワードを変更できます。
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 400 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={sectionLabelStyle}>新しいメールアドレス</span>
                    <input
                      type="email"
                      value={mypageEmail}
                      onChange={e => setMypageEmail(e.target.value)}
                      placeholder={userEmail || "mail@example.com"}
                      style={{
                        width: "100%",
                        padding: "11px 12px",
                        borderRadius: 8,
                        border: "1px solid #a89e8e",
                        background: "rgba(0,0,0,0.06)",
                        color: "#111",
                        fontSize: 13,
                        fontFamily: "inherit",
                        outline: "none",
                      }}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={sectionLabelStyle}>新しいパスワード</span>
                    <input
                      type="password"
                      value={mypagePassword}
                      onChange={e => setMypagePassword(e.target.value)}
                      placeholder="変更する場合のみ入力"
                      style={{
                        width: "100%",
                        padding: "11px 12px",
                        borderRadius: 8,
                        border: "1px solid #a89e8e",
                        background: "rgba(0,0,0,0.06)",
                        color: "#111",
                        fontSize: 13,
                        fontFamily: "inherit",
                        outline: "none",
                      }}
                    />
                  </label>

                  {mypageStatus ? (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: "rgba(0,0,0,0.06)",
                        color: mypageStatus.includes("失敗") || mypageStatus.includes("エラー") ? "#b84242" : "#4a7c50",
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      {mypageStatus}
                    </div>
                  ) : null}

                  <button
                    onClick={() => void handleUpdateAccount()}
                    disabled={mypageLoading}
                    style={{
                      ...actionButtonStyle,
                      opacity: mypageLoading ? 0.5 : 1,
                      cursor: mypageLoading ? "not-allowed" : "pointer",
                      marginTop: 8,
                    }}
                  >
                    {mypageLoading ? "更新中..." : "アカウント情報を更新する"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "avatar" ? (
            <div className="layout-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={panelStyle}>
                <div style={sectionLabelStyle}>キャスト情報</div>
                <div style={{ fontSize: 18, fontWeight: 650, color: "#171717", marginBottom: 14 }}>キャスト登録</div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={sectionLabelStyle}>キャスト名</span>
                    <input
                      value={avatarName}
                      onChange={event => setAvatarName(event.target.value)}
                      placeholder="例: LUXE WAVE"
                      style={{
                        width: "100%",
                        padding: "11px 12px",
                        borderRadius: 8,
                        border: "1px solid #a89e8e",
                        background: "rgba(0,0,0,0.06)",
                        color: "#111",
                        fontSize: 13,
                        fontFamily: "inherit",
                        outline: "none",
                      }}
                    />
                  </label>

                  <div>
                    <div style={sectionLabelStyle}>写真</div>
                    <label style={uploadButtonStyle}>
                      写真を選択する
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        style={{ display: "none" }}
                        onChange={event => handleAvatarFiles(event.target.files)}
                      />
                    </label>
                    <div style={{ marginTop: 8, fontSize: 11, color: "#6a6258" }}>
                      正面が分かる写真を1枚以上アップロードしてください。登録には50クレジット使用します。キャスト履歴は最大{MAX_AVATARS}人まで残せます。
                    </div>
                  </div>

                  {avatarPreviews.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 10 }}>
                      {avatarPreviews.map((src, index) => (
                        <div key={src} style={{ borderRadius: 10, overflow: "hidden", background: "#000", border: "1px solid rgba(0,0,0,0.16)", aspectRatio: "1 / 1" }}>
                          <img src={src} alt={`登録写真 ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        minHeight: 180,
                        borderRadius: 12,
                        border: "1px dashed #9b927f",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#5f5648",
                        background: "rgba(0,0,0,0.03)",
                        fontSize: 13,
                      }}
                    >
                      選択した写真のプレビューが表示されます。
                    </div>
                  )}

                  {avatarStatus ? (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: "rgba(0,0,0,0.06)",
                        color: avatarStatus.includes("失敗") || avatarStatus.includes("不足") || avatarStatus.includes("必要") ? "#b84242" : "#4a7c50",
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      {avatarStatus}
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => void submitAvatar()}
                      disabled={!avatarName.trim() || avatarFiles.length === 0 || avatarLoading || avatars.length >= MAX_AVATARS}
                      style={{
                        ...actionButtonStyle,
                        opacity: !avatarName.trim() || avatarFiles.length === 0 || avatarLoading || avatars.length >= MAX_AVATARS ? 0.5 : 1,
                        cursor: !avatarName.trim() || avatarFiles.length === 0 || avatarLoading || avatars.length >= MAX_AVATARS ? "not-allowed" : "pointer",
                      }}
                    >
                      {avatarLoading ? "登録中..." : avatars.length >= MAX_AVATARS ? "上限に達しました" : "登録する"}
                    </button>
                    <button onClick={resetAvatarForm} style={{ ...smallButtonStyle, flex: 1 }}>
                      リセット
                    </button>
                  </div>
                </div>
              </div>

              <div style={panelStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
                  <div>
                    <div style={sectionLabelStyle}>登録済み</div>
                    <div style={{ fontSize: 18, fontWeight: 650, color: "#171717" }}>キャスト一覧</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: "#6a6258" }}>
                      {avatars.length}/{MAX_AVATARS} 人
                    </div>
                  </div>
                  <button onClick={() => void loadAvatars()} style={smallButtonStyle} disabled={avatarListLoading}>
                    更新
                  </button>
                </div>

                {avatarListLoading ? (
                  <div style={{ fontSize: 13, color: "#5f5648" }}>読み込み中...</div>
                ) : avatars.length > 0 ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                    {avatars.map(avatar => (
                      <div key={avatar.id} style={{ borderRadius: 10, overflow: "hidden", background: "rgba(0,0,0,0.06)", border: "1px solid #a89e8e" }}>
                        <div style={{ aspectRatio: "1 / 1", background: "#111" }}>
                          {avatar.face_image_url ? (
                            <img src={avatar.face_image_url} alt={avatar.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          ) : null}
                        </div>
                        <div style={{ padding: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 650, color: "#111", marginBottom: 4 }}>{avatar.name}</div>
                          <div style={{ fontSize: 10, color: "#6a6258" }}>
                            {avatar.status} / {new Date(avatar.created_at).toLocaleDateString("ja-JP")}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      minHeight: 220,
                      borderRadius: 12,
                      border: "1px dashed #9b927f",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#5f5648",
                      background: "rgba(0,0,0,0.03)",
                      fontSize: 13,
                      textAlign: "center",
                      padding: 20,
                    }}
                  >
                    まだ登録済みキャストはありません。
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {tab === "mosaic" ? (
            <div className="layout-grid" style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 20 }}>
              <DropZone onFile={file => void handleMosaicUpload(file)} style={panelStyle}>
                <div style={sectionLabelStyle}>プレビュー</div>

                <label style={uploadButtonStyle}>
                  画像を選択する
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleMosaicUpload(file);
                      }
                    }}
                  />
                </label>

                {avatars.length > 0 ? (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ ...sectionLabelStyle, marginBottom: 8 }}>登録済みキャストから選択</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 10 }}>
                      {avatars.map(avatar => (
                        <button
                          key={`mosaic-${avatar.id}`}
                          onClick={() => void useAvatarForMosaic(avatar)}
                          disabled={!avatar.face_image_url || mosaicLoading}
                          style={{
                            padding: 0,
                            overflow: "hidden",
                            borderRadius: 10,
                            border: "1px solid #a89e8e",
                            background: "rgba(0,0,0,0.06)",
                            cursor: !avatar.face_image_url || mosaicLoading ? "not-allowed" : "pointer",
                            opacity: !avatar.face_image_url || mosaicLoading ? 0.5 : 1,
                            textAlign: "left",
                            fontFamily: "inherit",
                          }}
                        >
                          <div style={{ aspectRatio: "1 / 1", background: "#111" }}>
                            {avatar.face_image_url ? (
                              <img src={avatar.face_image_url} alt={avatar.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            ) : null}
                          </div>
                          <div style={{ padding: "8px 9px", color: "#111", fontSize: 11, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {avatar.name}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 11, color: "#6a6258" }}>
                    キャスト登録すると、ここから画像を選べます。
                  </div>
                )}

                {mosaicSrc ? (
                  <div style={{ marginTop: 14, position: "relative", background: "#000", borderRadius: 12, overflow: "hidden" }}>
                    <img src={mosaicSrc} alt="preview" style={{ width: "100%", maxHeight: 480, objectFit: "contain", display: "block" }} />
                    {mosaicBox && mosaicImageSize ? (
                      <div
                        style={{
                          position: "absolute",
                          left: `${(mosaicBox.x / mosaicImageSize.width) * 100}%`,
                          top: `${(mosaicBox.y / mosaicImageSize.height) * 100}%`,
                          width: `${(mosaicBox.width / mosaicImageSize.width) * 100}%`,
                          height: `${(mosaicBox.height / mosaicImageSize.height) * 100}%`,
                          border: "2px solid #f0c85a",
                          borderRadius: mosaicArea === "顔全体" ? "999px" : 12,
                          boxShadow: "0 0 0 9999px rgba(0,0,0,0.18)",
                          pointerEvents: "none",
                        }}
                        />
                    ) : null}
                    {mosaicLoading ? (
                      <LoadingExperience label="モザイク加工中" detail={mosaicStage || "画像を仕上げています。"} overlay />
                    ) : null}
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: 14,
                      minHeight: 280,
                      borderRadius: 12,
                      border: "1px dashed #9b927f",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#5f5648",
                      background: "rgba(0,0,0,0.03)",
                      fontSize: 13,
                    }}
                  >
                    画像をドラッグまたはアップロードすると、ここに検出枠が表示されます。
                  </div>
                )}

                {mosaicStage ? (
                  <div
                    style={{
                      marginTop: 14,
                      padding: "12px 14px",
                      borderRadius: 10,
                      background: "rgba(201,168,76,0.16)",
                      border: "1px solid rgba(201,168,76,0.35)",
                      color: "#6f5310",
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {mosaicStage}
                  </div>
                ) : null}
              </DropZone>

              <div style={{ ...panelStyle, display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={sectionLabelStyle}>加工範囲</div>
                  <div style={buttonRowStyle}>
                    {AREAS.map(area => (
                      <button
                        key={area}
                        onClick={() => {
                          setMosaicArea(area);
                          setMosaicImage(null);
                          setMosaicBox(mosaicRegions ? buildRegionBox(mosaicRegions, area) : null);
                        }}
                        style={choiceButtonStyle(mosaicArea === area)}
                      >
                        {area}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={sectionLabelStyle}>強度</div>
                  <div style={buttonRowStyle}>
                    {STRENGTHS.map(level => (
                      <button key={level} onClick={() => setMosaicStrength(level)} style={choiceButtonStyle(mosaicStrength === level)}>
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ padding: 12, borderRadius: 10, background: "rgba(0,0,0,0.04)", border: "1px solid #a89e8e" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                    <div>
                      <div style={sectionLabelStyle}>検出枠の調整</div>
                      <div style={{ fontSize: 11, color: "#6a6258" }}>移動 2px / サイズ 4px ずつ</div>
                    </div>
                    <button onClick={() => void redetectMosaicFace()} style={smallButtonStyle}>
                      顔を再検出
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, maxWidth: 220 }}>
                    <div />
                    <button onClick={() => nudgeMosaicBox(0, -NUDGE_STEP)} style={smallButtonStyle}>
                      上
                    </button>
                    <div />
                    <button onClick={() => nudgeMosaicBox(-NUDGE_STEP, 0)} style={smallButtonStyle}>
                      左
                    </button>
                    <button onClick={() => nudgeMosaicBox(0, NUDGE_STEP)} style={smallButtonStyle}>
                      下
                    </button>
                    <button onClick={() => nudgeMosaicBox(NUDGE_STEP, 0)} style={smallButtonStyle}>
                      右
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => resizeMosaicBox(-RESIZE_STEP)} style={smallButtonStyle}>
                      縮小
                    </button>
                    <button onClick={() => resizeMosaicBox(RESIZE_STEP)} style={smallButtonStyle}>
                      拡大
                    </button>
                  </div>
                </div>

                <div>
                  <div style={sectionLabelStyle}>エフェクト</div>
                  <div style={{ fontSize: 11, color: "#6a6258", marginBottom: 8 }}>自動モザイクは顔の輪郭に沿って広めに隠します。</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => void runMosaic("blur")} style={actionButtonStyle} disabled={!mosaicSrc || !mosaicBox || mosaicLoading}>
                      ブラー
                    </button>
                    <button onClick={() => void runMosaic("gaussian")} style={actionButtonStyle} disabled={!mosaicSrc || !mosaicBox || mosaicLoading}>
                      ガウス
                    </button>
                    <button onClick={() => void runMosaic("simple")} style={actionButtonStyle} disabled={!mosaicSrc || !mosaicBox || mosaicLoading}>
                      自動モザイク
                    </button>
                  </div>
                </div>

                <button onClick={resetMosaic} style={{ ...smallButtonStyle, width: "100%" }}>
                  リセット
                </button>
              </div>
            </div>
          ) : null}

          {tab === "edit" ? (
            <div className="layout-grid" style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 20 }}>
              <DropZone onFile={file => handleEditUpload(file)} style={panelStyle}>
                <div style={sectionLabelStyle}>元画像</div>
                <label style={uploadButtonStyle}>
                  画像を選択する
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (file) {
                        handleEditUpload(file);
                      }
                    }}
                  />
                </label>

                {editSrc ? (
                  <div style={{ marginTop: 14, borderRadius: 10, overflow: "hidden", background: "#000", border: "1px solid rgba(255,255,255,0.08)", position: "relative" }}>
                    <img src={editSrc} alt="編集前" style={{ width: "100%", maxHeight: 360, objectFit: "contain", display: "block" }} />
                    {editLoading ? (
                      <LoadingExperience label="画像を編集中" detail="質感と雰囲気を整えています。" overlay />
                    ) : null}
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: 14,
                      minHeight: 280,
                      borderRadius: 12,
                      border: "1px dashed #9b927f",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#5f5648",
                      background: "rgba(0,0,0,0.03)",
                      fontSize: 13,
                    }}
                  >
                    画像をドラッグまたはアップロードすると、ここにプレビューが表示されます。
                  </div>
                )}

                {editResult ? (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>編集後</div>
                    <div style={{ borderRadius: 10, overflow: "hidden", background: "#000", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <img src={editResult} alt="編集後" style={{ width: "100%", maxHeight: 460, objectFit: "contain", display: "block" }} />
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                      <button
                        onClick={() => void useEditResultForFurtherEdit()}
                        style={{ ...actionButtonStyle, flex: 1, minWidth: 100 }}
                      >
                        追加編集
                      </button>
                      <button
                        onClick={() => void saveFileAs(editResult, editFile?.name, "grok-edit.jpg")}
                        style={{ ...actionButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: 1, minWidth: 100 }}
                      >
                        ダウンロード
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            const filename = editResult.split("/").pop() ?? "edit.jpg";
                            const file = await imageUrlToFile(editResult, filename);
                            handleVideoUpload(file);
                            setTab("video");
                          } catch {
                            // ignore
                          }
                        }}
                        style={{ ...actionButtonStyle, flex: 1, minWidth: 100 }}
                      >
                        動画生成へ
                      </button>
                      <button onClick={() => setEditResult(null)} style={{ ...smallButtonStyle, flex: 1, minWidth: 100 }}>
                        結果をクリア
                      </button>
                    </div>
                  </div>
                ) : null}
              </DropZone>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={panelStyle}>
                  <div style={sectionLabelStyle}>モデル</div>
                  <div style={{ fontSize: 12, color: "#4e4a43", lineHeight: 1.7 }}>
                    
                  </div>
                </div>

                <div style={panelStyle}>
                  <div style={sectionLabelStyle}>プロンプト</div>
                  <textarea
                    value={editPrompt}
                    onChange={event => setEditPrompt(event.target.value)}
                    rows={5}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: "rgba(0,0,0,0.08)",
                      border: "1px solid #a89e8e",
                      color: "#111",
                      fontSize: 12,
                      fontFamily: "inherit",
                      resize: "vertical",
                    }}
                  />
                  <FavoritesPanel
                    currentPrompt={editPrompt}
                    panelId="edit"
                    favorites={promptFavorites}
                    openFor={favoritesOpenFor}
                    onToggle={id => setFavoritesOpenFor(prev => prev === id ? null : id)}
                    onAdd={addFavorite}
                    onRemove={removeFavorite}
                    onSelect={p => setEditPrompt(p)}
                  />
                  <BlockedKeywordWarning prompt={editPrompt} keywords={blockedKeywords} />
                </div>

                <div style={panelStyle}>
                  <div style={sectionLabelStyle}>解像度</div>
                  <div style={buttonRowStyle}>
                    {(["1k", "2k"] as EditResolution[]).map(resolution => (
                      <button
                        key={resolution}
                        onClick={() => setEditResolution(resolution)}
                        style={choiceButtonStyle(editResolution === resolution)}
                      >
                        {resolution}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: "#6a6258" }}>
                    接続先: fal.ai / xai/grok-imagine-image/quality/edit
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: "#6a6258", lineHeight: 1.5 }}>
                    料金目安: 1K 約$0.06 / 2K 約$0.08。顔保持指定は入れていますが、顔固定専用モデルではありません。
                  </div>
                </div>

                <div style={panelStyle}>
                  {editStatus ? (
                    <div
                      style={{
                        marginBottom: 12,
                        fontSize: 12,
                        color: editStatus.includes("失敗") || editStatus.includes("Error") || editStatus.includes("できません") ? "#e06060" : "#4a8a6a",
                        background: "rgba(0,0,0,0.06)",
                        borderRadius: 8,
                        padding: "8px 12px",
                      }}
                    >
                      {editLoading ? <LoadingExperience label={editStatus} detail="少し時間がかかる場合があります。" compact /> : editStatus}
                    </div>
                  ) : null}
                  <button
                    onClick={() => void submitEdit()}
                    disabled={!editFile || !editPrompt.trim() || editLoading}
                    style={{
                      ...actionButtonStyle,
                      width: "100%",
                      opacity: !editFile || !editPrompt.trim() || editLoading ? 0.5 : 1,
                      cursor: !editFile || !editPrompt.trim() || editLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {editLoading ? "編集中..." : "画像編集する"}
                  </button>
                  <button onClick={resetEdit} style={{ ...smallButtonStyle, width: "100%", marginTop: 10 }}>
                    リセット
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "faceswap" ? (
            <div className="layout-grid" style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 20 }}>
              {/* 左カラム：画像アップロード */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* 顔画像 */}
                <DropZone onFile={file => { setFaceFile(file); setFaceSrc(URL.createObjectURL(file)); setFaceswapResult(null); setFaceswapStatus(""); }} style={panelStyle}>
                  <div style={sectionLabelStyle}>顔画像（元の顔）</div>
                  <label style={uploadButtonStyle}>
                    顔画像を選択する
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setFaceFile(file);
                        setFaceSrc(URL.createObjectURL(file));
                        setFaceswapResult(null);
                        setFaceswapStatus("");
                      }}
                    />
                  </label>
                  {/* キャストから選択 */}
                  {avatars.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ ...sectionLabelStyle, marginBottom: 8 }}>登録済みキャストから選択</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
                        {avatars.map(avatar => (
                          <button
                            key={`face-${avatar.id}`}
                            onClick={async () => {
                              if (!avatar.face_image_url || faceswapLoading) return;
                              try {
                                const file = await imageUrlToFile(avatar.face_image_url, avatar.name);
                                setFaceFile(file);
                                setFaceSrc(URL.createObjectURL(file));
                                setFaceswapResult(null);
                                setFaceswapStatus("");
                              } catch {
                                setFaceswapStatus("キャスト画像を読み込めませんでした");
                              }
                            }}
                            disabled={!avatar.face_image_url || faceswapLoading}
                            style={{
                              padding: 0,
                              overflow: "hidden",
                              borderRadius: 8,
                              border: faceFile && faceSrc === avatar.face_image_url ? "2px solid #b84242" : "1px solid #a89e8e",
                              background: "rgba(0,0,0,0.06)",
                              cursor: !avatar.face_image_url || faceswapLoading ? "not-allowed" : "pointer",
                              opacity: !avatar.face_image_url || faceswapLoading ? 0.5 : 1,
                            }}
                          >
                            <div style={{ aspectRatio: "1 / 1", background: "#111" }}>
                              {avatar.face_image_url && (
                                <img src={avatar.face_image_url} alt={avatar.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                              )}
                            </div>
                            <div style={{ padding: "5px 6px", color: "#111", fontSize: 10, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {avatar.name}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {faceSrc && (
                    <div style={{ marginTop: 12, borderRadius: 10, overflow: "hidden", background: "#000", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <img src={faceSrc} alt="顔画像" style={{ width: "100%", maxHeight: 280, objectFit: "contain", display: "block" }} />
                    </div>
                  )}
                </DropZone>

                {/* 体画像 */}
                <DropZone onFile={file => { setTargetFile(file); setTargetSrc(URL.createObjectURL(file)); setFaceswapResult(null); setFaceswapStatus(""); }} style={panelStyle}>
                  <div style={sectionLabelStyle}>体画像（合成先）</div>
                  <label style={uploadButtonStyle}>
                    体画像を選択する
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setTargetFile(file);
                        setTargetSrc(URL.createObjectURL(file));
                        setFaceswapResult(null);
                        setFaceswapStatus("");
                      }}
                    />
                  </label>
                  {targetSrc && (
                    <div style={{ marginTop: 12, borderRadius: 10, overflow: "hidden", background: "#000", border: "1px solid rgba(255,255,255,0.08)", position: "relative" }}>
                      <img src={targetSrc} alt="体画像" style={{ width: "100%", maxHeight: 280, objectFit: "contain", display: "block" }} />
                      {faceswapLoading && (
                        <LoadingExperience label="顔ハメ処理中" detail={faceswapStatus || "合成しています。"} overlay />
                      )}
                    </div>
                  )}
                </DropZone>

                {/* 結果 */}
                {faceswapResult && (
                  <div style={panelStyle}>
                    <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>合成結果</div>
                    <div style={{ borderRadius: 10, overflow: "hidden", background: "#000", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <img src={faceswapResult} alt="合成結果" style={{ width: "100%", objectFit: "contain", display: "block" }} />
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                      <button
                        onClick={() => void saveFileAs(faceswapResult, undefined, "faceswap.jpg")}
                        style={{ ...actionButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: 1 }}
                      >
                        ダウンロード
                      </button>
                      <button
                        onClick={() => { handleVideoUpload(targetFile!); setTab("video"); }}
                        disabled={!targetFile}
                        style={{ ...smallButtonStyle, flex: 1, background: "#3a3028", color: "#f5f0e8" }}
                      >
                        ▶ 動画生成
                      </button>
                    </div>
                    <button onClick={() => setFaceswapResult(null)} style={{ ...smallButtonStyle, width: "100%", marginTop: 8 }}>
                      結果をクリア
                    </button>
                  </div>
                )}
              </div>

              {/* 右カラム：設定 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={panelStyle}>
                  <div style={{ fontSize: 11, color: "#6a6258", lineHeight: 1.7 }}>
                    接続先: fal-ai/face-swap<br />
                    料金目安: 約$0.05/枚（1クレジット）
                  </div>
                </div>

                <div style={panelStyle}>
                  {faceswapStatus && (
                    <div
                      style={{
                        marginBottom: 12,
                        fontSize: 12,
                        color: faceswapStatus.includes("失敗") || faceswapStatus.includes("エラー") || faceswapStatus.includes("不足") ? "#e06060" : faceswapStatus === "完成！" ? "#4a8a6a" : "#6a6258",
                        background: "rgba(0,0,0,0.06)",
                        borderRadius: 8,
                        padding: "8px 12px",
                      }}
                    >
                      {faceswapStatus}
                    </div>
                  )}
                  <button
                    onClick={() => void submitFaceswap()}
                    disabled={!faceFile || !targetFile || faceswapLoading}
                    style={{
                      ...actionButtonStyle,
                      width: "100%",
                      opacity: !faceFile || !targetFile || faceswapLoading ? 0.5 : 1,
                      cursor: !faceFile || !targetFile || faceswapLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {faceswapLoading ? "処理中..." : "顔ハメする"}
                  </button>
                  <button onClick={resetFaceswap} style={{ ...smallButtonStyle, width: "100%", marginTop: 10 }}>
                    リセット
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "video" ? (
            <div className="layout-grid" style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 20 }}>
              <DropZone onFile={file => handleVideoUpload(file)} style={panelStyle}>
                <div style={sectionLabelStyle}>元画像</div>
                <label style={uploadButtonStyle}>
                  画像を選択する
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={e => e.target.files?.[0] && handleVideoUpload(e.target.files[0])}
                  />
                </label>

                {avatars.length > 0 ? (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ ...sectionLabelStyle, marginBottom: 8 }}>登録済みキャストから選択</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 10 }}>
                      {avatars.map(avatar => (
                        <button
                          key={`video-${avatar.id}`}
                          onClick={() => void useAvatarForVideo(avatar)}
                          disabled={!avatar.face_image_url || videoLoading}
                          style={{
                            padding: 0,
                            overflow: "hidden",
                            borderRadius: 10,
                            border: "1px solid #a89e8e",
                            background: "rgba(0,0,0,0.06)",
                            cursor: !avatar.face_image_url || videoLoading ? "not-allowed" : "pointer",
                            opacity: !avatar.face_image_url || videoLoading ? 0.5 : 1,
                            textAlign: "left",
                            fontFamily: "inherit",
                          }}
                        >
                          <div style={{ aspectRatio: "1 / 1", background: "#111" }}>
                            {avatar.face_image_url ? (
                              <img src={avatar.face_image_url} alt={avatar.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            ) : null}
                          </div>
                          <div style={{ padding: "8px 9px", color: "#111", fontSize: 11, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {avatar.name}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 11, color: "#6a6258" }}>
                    キャスト登録すると、ここから画像を選べます。
                  </div>
                )}

                {videoSrc && (
                  <div style={{ marginTop: 14, borderRadius: 10, overflow: "hidden", background: "#000", border: "1px solid rgba(255,255,255,0.08)", position: "relative" }}>
                    <img src={videoSrc} alt="元画像" style={{ width: "100%", maxHeight: 360, objectFit: "contain", display: "block" }} />
                    {videoLoading ? (
                      <LoadingExperience label="動画を生成中" detail={videoStatus || "動きを作っています。"} overlay />
                    ) : null}
                  </div>
                )}

                {videoResult && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>生成された動画</div>
                    <video
                      src={videoResult}
                      controls
                      autoPlay
                      loop
                      style={{ width: "100%", borderRadius: 10, background: "#000" }}
                    />
                    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                      <button
                        onClick={() => void saveFileAs(videoResult, undefined, "video.mp4")}
                        style={{ ...actionButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: 1 }}
                      >
                        ダウンロード
                      </button>
                      <button
                        onClick={() => { setVideoResult(null); setVideoStatus(""); }}
                        style={{ ...smallButtonStyle, flex: 1 }}
                      >
                        クリア
                      </button>
                    </div>
                  </div>
                )}

                {/* stitch 30秒プレーヤー */}
                {(videoStitchPart1 || videoStitchPart2) && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>
                      30秒動画（{videoStitchPart1 && videoStitchPart2 ? "2本完成" : videoStitchPart1 ? "1本目完成・2本目生成中" : "2本目完成・1本目生成中"}）
                    </div>
                    {videoStitchPart1 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: "#6a6258", marginBottom: 4 }}>1本目（0〜15秒）</div>
                        <video src={videoStitchPart1} controls style={{ width: "100%", borderRadius: 10, background: "#000" }} />
                        <button
                          onClick={() => void saveFileAs(videoStitchPart1, undefined, "video_part1.mp4")}
                          style={{ ...smallButtonStyle, width: "100%", marginTop: 6 }}
                        >
                          1本目を保存
                        </button>
                      </div>
                    )}
                    {videoStitchPart2 && (
                      <div>
                        <div style={{ fontSize: 11, color: "#6a6258", marginBottom: 4 }}>2本目（15〜30秒）</div>
                        <video src={videoStitchPart2} controls style={{ width: "100%", borderRadius: 10, background: "#000" }} />
                        <button
                          onClick={() => void saveFileAs(videoStitchPart2, undefined, "video_part2.mp4")}
                          style={{ ...smallButtonStyle, width: "100%", marginTop: 6 }}
                        >
                          2本目を保存
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => { setVideoStitchPart1(null); setVideoStitchPart2(null); setVideoStitchStatus(""); setVideoStatus(""); }}
                      style={{ ...smallButtonStyle, width: "100%", marginTop: 10 }}
                    >
                      クリア
                    </button>
                  </div>
                )}
              </DropZone>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={panelStyle}>
                  <div style={sectionLabelStyle}>モデル</div>
                  <div style={buttonRowStyle}>
                    {(["grok", "grok_v15", "seedance"] as VideoModel[]).map(id => (
                      <button
                        key={id}
                        onClick={() => {
                          setVideoModel(id);
                          // Grokは最大10秒なので15秒選択中なら10秒に戻す
                          if (id === "grok" && videoDuration === 15) setVideoDuration(10);
                          // Grok以外に切り替えたらstitchモードをリセット
                          if (id !== "grok_v15") setVideoStitchMode(false);
                        }}
                        style={choiceButtonStyle(videoModel === id)}
                      >
                        {id === "grok" ? "Grok" : id === "grok_v15" ? "Grok v1.5" : "Seedance 2"}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: "#6a6258" }}>
                    {videoModel === "grok"
                      ? "xAI Grok Imagine — $0.05/s (480p) · $0.07/s (720p)"
                      : videoModel === "grok_v15"
                        ? "xAI Grok Imagine v1.5 — $0.08/s (480p) · $0.14/s (720p)"
                        : "ByteDance Seedance 2.0 Fast — $0.2419/s · Standard — $0.3024/s"}
                  </div>
                </div>

                <div style={panelStyle}>
                  <div style={sectionLabelStyle}>プロンプト</div>
                  <textarea
                    value={videoPrompt}
                    onChange={e => setVideoPrompt(e.target.value)}
                    rows={3}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: "rgba(0,0,0,0.08)",
                      border: "1px solid #a89e8e",
                      color: "#111",
                      fontSize: 12,
                      fontFamily: "inherit",
                      resize: "vertical",
                    }}
                  />
                  <FavoritesPanel
                    currentPrompt={videoPrompt}
                    panelId="video"
                    favorites={promptFavorites}
                    openFor={favoritesOpenFor}
                    onToggle={id => setFavoritesOpenFor(prev => prev === id ? null : id)}
                    onAdd={addFavorite}
                    onRemove={removeFavorite}
                    onSelect={p => setVideoPrompt(p)}
                  />
                  <BlockedKeywordWarning prompt={videoPrompt} keywords={blockedKeywords} />
                </div>

                <div style={panelStyle}>
                  <div style={sectionLabelStyle}>尺</div>
                  <div style={buttonRowStyle}>
                    {[5, 10, 15].map(d => {
                      const disabled = videoModel === "grok" && d === 15;
                      return (
                        <button
                          key={d}
                          disabled={disabled}
                          onClick={() => !disabled && setVideoDuration(d)}
                          style={{
                            ...choiceButtonStyle(videoDuration === d),
                            opacity: disabled ? 0.35 : 1,
                            cursor: disabled ? "not-allowed" : "pointer",
                          }}
                        >
                          {d}秒{disabled ? " ✕" : ""}
                        </button>
                      );
                    })}
                  </div>
                  {videoModel === "grok" && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#9b8060" }}>Grokは最大10秒まで</div>
                  )}
                  {videoModel === "grok_v15" && videoDuration === 15 && (
                    <div style={{ marginTop: 10 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "#4a3a28" }}>
                        <input
                          type="checkbox"
                          checked={videoStitchMode}
                          onChange={e => setVideoStitchMode(e.target.checked)}
                          style={{ width: 14, height: 14, accentColor: "#b84242" }}
                        />
                        <span>30秒モード（15秒×2本を連続生成）</span>
                      </label>
                      {videoStitchMode && (
                        <div style={{ marginTop: 4, fontSize: 11, color: "#6a6258" }}>
                          同じ画像・プロンプトで2本生成してシームレスに再生します。推定コスト×2。
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={panelStyle}>
                  <div style={sectionLabelStyle}>解像度</div>
                  <div style={buttonRowStyle}>
                    {["480p", "720p"].map(r => (
                      <button key={r} onClick={() => setVideoResolution(r)} style={choiceButtonStyle(videoResolution === r)}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={panelStyle}>
                  {videoStatus ? (
                    <div
                      style={{
                        marginBottom: 12,
                        fontSize: 12,
                        color: videoStatus.includes("失敗") || videoStatus.includes("エラー") ? "#e06060" : "#4a8a6a",
                        background: "rgba(0,0,0,0.06)",
                        borderRadius: 8,
                        padding: "8px 12px",
                      }}
                    >
                      {videoLoading ? <LoadingExperience label={videoStatus} detail="完成までこのままお待ちください。" compact /> : videoStatus}
                    </div>
                  ) : null}
                  <button
                    onClick={() => void submitVideo()}
                    disabled={!videoFile || videoLoading}
                    style={{
                      ...actionButtonStyle,
                      width: "100%",
                      opacity: !videoFile || videoLoading ? 0.5 : 1,
                      cursor: !videoFile || videoLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {videoLoading ? "生成中..." : "動画を生成する"}
                  </button>
                  <div style={{ marginTop: 8, fontSize: 11, color: "#6a6258", textAlign: "center" }}>
                    推定コスト: ${(videoDuration * (
                      videoModel === "grok"
                        ? (videoResolution === "480p" ? 0.05 : 0.07)
                        : videoModel === "grok_v15"
                          ? (videoResolution === "480p" ? 0.08 : 0.14)
                          : 0.2419
                    )).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {mosaicImage && mosaicSrc ? (
        <div
          onClick={() => setMosaicImage(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{ width: "min(980px, 92vw)", background: "#102733", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 18 }}
          >
            <div style={{ fontSize: 14, fontWeight: 500, color: "#f0ece4", marginBottom: 14 }}>比較表示</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
              <PreviewCard label="加工前" src={mosaicSrc} />
              <PreviewCard label="加工後" src={mosaicImage} />
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
              <button
                onClick={() => mosaicImage && void saveFileAs(mosaicImage, undefined, "mosaic.png")}
                style={{ ...actionButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 120 }}
              >
                保存
              </button>
              <button
                onClick={async () => {
                  if (!mosaicImage) return;
                  try {
                    const filename = mosaicImage.startsWith("blob:") ? "mosaic.png" : (mosaicImage.split("/").pop() ?? "mosaic.png");
                    const file = await imageUrlToFile(mosaicImage, filename);
                    handleVideoUpload(file);
                    setMosaicImage(null);
                    setTab("video");
                  } catch {
                    // ignore
                  }
                }}
                style={{ ...smallButtonStyle, minWidth: 120, background: "#3a3028", color: "#f5f0e8" }}
              >
                ▶ 動画生成
              </button>
              <button onClick={() => setMosaicImage(null)} style={{ ...smallButtonStyle, minWidth: 120 }}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PreviewCard({ label, src }: { label: string; src: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: "#c9a84c" }}>{label}</div>
      <div
        style={{
          height: 320,
          borderRadius: 12,
          overflow: "hidden",
          background: "#000",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img src={src} alt={label} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      </div>
    </div>
  );
}

function LoadingExperience({
  label,
  detail,
  overlay = false,
  compact = false,
}: {
  label: string;
  detail?: string;
  overlay?: boolean;
  compact?: boolean;
}) {
  const content = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: compact ? "flex-start" : "center",
        gap: compact ? 10 : 14,
        width: "100%",
        color: overlay ? "#f0ece4" : "#171717",
      }}
    >
      <div
        className="lumiveil-loader-orbit"
        style={{
          width: compact ? 30 : 46,
          height: compact ? 30 : 46,
          borderRadius: "50%",
          border: compact ? "2px solid rgba(201,168,76,0.22)" : "3px solid rgba(201,168,76,0.22)",
          borderTopColor: "#c9a84c",
          borderRightColor: "rgba(240,236,228,0.75)",
          flexShrink: 0,
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: compact ? 12 : 15, fontWeight: 500, marginBottom: compact ? 4 : 6 }}>
          {label}
        </div>
        {detail ? (
          <div style={{ fontSize: compact ? 11 : 12, lineHeight: 1.6, opacity: 0.82 }}>
            {detail}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 5, marginTop: compact ? 6 : 10 }}>
          {[0, 1, 2].map(index => (
            <span
              key={index}
              className="lumiveil-loader-dot"
              style={{
                width: compact ? 5 : 7,
                height: compact ? 5 : 7,
                borderRadius: "50%",
                background: "#c9a84c",
                display: "block",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );

  if (overlay) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 18,
          background: "linear-gradient(180deg, rgba(7,30,40,0.72), rgba(7,30,40,0.88))",
          backdropFilter: "blur(2px)",
        }}
      >
        <div
          style={{
            width: "min(360px, 92%)",
            padding: compact ? 12 : 16,
            borderRadius: 10,
            border: "1px solid rgba(201,168,76,0.32)",
            background: "rgba(7,30,40,0.72)",
            boxShadow: "0 18px 40px rgba(0,0,0,0.28)",
          }}
        >
          {content}
          <div
            className="lumiveil-loader-bar"
            style={{
              position: "relative",
              overflow: "hidden",
              height: 3,
              marginTop: 14,
              borderRadius: 999,
              background: "rgba(240,236,228,0.18)",
            }}
          >
            <span
              className="lumiveil-loader-shimmer"
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(90deg, transparent, rgba(201,168,76,0.9), transparent)",
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return content;
}

function DropZone({ onFile, children, style }: { onFile: (f: File) => void; children: ReactNode; style?: CSSProperties }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      style={{ position: "relative", ...style }}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragEnter={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith("image/")) onFile(file);
      }}
    >
      {dragging && (
        <div style={{
          position: "absolute",
          inset: 0,
          zIndex: 50,
          borderRadius: 12,
          border: "2px dashed #c9a84c",
          background: "rgba(201,168,76,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}>
          <span style={{ color: "#c9a84c", fontSize: 16, fontWeight: 600 }}>ここにドロップ</span>
        </div>
      )}
      {children}
    </div>
  );
}

function FavoritesPanel({
  currentPrompt, panelId, favorites, openFor, onToggle, onAdd, onRemove, onSelect,
}: {
  currentPrompt: string;
  panelId: string;
  favorites: string[];
  openFor: string | null;
  onToggle: (id: string) => void;
  onAdd: (p: string) => void;
  onRemove: (i: number) => void;
  onSelect: (p: string) => void;
}) {
  const isOpen = openFor === panelId;
  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={() => onAdd(currentPrompt)}
          disabled={!currentPrompt.trim()}
          style={{
            fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: currentPrompt.trim() ? "pointer" : "not-allowed",
            border: "1px solid rgba(155,140,90,0.5)", background: "rgba(155,140,90,0.1)", color: "#7a6a40",
            opacity: currentPrompt.trim() ? 1 : 0.5,
          }}
        >
          ★ お気に入りに追加
        </button>
        {favorites.length > 0 && (
          <button
            type="button"
            onClick={() => onToggle(panelId)}
            style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
              border: "1px solid rgba(155,140,90,0.5)", background: isOpen ? "rgba(155,140,90,0.2)" : "rgba(155,140,90,0.08)", color: "#7a6a40",
            }}
          >
            お気に入り {isOpen ? "▲" : "▼"} ({favorites.length})
          </button>
        )}
      </div>
      {isOpen && (
        <div style={{
          maxHeight: 200, overflowY: "auto", border: "1px solid rgba(155,140,90,0.3)",
          borderRadius: 8, background: "rgba(0,0,0,0.04)",
        }}>
          {favorites.map((fav, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
              borderBottom: i < favorites.length - 1 ? "1px solid rgba(155,140,90,0.15)" : "none",
            }}>
              <button
                type="button"
                onClick={() => { onSelect(fav); onToggle(panelId); }}
                style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, cursor: "pointer", border: "1px solid #9b8c5a", background: "#9b8c5a", color: "#fff", flexShrink: 0 }}
              >
                適用
              </button>
              <button
                type="button"
                onClick={() => onRemove(i)}
                style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, cursor: "pointer", border: "1px solid #ccc", background: "transparent", color: "#888", flexShrink: 0 }}
              >
                ×
              </button>
              <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {fav}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const panelStyle: CSSProperties = {
  background: "#d0cabd",
  borderRadius: 8,
  padding: 14,
  border: "1px solid #9f9686",
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 10,
  color: "#444",
  marginBottom: 7,
  letterSpacing: "0.05em",
  fontWeight: 500,
};

const uploadButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  width: "100%",
  padding: "10px 0",
  borderRadius: 8,
  background: "#b0a898",
  border: "1px solid #a89e8e",
  color: "#111",
  fontWeight: 500,
  fontSize: 12,
  cursor: "pointer",
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const choiceButtonStyle = (active: boolean): CSSProperties => ({
  flex: 1,
  minWidth: 88,
  padding: "8px 0",
  borderRadius: 8,
  background: active ? "rgba(201,168,76,0.3)" : "rgba(0,0,0,0.06)",
  border: active ? "1px solid #c9a84c" : "1px solid #a89e8e",
  color: "#111",
  fontWeight: 500,
  fontSize: 12,
  cursor: "pointer",
});

const actionButtonStyle: CSSProperties = {
  flex: 1,
  padding: "10px 0",
  borderRadius: 8,
  background: "#c9a84c",
  border: "none",
  color: "#071e28",
  fontWeight: 500,
  fontSize: 12,
  cursor: "pointer",
};

const smallButtonStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "#b0a898",
  border: "1px solid #a89e8e",
  color: "#111",
  fontWeight: 500,
  fontSize: 11,
  cursor: "pointer",
};
// cache bust 2026年 5月11日 月曜日 12時02分45秒 JST
