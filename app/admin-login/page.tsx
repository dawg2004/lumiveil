"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

export default function AdminLoginPage() {
  const nextPath = useMemo(() => {
    if (typeof window === "undefined") return "/admin";
    const params = new URLSearchParams(window.location.search);
    return params.get("next") || "/admin";
  }, []);

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("通常ログイン済みの管理者のみ、追加パスワードで管理画面に入れます。");

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const res = await fetch("/api/admin/session");
        const data = await res.json();
        if (!active) return;
        if (res.ok && data.authenticated) {
          window.location.href = nextPath;
        }
      } catch {
        // noop
      }
    };
    void check();
    return () => {
      active = false;
    };
  }, [nextPath]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "管理者ログインに失敗しました");
      }
      window.location.href = nextPath;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "管理者ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#071e28", color: "#f0ece4", display: "grid", placeItems: "center", padding: 20, fontFamily: "var(--font-lumiveil-sans)" }}>
      <div style={{ width: "min(460px, 100%)", background: "#d0cabd", borderRadius: 12, border: "1px solid #9f9686", padding: 20, color: "#171717", boxShadow: "0 10px 30px rgba(0,0,0,0.18)" }}>
        <div style={{ color: "#6a6258", fontSize: 11, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 8 }}>LUMIVEIL ADMIN</div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>管理画面ロック解除</h1>
        <p style={{ marginTop: 10, marginBottom: 18, color: "#4e4a43", fontSize: 13, lineHeight: 1.7 }}>
          通常ログインとは別に、管理画面専用パスワードを入力してください。
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 600 }}>
            管理画面パスワード
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="パスワードを入力"
              style={{
                width: "100%",
                borderRadius: 10,
                border: "1px solid #a89e8e",
                background: "#f5f1e7",
                color: "#111",
                padding: "12px 14px",
                fontSize: 14,
              }}
            />
          </label>

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #b9983d",
              background: "#c9a84c",
              color: "#111",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {loading ? "確認中..." : "管理画面に入る"}
          </button>
        </form>

        <div style={{ marginTop: 14, minHeight: 22, color: status.includes("失敗") || status.includes("違") || status.includes("未設定") || status.includes("許可") ? "#b84242" : "#4e4a43", fontSize: 12 }}>
          {status}
        </div>

        <div style={{ marginTop: 20, borderTop: "1px solid #b0a898", paddingTop: 16, textAlign: "center" }}>
          <a href="/login" style={{ color: "#8a8070", fontSize: 11, textDecoration: "none" }}>
            通常ログインページへ
          </a>
        </div>
      </div>
    </main>
  );
}
