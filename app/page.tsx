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
                <div style={{ fontSize: 11, color: "#444", marginBottom: 14 }}>生成結果</div>
                {step === "generating" && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 320, gap: 16 }}>
                    <div style={{ fontSize: 40 }}>✦</div>
                    <div style={{ fontSize: 13, color: "#333" }}>AIが画像を生成中...</div>
                    <div style={{ width: "80%", height: 4, background: "#a89e8e", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: "60%", background: "linear-gradient(90deg, #c9a84c, #f0d080)", borderRadius: 2, animation: "pulse 1.5s ease-in-out infinite" }} />
                    </div>
                  </div>
                )}
                {step === "done" && (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: generated.length === 1 ? "1fr" : "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      {generated.map((src, i) => (
                        <div key={i} style={{ position: "relative", borderRadius: 8, overflow: "hidden" }}>
                          <img src={src} alt="" style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover", display: "block" }} />
                          <button style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.7)", border: "1px solid rgba(201,168,76,0.5)", borderRadius: 6, color: "#c9a84c", fontSize: 10, padding: "4px 8px", cursor: "pointer" }}>保存</button>
                          <div style={{ position: "absolute", bottom: 6, left: 6, display: "flex", gap: 4 }}>
                            <button onClick={() => applyMosaic(src, "blur")} style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, color: "#fff", fontSize: 10, padding: "4px 8px", cursor: "pointer" }}>ブラー</button>
                            <button onClick={() => applyMosaic(src, "gaussian")} style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, color: "#fff", fontSize: 10, padding: "4px 8px", cursor: "pointer" }}>ガウス</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => { setStep("upload"); setGenerated([]); }} style={{ width: "100%", padding: "8px 0", background: "transparent", border: "1px solid #a89e8e", borderRadius: 8, color: "#333", fontSize: 12, cursor: "pointer" }}>
                      設定を変えてもう一度生成
                    </button>
                  </div>
                )}
                {step !== "generating" && step !== "done" && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 320, gap: 12, color: "#555" }}>
                    <div style={{ fontSize: 48 }}>◈</div>
                    <div style={{ fontSize: 13 }}>設定を選択して生成ボタンを押してください</div>
                    <div style={{ fontSize: 11, color: "#777" }}>1枚 = 1クレジット</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "avatar" && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>キャスト登録</div>
                <div style={{ fontSize: 12, color: "#aaa" }}>写真をアップロードしてAIがキャストの特徴を学習します。</div>
              </div>
              <div className="two-col" style={{ display: "grid", gap: 20 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ background: "#c8c2b4", borderRadius: 12, padding: 18, border: "1px solid #a89e8e" }}>
                    <div style={{ fontSize: 11, color: "#444", marginBottom: 10 }}>キャスト名</div>
                    <input value={castName} onChange={e => setCastName(e.target.value)}
                      placeholder="例：藍原あの_新宿"
                      style={{ width: "100%", background: "rgba(0,0,0,0.04)", border: "1px solid #a89e8e", borderRadius: 8, color: "#111", padding: "10px 12px", fontSize: 13 }}
                    />
                  </div>
                  <div style={{ background: "#c8c2b4", borderRadius: 12, padding: 18, border: "1px solid #a89e8e" }}>
                    <div style={{ fontSize: 11, color: "#444", marginBottom: 10 }}>写真アップロード</div>
                    <div
                      onDragOver={e => e.preventDefault()} onDrop={handleDrop}
                      onClick={() => inputRef.current?.click()}
                      style={{ border: "2px dashed #1e4d5f", borderRadius: 12, padding: "28px 20px", textAlign: "center", cursor: "pointer", background: "rgba(0,0,0,0.04)" }}
                    >
                      <input ref={inputRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files || [])].slice(0, 15))} />
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                      <div style={{ color: "#c9a84c", fontWeight: 600, fontSize: 14 }}>写真をドロップ または クリック</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>顔がはっきり写った写真を3〜15枚</div>
                    </div>
                    {files.length > 0 && (
                      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {files.map((f, i) => (
                          <div key={i} style={{ position: "relative" }}>
                            <img src={URL.createObjectURL(f)} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8 }} />
                            <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "#e05252", border: "none", color: "#fff", fontSize: 10, cursor: "pointer" }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={handleCreateAvatar} disabled={files.length < 1 || avatarCreating || !castName} style={{
                    width: "100%", padding: "13px 0",
                    background: files.length >= 1 && castName && !avatarCreating ? "linear-gradient(135deg, #c9a84c, #8b6914)" : "rgba(201,168,76,0.1)",
                    border: "none", borderRadius: 10, color: files.length >= 1 && castName ? "#071e28" : "#555", fontWeight: 700, fontSize: 14, cursor: "pointer",
                  }}>
                    {avatarCreating ? `学習中... ${Math.round(avatarProgress)}%` : "キャスト登録"}
                  </button>
                  {avatarCreating && (
                    <div style={{ height: 4, background: "#1a3d4d", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: `${avatarProgress}%`, background: "linear-gradient(90deg, #c9a84c, #f0d080)", borderRadius: 2, transition: "width 0.3s" }} />
                    </div>
                  )}
                </div>

                <div style={{ background: "#c8c2b4", borderRadius: 12, padding: 18, border: "1px solid #a89e8e" }}>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 14 }}>登録済みキャスト</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {avatars.map(av => (
                      <div
                        key={av.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "12px 14px",
                          borderRadius: 8,
                          background: "rgba(0,0,0,0.04)",
                          border: "1px solid #a89e8e",
                        }}
                      >
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 10,
                            background: "rgba(0,0,0,0.08)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 22,
                          }}
                        >
                          👤
                        </div>

                        <div style={{ flex: 1 }}>
                          {editingId === av.id ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <input
                                value={editingName}
                                onChange={e => setEditingName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") saveEditingAvatar(av.id);
                                  if (e.key === "Escape") cancelEditingAvatar();
                                }}
                                autoFocus
                                style={{
                                  width: "100%",
                                  fontSize: 13,
                                  fontWeight: 500,
                                  border: "1px solid #c9a84c",
                                  borderRadius: 6,
                                  padding: "6px 8px",
                                  background: "#fff8e6",
                                  color: "#111",
                                }}
                              />
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  onClick={() => saveEditingAvatar(av.id)}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: 6,
                                    background: "rgba(201,168,76,0.15)",
                                    border: "1px solid rgba(201,168,76,0.4)",
                                    color: "#8b6914",
                                    fontSize: 10,
                                    cursor: "pointer",
                                  }}
                                >
                                  保存
                                </button>
                                <button
                                  onClick={cancelEditingAvatar}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: 6,
                                    background: "rgba(100,100,100,0.08)",
                                    border: "1px solid rgba(100,100,100,0.25)",
                                    color: "#555",
                                    fontSize: 10,
                                    cursor: "pointer",
                                  }}
                                >
                                  キャンセル
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>
                                {av.name}
                              </div>
                              <div style={{ fontSize: 10, color: "#555" }}>登録日 {av.date}</div>
                            </>
                          )}
                        </div>

                        <button
                          onClick={() => {
                            setSelectedAvatar(av.id);
                            setTab("generate");
                          }}
                          style={{
                            padding: "5px 10px",
                            borderRadius: 6,
                            background: "rgba(201,168,76,0.1)",
                            border: "1px solid rgba(201,168,76,0.3)",
                            color: "#c9a84c",
                            fontSize: 10,
                            cursor: "pointer",
                          }}
                        >
                          選択
                        </button>

                        {editingId === av.id ? null : (
                          <button
                            onClick={() => startEditingAvatar(av.id, av.name)}
                            style={{
                              padding: "5px 10px",
                              borderRadius: 6,
                              background: "rgba(100,100,100,0.1)",
                              border: "1px solid rgba(100,100,100,0.3)",
                              color: "#555",
                              fontSize: 10,
                              cursor: "pointer",
                            }}
                          >
                            編集
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "mosaic" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 4px" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>モザイク加工</div>
              <div style={{ background: "#c8c2b4", borderRadius: 12, padding: 18, border: "1px solid #a89e8e", display: "flex", flexDirection: "column", gap: 14 }}>

                <div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>キャストを選択</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {avatars.map(av => (
                      <div key={av.id} onClick={() => { setSelectedAvatar(av.id); (window as any)._mosaicSrc = null; setMosaicImage(null); setMosaicBox(null); setMosaicFaceBox(null); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, background: selectedAvatar === av.id ? "rgba(201,168,76,0.15)" : "rgba(0,0,0,0.04)", border: selectedAvatar === av.id ? "1px solid rgba(201,168,76,0.5)" : "1px solid #a89e8e", cursor: "pointer" }}>
                        <div style={{ fontSize: 22 }}>👤</div>
                        <div style={{ fontWeight: 500, fontSize: 13, color: "#111" }}>{av.name}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>画像をアップロード</div>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px 0", borderRadius: 8, background: "#b0a898", border: "1px solid #a89e8e", color: "#111", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    📁 画像を選択する
                    <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { setMosaicSrc(URL.createObjectURL(f)); setMosaicImage(null); setMosaicBox(null); setMosaicFaceBox(null); } }} style={{ display: "none" }} />
                  </label>
                  {mosaicSrc && (
                    <div style={{ marginTop: 10, position: "relative", background: "#000", borderRadius: 8, overflow: "hidden" }}>
                      <img
                        src={mosaicSrc}
                        alt="preview"
                        style={{ width: "100%", borderRadius: 8, maxHeight: 400, objectFit: "contain", display: "block" }}
                      />
                      {mosaicBox && (
                        <div
                          style={{
                            position: "absolute",
                            left: `${mosaicBox.x}px`,
                            top: `${mosaicBox.y}px`,
                            width: `${mosaicBox.width}px`,
                            height: `${mosaicBox.height}px`,
                            border: "2px solid #f0c85a",
                            borderRadius: mosaicArea === "顔全体" ? "999px" : 10,
                            boxShadow: "0 0 0 9999px rgba(0,0,0,0.16)",
                            pointerEvents: "none",
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>加工範囲</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["顔全体", "目元のみ", "口元のみ"].map(area => (
                      <button key={area} onClick={() => { setMosaicArea(area); setMosaicImage(null); setMosaicBox(mosaicFaceBox ? buildRegionBox(mosaicFaceBox, area) : null); }} style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: mosaicArea === area ? "rgba(201,168,76,0.3)" : "rgba(0,0,0,0.06)", border: mosaicArea === area ? "1px solid #c9a84c" : "1px solid #a89e8e", color: "#111", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{area}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>強度</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["弱", "中", "強", "最強"].map((level) => (
                      <button key={level} onClick={() => setMosaicStrength(level)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: mosaicStrength === level ? "rgba(201,168,76,0.3)" : "rgba(0,0,0,0.06)", border: mosaicStrength === level ? "1px solid #c9a84c" : "1px solid #a89e8e", color: "#111", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{level}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>エフェクト</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => mosaicSrc && applyMosaic(mosaicSrc, "blur")} style={{ flex: 1, padding: "12px 0", borderRadius: 8, background: "#b0a898", border: "1px solid #a89e8e", color: "#111", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>ブラー</button>
                    <button onClick={() => mosaicSrc && applyMosaic(mosaicSrc, "gaussian")} style={{ flex: 1, padding: "12px 0", borderRadius: 8, background: "#b0a898", border: "1px solid #a89e8e", color: "#111", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>ガウス</button>
                  </div>
                </div>

                {mosaicLoading && (
                  <div style={{ marginTop: 6, padding: "12px 14px", borderRadius: 8, background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.35)", color: "#6f5310", fontSize: 13, fontWeight: 700 }}>
                    {mosaicStage || "加工中..."}
                  </div>
                )}

              </div>
            </div>
          )}

          {tab === "edit" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 4px" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>AI画像編集</div>
              <div style={{ background: "#c8c2b4", borderRadius: 12, padding: 18, border: "1px solid #a89e8e", display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>画像をアップロード</div>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px 0", borderRadius: 8, background: "#b0a898", border: "1px solid #a89e8e", color: "#111", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    画像を選択する
                    <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { setEditSrc(URL.createObjectURL(f)); setEditResult(null); } }} style={{ display: "none" }} />
                  </label>
                </div>
                {mosaicSrc && <img src={mosaicSrc} alt="preview" style={{ width: "100%", borderRadius: 8, marginBottom: 4, objectFit: "contain", background: "#000" }} />}
                {editSrc && <img src={editSrc} alt="preview" style={{ width: "100%", borderRadius: 8, maxHeight: 400, objectFit: "contain", background: "#000" }} />}
                {editResult && <div><div style={{ fontSize: 11, color: "#444", marginBottom: 4 }}>編集結果</div><img src={editResult} alt="result" style={{ width: "100%", borderRadius: 8 }} /></div>}
                <div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>編集の指示（チャット）</div>
                  <textarea placeholder="例：背景を白にして、明るくして、コントラストを上げて" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #a89e8e", background: "#d4cfc8", color: "#111", fontSize: 13, minHeight: 80, resize: "none", boxSizing: "border-box" }} id="editPrompt" />
                </div>
                <button onClick={async () => {
                  if (!editSrc) return alert("画像を選択してください");
                  const prompt = (document.getElementById("editPrompt") as HTMLTextAreaElement)?.value;
                  if (!prompt) return alert("編集の指示を入力してください");
                  const blob = await fetch(editSrc).then(r => r.blob());
                  const form = new FormData();
                  form.append("file", blob, "image.jpg");
                  const up = await fetch("https://fal.run/storage/upload", { method: "POST", headers: { "Authorization": "Key " + process.env.NEXT_PUBLIC_FAL_API_KEY }, body: form });
                  const upData = await up.json();
                  const res = await fetch("/api/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: upData.url, prompt }) });
                  const data = await res.json();
                  if (data.url) { setEditResult(data.url); }
                }} style={{ width: "100%", padding: "13px 0", borderRadius: 8, background: "linear-gradient(135deg, #c9a84c, #8b6914)", border: "none", color: "#071e28", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  AI編集を実行
                </button>
              </div>
            </div>
          )}

          {tab === "video" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 4px" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>動画生成</div>
              <div style={{ background: "#c8c2b4", borderRadius: 12, padding: 18, border: "1px solid #a89e8e", display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>元画像をアップロード</div>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px 0", borderRadius: 8, background: "#b0a898", border: "1px solid #a89e8e", color: "#111", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    画像を選択する
                    <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { setVideoSrc(URL.createObjectURL(f)); setVideoResult(null); } }} style={{ display: "none" }} />
                  </label>
                </div>
                {videoSrc && <img src={videoSrc} alt="preview" style={{ width: "100%", borderRadius: 8, maxHeight: 400, objectFit: "contain", background: "#000" }} />}
                {videoResult && <div><div style={{ fontSize: 11, color: "#444", marginBottom: 4 }}>生成動画</div><video src={videoResult} controls style={{ width: "100%", borderRadius: 8 }} /></div>}
                <div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>動画の説明（任意）</div>
                  <textarea placeholder="例：ゆっくり微笑んでいる、髪がなびいている" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #a89e8e", background: "#d4cfc8", color: "#111", fontSize: 13, minHeight: 60, resize: "none", boxSizing: "border-box" }} id="videoPrompt" />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>動画の長さ</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[["3秒","3"], ["5秒","5"], ["10秒","10"]].map(([label, val]) => (
                      <button key={val} onClick={() => setVideoDuration(val)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: videoDuration === val ? "rgba(201,168,76,0.3)" : "rgba(0,0,0,0.06)", border: videoDuration === val ? "1px solid #c9a84c" : "1px solid #a89e8e", color: "#111", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{label}</button>
                    ))}
                  </div>
                </div>
                <button onClick={async () => {
                  if (!videoSrc) return alert("画像を選択してください");
                  const prompt = (document.getElementById("videoPrompt") as HTMLTextAreaElement)?.value || "";
                  const blob = await fetch(videoSrc).then(r => r.blob());
                  const form = new FormData();
                  form.append("file", blob, "image.jpg");
                  const up = await fetch("https://fal.run/storage/upload", { method: "POST", headers: { "Authorization": "Key " + process.env.NEXT_PUBLIC_FAL_API_KEY }, body: form });
                  const upData = await up.json();
                  const res = await fetch("/api/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: upData.url, prompt }) });
                  const data = await res.json();
                  if (data.url) { setVideoResult(data.url); }
                  else { alert("エラー: " + (data.error || "不明")); }
                }} style={{ width: "100%", padding: "13px 0", borderRadius: 8, background: "linear-gradient(135deg, #c9a84c, #8b6914)", border: "none", color: "#071e28", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  動画を生成する
                </button>
              </div>
            </div>
          )}

          {tab === "history" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400, color: "#aaa" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>◎</div>
              <div>生成履歴（実装予定）</div>
            </div>
          )}

          {tab === "plan" && (
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>プラン・料金</div>
              <div className="two-col" style={{ display: "grid", gap: 14 }}>
                {PLANS.map(plan => ({
                  ...plan,
                  priceId: process.env[`NEXT_PUBLIC_STRIPE_PRICE_${plan.priceId}`],
                })).map(plan => (
                  <div key={plan.name} style={{ background: plan.current ? "rgba(201,168,76,0.07)" : "#0d2e3a", border: `1px solid ${plan.current ? "rgba(201,168,76,0.4)" : "#1a3d4d"}`, borderRadius: 12, padding: 20, position: "relative" }}>
                    {plan.current && <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "#c9a84c", color: "#071e28", fontSize: 9, padding: "2px 10px", borderRadius: 20, fontWeight: 700 }}>現在のプラン</div>}
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: plan.color }}>{plan.name}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>¥{plan.price}<span style={{ fontSize: 11, color: "#aaa" }}>/月</span></div>
                    <div style={{ fontSize: 12, color: "#aaa", marginBottom: 14 }}>{plan.credits.toLocaleString()} クレジット/月</div>
                    <button style={{ width: "100%", padding: "8px 0", background: plan.current ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.06)", border: `1px solid ${plan.current ? "rgba(201,168,76,0.4)" : "#1e4d5f"}`, borderRadius: 8, color: plan.current ? "#c9a84c" : "#666", fontSize: 12, cursor: "pointer" }} onClick={async () => { if (!plan.current && plan.priceId) { const res = await fetch("/api/stripe/checkout", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ priceId: plan.priceId }) }); const data = await res.json(); if (data.url) window.location.href = data.url; } }}>
                      {plan.current ? "現在のプラン" : "変更する"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {mosaicImage && mosaicSrc && (
        <div
          onClick={() => setMosaicImage(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "min(920px, 92vw)",
              background: "#102733",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f0ece4" }}>比較表示</div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#c9a84c" }}>加工前</div>
                <div
                  style={{
                    height: 300,
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "#000",
                    border: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <img
                    src={mosaicSrc}
                    alt="before"
                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#c9a84c" }}>加工後</div>
                <div
                  style={{
                    height: 300,
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "#000",
                    border: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <img
                    src={mosaicImage}
                    alt="after"
                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <a
                href={mosaicImage}
                download="mosaic.png"
                style={{
                  padding: "10px 24px",
                  borderRadius: 8,
                  background: "linear-gradient(135deg, #c9a84c, #8b6914)",
                  color: "#071e28",
                  fontWeight: 700,
                  fontSize: 13,
                  textDecoration: "none",
                }}
              >
                保存
              </a>
              <button
                onClick={() => setMosaicImage(null)}
                style={{
                  padding: "10px 24px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bottom-nav" style={{ justifyContent: "space-around" }}>
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => setTab(item.id)} style={{
            flex: 1, padding: "10px 0", border: "none", background: "transparent", cursor: "pointer",
            color: tab === item.id ? "#c9a84c" : "#555",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            borderTop: tab === item.id ? "2px solid #c9a84c" : "2px solid transparent",
          }}>
            <span style={{ fontSize: 18 }}>{item.icon}</span>
            <span style={{ fontSize: 9 }}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
