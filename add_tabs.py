with open('/Users/dawg/lumiveil/app/page.tsx', 'r') as f:
    content = f.read()

edit_tab = '''          {tab === "edit" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 4px" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>AI画像編集</div>
              <div style={{ background: "#c8c2b4", borderRadius: 12, padding: 18, border: "1px solid #a89e8e", display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>画像をアップロード</div>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px 0", borderRadius: 8, background: "#b0a898", border: "1px solid #a89e8e", color: "#111", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    画像を選択する
                    <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { (window as any)._editSrc = URL.createObjectURL(f); } }} style={{ display: "none" }} />
                  </label>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>編集の指示（チャット）</div>
                  <textarea placeholder="例：背景を白にして、明るくして、コントラストを上げて" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #a89e8e", background: "#d4cfc8", color: "#111", fontSize: 13, minHeight: 80, resize: "none", boxSizing: "border-box" }} id="editPrompt" />
                </div>
                <button onClick={async () => {
                  const src = (window as any)._editSrc;
                  const prompt = (document.getElementById("editPrompt") as HTMLTextAreaElement)?.value;
                  if (!src || !prompt) return alert("画像と指示を入力してください");
                  const blob = await fetch(src).then(r => r.blob());
                  const form = new FormData();
                  form.append("file", blob, "image.jpg");
                  const up = await fetch("https://fal.run/storage/upload", { method: "POST", headers: { "Authorization": "Key " + process.env.NEXT_PUBLIC_FAL_API_KEY }, body: form });
                  const upData = await up.json();
                  const res = await fetch("/api/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: upData.url, prompt }) });
                  const data = await res.json();
                  if (data.url) { (window as any)._editResult = data.url; alert("完了！"); }
                }} style={{ width: "100%", padding: "13px 0", borderRadius: 8, background: "linear-gradient(135deg, #c9a84c, #8b6914)", border: "none", color: "#071e28", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  AI編集を実行
                </button>
              </div>
            </div>
          )}

'''

video_tab = '''          {tab === "video" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 4px" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>動画生成</div>
              <div style={{ background: "#c8c2b4", borderRadius: 12, padding: 18, border: "1px solid #a89e8e", display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>元画像をアップロード</div>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px 0", borderRadius: 8, background: "#b0a898", border: "1px solid #a89e8e", color: "#111", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    画像を選択する
                    <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { (window as any)._videoSrc = URL.createObjectURL(f); } }} style={{ display: "none" }} />
                  </label>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>動画の説明（任意）</div>
                  <textarea placeholder="例：ゆっくり微笑んでいる、髪がなびいている" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #a89e8e", background: "#d4cfc8", color: "#111", fontSize: 13, minHeight: 60, resize: "none", boxSizing: "border-box" }} id="videoPrompt" />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>動画の長さ</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["3秒", "5秒", "10秒"].map(sec => (
                      <button key={sec} onClick={() => (window as any)._videoDuration = sec} style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: "rgba(0,0,0,0.06)", border: "1px solid #a89e8e", color: "#111", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{sec}</button>
                    ))}
                  </div>
                </div>
                <button onClick={async () => {
                  const src = (window as any)._videoSrc;
                  if (!src) return alert("画像を選択してください");
                  const prompt = (document.getElementById("videoPrompt") as HTMLTextAreaElement)?.value || "";
                  const blob = await fetch(src).then(r => r.blob());
                  const form = new FormData();
                  form.append("file", blob, "image.jpg");
                  const up = await fetch("https://fal.run/storage/upload", { method: "POST", headers: { "Authorization": "Key " + process.env.NEXT_PUBLIC_FAL_API_KEY }, body: form });
                  const upData = await up.json();
                  const res = await fetch("/api/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: upData.url, prompt }) });
                  const data = await res.json();
                  if (data.url) { alert("動画生成完了！"); window.open(data.url); }
                  else { alert("エラー: " + (data.error || "不明")); }
                }} style={{ width: "100%", padding: "13px 0", borderRadius: 8, background: "linear-gradient(135deg, #c9a84c, #8b6914)", border: "none", color: "#071e28", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  動画を生成する
                </button>
              </div>
            </div>
          )}

'''

content = content.replace('          {tab === "history" && (', edit_tab + video_tab + '          {tab === "history" && (')

with open('/Users/dawg/lumiveil/app/page.tsx', 'w') as f:
    f.write(content)

print("完了")
