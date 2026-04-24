"use client";
import { detectFirstFace } from "@/lib/faceDetector";
import { useState, useCallback, useRef } from "react";

const PLANS = [
  { name: "ベーシック", price: "15,000", credits: 650, color: "#4a7a9b", current: true, priceId: "BASIC" },
  { name: "スタンダード", price: "20,000", credits: 1600, color: "#c9a84c", priceId: "STANDARD" },
  { name: "プロ", price: "25,000", credits: 4800, color: "#9b6b9b", priceId: "PRO" },
  { name: "ウルトラ", price: "30,000", credits: 9600, color: "#7b4e9b", priceId: "ULTRA" },
];

const LOCATIONS = [
  { id: "white_classic", label: "ホワイトクラシック", desc: "大理石・アンティークソファ" },
  { id: "luxury_hotel", label: "高級ホテルルーム", desc: "シティビュー・間接照明" },
  { id: "outdoor_night", label: "夜景・屋外", desc: "ネオン・ボケ背景" },
  { id: "japanese_inn", label: "和室・旅館", desc: "畳・障子・和の空間" },
  { id: "beach", label: "リゾートビーチ", desc: "白砂・南国の海" },
  { id: "lounge", label: "高級ラウンジ", desc: "バーカウンター・薄暗い照明" },
];
const COSTUMES = [
  { id: "knee_dress", label: "ひざ丈ドレス", desc: "エレガント・フェミニン" },
  { id: "kimono", label: "着物", desc: "伝統的・艶やか" },
  { id: "santa", label: "サンタ衣装", desc: "季節イベント用" },
  { id: "school", label: "制服", desc: "ブレザー・プリーツスカート" },
  { id: "casual", label: "カジュアル", desc: "普段着・自然体" },
  { id: "black_dress", label: "ブラックドレス", desc: "妖艶・高級感" },
];
const POSES = [
  { id: "floor_sit", label: "床座り", desc: "横向き・カメラ目線" },
  { id: "standing", label: "立ちポーズ", desc: "自信・エレガント" },
  { id: "sofa", label: "ソファ寄り", desc: "リラックス・自然体" },
  { id: "selfie", label: "自撮り風", desc: "カジュアル・親近感" },
];
const HAIR_LENGTHS = ["ショート", "ボブ", "ミディアム", "ロング", "超ロング"];
const HAIR_COLORS = ["黒髪", "茶髪", "金髪", "ピンク", "グレー"];
const NAV_ITEMS = [
  { id: "generate", label: "画像生成", icon: "✦" },
  { id: "avatar", label: "キャスト登録", icon: "◈" },
  { id: "mosaic", label: "モザイク", icon: "⊞" },
  { id: "edit", label: "AI編集", icon: "✎" },
  { id: "video", label: "動画生成", icon: "▶" },
  { id: "history", label: "履歴", icon: "◎" },
  { id: "plan", label: "プラン", icon: "◇" },
];

export default function Home() {
  const [tab, setTab] = useState("generate");
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [location, setLocation] = useState("white_classic");
  const [costume, setCostume] = useState("knee_dress");
  const [pose, setPose] = useState("floor_sit");
  const [hairLength, setHairLength] = useState("ロング");
  const [hairColor, setHairColor] = useState("黒髪");
  const [count, setCount] = useState(4);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<string[]>([]);
  const [step, setStep] = useState("upload");
  const [castName, setCastName] = useState("");
  const [mosaicMode, setMosaicMode] = useState<"none" | "blur" | "gaussian">("none");
  const [mosaicImage, setMosaicImage] = useState<string | null>(null);
  const [mosaicArea, setMosaicArea] = useState("顔全体");
  const [editSrc, setEditSrc] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [editResult, setEditResult] = useState<string | null>(null);
  const [videoResult, setVideoResult] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState("5");
  const [mosaicStrength, setMosaicStrength] = useState("中");
  const [mosaicLoading, setMosaicLoading] = useState(false);
  const [mosaicSrc, setMosaicSrc] = useState<string | null>(null);
  const [mosaicImageSize, setMosaicImageSize] = useState<{ width: number; height: number } | null>(null);
  const [mosaicBox, setMosaicBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [mosaicFaceBox, setMosaicFaceBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [mosaicStage, setMosaicStage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [avatarCreating, setAvatarCreating] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState(0);
  const [avatars, setAvatars] = useState([
    { id: "1", name: "藍原あの_新宿", date: "2026/03/01" },
    { id: "2", name: "桜井みく_渋谷", date: "2026/03/05" },
  ]);
  const credits = 487;
  const inputRef = useRef<HTMLInputElement>(null);

  const handleGenerate = async () => {
    if (!selectedAvatar) return alert("キャストを選択してください");
    setGenerating(true);
    setStep("generating");
    await new Promise(r => setTimeout(r, 3000));
    setGenerated([
      "https://picsum.photos/seed/a1/400/600",
      "https://picsum.photos/seed/a2/400/600",
      "https://picsum.photos/seed/a3/400/600",
      "https://picsum.photos/seed/a4/400/600",
    ].slice(0, count));
    setStep("done");
    setGenerating(false);
  };

  const handleCreateAvatar = async () => {
    if (!castName || files.length === 0) return;
    setAvatarCreating(true);
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(r => setTimeout(r, 200));
      setAvatarProgress(i);
    }
    setAvatars(prev => [...prev, { id: Date.now().toString(), name: castName, date: new Date().toLocaleDateString("ja") }]);
    setCastName("");
    setFiles([]);
    setAvatarCreating(false);
    setAvatarProgress(0);
  };

  const buildRegionBox = (
    faceBox: { x: number; y: number; width: number; height: number },
    area: string
  ) => {
    const padX = Math.round(faceBox.width * 0.08);
    const padY = Math.round(faceBox.height * 0.1);
    const faceX = Math.max(0, faceBox.x - padX);
    const faceY = Math.max(0, faceBox.y - padY);
    const faceW = Math.round(faceBox.width + padX * 2);
    const faceH = Math.round(faceBox.height + padY * 1.5);
    const clampRegion = (x: number, y: number, width: number, height: number) => ({
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    });

    if (area === "目元のみ") {
      return clampRegion(
        faceX + faceW * 0.14,
        faceY + faceH * 0.2,
        faceW * 0.72,
        faceH * 0.2
      );
    }

    if (area === "口元のみ") {
      return clampRegion(
        faceX + faceW * 0.22,
        faceY + faceH * 0.62,
        faceW * 0.56,
        faceH * 0.16
      );
    }

    return clampRegion(faceX, faceY, faceW, faceH);
  };

  const clampMosaicRegion = useCallback(
    (region: { x: number; y: number; width: number; height: number }) => {
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

  const handleMosaicUpload = useCallback(async (file: File) => {
    const imageUrl = URL.createObjectURL(file);
    setMosaicSrc(imageUrl);
    setMosaicImage(null);
    setMosaicBox(null);
    setMosaicFaceBox(null);

    const bitmap = await createImageBitmap(file);
    const imageSize = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    setMosaicImageSize(imageSize);

    setMosaicStage("MediaPipe Face Detection で顔を検出中...");
    try {
      const faceBox = await detectFirstFace(file);
      setMosaicFaceBox(faceBox);
      setMosaicBox(faceBox ? buildRegionBox(faceBox, mosaicArea) : null);
      if (!faceBox) {
        setMosaicStage("顔が見つからなかったため、位置調整は手動になります。");
        return;
      }
      setMosaicStage("顔を検出しました。必要なら枠を微調整してください。");
    } catch {
      setMosaicStage("顔検出に失敗しました。位置調整は手動で行えます。");
    }
  }, [mosaicArea]);

  const redetectMosaicFace = useCallback(async () => {
    if (!mosaicSrc) return;

    setMosaicStage("MediaPipe Face Detection で再検出中...");
    try {
      const res = await fetch(mosaicSrc);
      const blob = await res.blob();
      const file = new File([blob], "mosaic-redetect.jpg", { type: blob.type || "image/jpeg" });
      const faceBox = await detectFirstFace(file);
      setMosaicFaceBox(faceBox);
      setMosaicBox(faceBox ? buildRegionBox(faceBox, mosaicArea) : null);
      setMosaicStage(faceBox ? "再検出しました。必要なら枠を微調整してください。" : "顔が見つかりませんでした。");
    } catch {
      setMosaicStage("再検出に失敗しました。");
    }
  }, [mosaicArea, mosaicSrc]);

  const applyMosaic = async (imageUrl: string, mode: "blur" | "gaussian") => {
    setMosaicLoading(true);
    setMosaicStage("画像を読み込み中...");
    setMosaicImage(null);
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const file = new File([blob], "mosaic.jpg", { type: blob.type || "image/jpeg" });

      setMosaicStage("顔を検出中...");
      const faceBox = await detectFirstFace(file);
      if (!faceBox) {
        alert("顔を検出できませんでした");
        setMosaicLoading(false);
        setMosaicStage("");
        return;
      }

      setMosaicFaceBox(faceBox);
      const region = buildRegionBox(faceBox, mosaicArea);
      setMosaicBox(region);

      const modeMap: Record<"blur" | "gaussian", string> = {
        blur: "ブラー",
        gaussian: "ガウス",
      };

      const strengthMap: Record<string, string> = {
        "弱": "1",
        "中": "2",
        "強": "3",
        "最強": "4",
      };

      setMosaicStage(mode === "blur" ? "ブラー加工中..." : "ガウス加工中...");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", modeMap[mode]);
      formData.append("boxMode", "region");
      formData.append("x", String(region.x));
      formData.append("y", String(region.y));
      formData.append("width", String(region.width));
      formData.append("height", String(region.height));
      formData.append("strength", strengthMap[mosaicStrength] ?? "2");

      const apiRes = await fetch("/api/mosaic", { method: "POST", body: formData });
      if (!apiRes.ok) throw new Error("モザイク処理失敗");

      setMosaicStage("仕上げ中...");
      const resultBlob = await apiRes.blob();
      setMosaicImage(URL.createObjectURL(resultBlob));
    } catch (err: any) {
      alert(err.message || "モザイク処理に失敗しました");
    } finally {
      setMosaicLoading(false);
      setMosaicStage("");
    }
  };

  const startEditingAvatar = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const saveEditingAvatar = (id: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      alert("キャスト名を入力してください");
      return;
    }

    setAvatars(prev =>
      prev.map(a => (a.id === id ? { ...a, name: trimmed } : a))
    );
    setEditingId(null);
    setEditingName("");
  };

  const cancelEditingAvatar = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")).slice(0, 15);
    if (dropped.length) setFiles(prev => [...prev, ...dropped].slice(0, 15));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#071e28", fontFamily: "'Hiragino Sans', 'Yu Gothic', sans-serif", color: "#f0ece4" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .sidebar { display: flex; }
        .bottom-nav { display: none !important; }
        @media (max-width: 680px) {
          .sidebar { display: none !important; }
          .bottom-nav { display: flex !important; position: fixed; bottom: 0; left: 0; right: 0; background: #0a2535; border-top: 1px solid #1a3d4d; z-index: 100; }
          .main-content { padding-bottom: 70px !important; }
        }
        .two-col { grid-template-columns: 1fr 1fr; }
        @media (max-width: 900px) { .two-col { grid-template-columns: 1fr !important; } }
      `}</style>

      <div style={{ background: "#071e28", borderBottom: "1px solid #1a3d4d", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, background: "linear-gradient(135deg,#c9a84c,#8b6914)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#071e28" }}>L</div>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.12em", color: "#f0ece4" }}>LUMIVEIL</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)", borderRadius: 20, padding: "4px 12px", fontSize: 12, color: "#c9a84c" }}>
            ◆ {credits} クレジット
          </div>
        </div>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 56px)" }}>
        <div className="sidebar" style={{ width: 200, background: "#071e28", borderRight: "1px solid #1a3d4d", flexDirection: "column", padding: "20px 0", flexShrink: 0 }}>
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => setTab(item.id)} style={{
              width: "100%", padding: "12px 20px", border: "none", background: tab === item.id ? "rgba(201,168,76,0.08)" : "transparent",
              borderLeft: tab === item.id ? "2px solid #c9a84c" : "2px solid transparent",
              color: tab === item.id ? "#c9a84c" : "#888", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 10, fontSize: 13, textAlign: "left",
            }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>{item.label}
            </button>
          ))}
        </div>

        <div className="main-content" style={{ flex: 1, padding: 24, overflowY: "auto" }}>
          {tab === "generate" && (
            <div className="two-col" style={{ display: "grid", gap: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: "#c8c2b4", borderRadius: 12, padding: 18, border: "1px solid #a89e8e" }}>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 12, letterSpacing: "0.05em" }}>キャスト選択</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {avatars.map(av => (
                      <button key={av.id} onClick={() => setSelectedAvatar(av.id)} style={{
                        padding: "10px 14px", borderRadius: 8, border: selectedAvatar === av.id ? "1px solid rgba(100,200,240,0.6)" : "1px solid #a89e8e",
                        background: selectedAvatar === av.id ? "rgba(100,200,240,0.25)" : "rgba(0,0,0,0.04)",
                        color: "#111", fontSize: 13, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10,
                      }}>
                        <span style={{ fontSize: 20 }}>👤</span>
                        <div>
                          <div style={{ fontWeight: 500 }}>{av.name}</div>
                          <div style={{ fontSize: 10, color: "#444" }}>{av.date}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ background: "#c8c2b4", borderRadius: 12, padding: 18, border: "1px solid #a89e8e", display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 11, color: "#444", letterSpacing: "0.05em" }}>生成設定</div>
                  {[
                    { label: "場所・背景", options: LOCATIONS, value: location, onChange: setLocation },
                    { label: "衣装", options: COSTUMES, value: costume, onChange: setCostume },
                    { label: "ポーズ", options: POSES, value: pose, onChange: setPose },
                  ].map(s => (
                    <div key={s.label}>
                      <label style={{ fontSize: 11, color: "#333", display: "block", marginBottom: 4 }}>{s.label}</label>
                      <select value={s.value} onChange={e => s.onChange(e.target.value)} style={{ width: "100%", background: "#c8c2b4", border: "1px solid #a89e8e", borderRadius: 8, color: "#1a1a1a", padding: "9px 12px", fontSize: 13 }}>
                        {s.options.map(o => <option key={o.id} value={o.id}>{o.label}　{o.desc}</option>)}
                      </select>
                    </div>
                  ))}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[
                      { label: "髪の長さ", options: HAIR_LENGTHS.map(l => ({ id: l, label: l })), value: hairLength, onChange: setHairLength },
                      { label: "髪の色", options: HAIR_COLORS.map(c => ({ id: c, label: c })), value: hairColor, onChange: setHairColor },
                    ].map(s => (
                      <div key={s.label}>
                        <label style={{ fontSize: 11, color: "#333", display: "block", marginBottom: 4 }}>{s.label}</label>
                        <select value={s.value} onChange={e => s.onChange(e.target.value)} style={{ width: "100%", background: "#c8c2b4", border: "1px solid #a89e8e", borderRadius: 8, color: "#1a1a1a", padding: "9px 10px", fontSize: 13 }}>
                          {s.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "#333", display: "block", marginBottom: 6 }}>生成枚数</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[1, 2, 4, 8].map(n => (
                        <button key={n} onClick={() => setCount(n)} style={{
                          flex: 1, padding: "8px 0", borderRadius: 8,
                          border: count === n ? "1px solid #c9a84c" : "1px solid #a89e8e",
                          background: count === n ? "rgba(201,168,76,0.15)" : "transparent",
                          color: count === n ? "#c9a84c" : "#333", fontSize: 13, cursor: "pointer",
                        }}>{n}枚</button>
                      ))}
                    </div>
                  </div>
                </div>

                <button onClick={handleGenerate} disabled={generating || !selectedAvatar} style={{
                  width: "100%", padding: "14px 0",
                  background: selectedAvatar && !generating ? "linear-gradient(135deg, #c9a84c, #8b6914)" : "rgba(201,168,76,0.1)",
                  border: "none", borderRadius: 10,
                  color: selectedAvatar && !generating ? "#071e28" : "#555",
                  fontWeight: 700, fontSize: 15, cursor: selectedAvatar ? "pointer" : "not-allowed",
                }}>
                  {generating ? "生成中..." : `画像を生成する（${count}クレジット）`}
                </button>
              </div>

              <div style={{ background: "#c8c2b4", borderRadius: 12, padding: 18, border: "1px solid #a89e8e", minHeight: 400 }}>
                  ...
