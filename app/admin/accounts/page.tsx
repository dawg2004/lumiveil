"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type BlockedKeyword = {
  id: string;
  keyword: string;
  reason: string | null;
  created_at: string;
};

type AdminAccount = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  shop_id: string | null;
  shop_name: string | null;
  plan: string;
  credits: number;
};

type DraftMap = Record<string, {
  credits: string;
  plan: string;
  shop_name: string;
}>;

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const [confirmingEmails, setConfirmingEmails] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState("");

  const [keywords, setKeywords] = useState<BlockedKeyword[]>([]);
  const [keywordsLoading, setKeywordsLoading] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [newKeywordReason, setNewKeywordReason] = useState("");
  const [keywordStatus, setKeywordStatus] = useState("");

  const totalCredits = useMemo(
    () => accounts.reduce((total, account) => total + Number(account.credits ?? 0), 0),
    [accounts]
  );

  const syncDrafts = useCallback((items: AdminAccount[]) => {
    setDrafts(current => {
      const next: DraftMap = { ...current };
      for (const account of items) {
        next[account.id] = next[account.id] ?? {
          credits: String(account.credits ?? 0),
          plan: account.plan ?? "free",
          shop_name: account.shop_name ?? account.email ?? "",
        };
      }
      return next;
    });
  }, []);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("/api/admin/accounts");
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "アカウント一覧を取得できませんでした");
      }

      const nextAccounts = data.accounts ?? [];
      setAccounts(nextAccounts);
      setDrafts(
        Object.fromEntries(
          nextAccounts.map((account: AdminAccount) => [
            account.id,
            {
              credits: String(account.credits ?? 0),
              plan: account.plan ?? "free",
              shop_name: account.shop_name ?? account.email ?? "",
            },
          ])
        )
      );
    } catch (error) {
      setAccounts([]);
      setStatus(error instanceof Error ? error.message : "アカウント一覧を取得できませんでした");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const updateDraft = useCallback((id: string, field: "credits" | "plan" | "shop_name", value: string) => {
    setDrafts(current => ({
      ...current,
      [id]: {
        credits: current[id]?.credits ?? "0",
        plan: current[id]?.plan ?? "free",
        shop_name: current[id]?.shop_name ?? "",
        [field]: value,
      },
    }));
  }, []);

  const applyAccount = useCallback((account: AdminAccount) => {
    setAccounts(current => current.map(item => (item.id === account.id ? account : item)));
    syncDrafts([account]);
  }, [syncDrafts]);

  const saveAccount = useCallback(async (account: AdminAccount, createShop = false) => {
    const draft = drafts[account.id] ?? {
      credits: String(account.credits ?? 0),
      plan: account.plan ?? "free",
      shop_name: account.shop_name ?? account.email ?? "",
    };

    setSavingId(account.id);
    setStatus("");
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: account.id,
          email: account.email,
          createShop,
          credits: Number(draft.credits || 0),
          plan: draft.plan,
          shopName: draft.shop_name,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "アカウント更新に失敗しました");
      }

      if (data.account) {
        applyAccount(data.account as AdminAccount);
      } else {
        await loadAccounts();
      }
      setStatus(data.message ?? "更新しました。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "アカウント更新に失敗しました");
    } finally {
      setSavingId(null);
    }
  }, [applyAccount, drafts, loadAccounts]);

  const loadKeywords = useCallback(async () => {
    setKeywordsLoading(true);
    try {
      const res = await fetch("/api/admin/blocked-keywords");
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "取得失敗");
      setKeywords(data.keywords ?? []);
    } catch (error) {
      setKeywordStatus(error instanceof Error ? error.message : "取得失敗");
    } finally {
      setKeywordsLoading(false);
    }
  }, []);

  useEffect(() => { void loadKeywords(); }, [loadKeywords]);

  const addKeyword = useCallback(async () => {
    const kw = newKeyword.trim();
    if (!kw) return;
    setKeywordStatus("");
    try {
      const res = await fetch("/api/admin/blocked-keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw, reason: newKeywordReason.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "追加失敗");
      setNewKeyword("");
      setNewKeywordReason("");
      setKeywordStatus("追加しました。");
      await loadKeywords();
    } catch (error) {
      setKeywordStatus(error instanceof Error ? error.message : "追加失敗");
    }
  }, [loadKeywords, newKeyword, newKeywordReason]);

  const confirmAllEmails = useCallback(async () => {
    setConfirmingEmails(true);
    setConfirmStatus("");
    try {
      const res = await fetch("/api/admin/confirm-emails", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "失敗しました");
      setConfirmStatus(data.message ?? "完了しました。");
      await loadAccounts();
    } catch (error) {
      setConfirmStatus(error instanceof Error ? error.message : "メール確認に失敗しました");
    } finally {
      setConfirmingEmails(false);
    }
  }, [loadAccounts]);

  const deleteKeyword = useCallback(async (id: string) => {
    setKeywordStatus("");
    try {
      const res = await fetch("/api/admin/blocked-keywords", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "削除失敗");
      setKeywords(current => current.filter(kw => kw.id !== id));
      setKeywordStatus("削除しました。");
    } catch (error) {
      setKeywordStatus(error instanceof Error ? error.message : "削除失敗");
    }
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#071e28", color: "#f0ece4", fontFamily: "var(--font-lumiveil-sans)", padding: 18 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#c9a84c", fontSize: 11, letterSpacing: "0.08em", fontWeight: 500, marginBottom: 6 }}>LUMIVEIL ADMIN</div>
            <h1 style={{ fontSize: 24, fontWeight: 500, margin: 0 }}>アカウント管理</h1>
            <p style={{ marginTop: 6, color: "#9ba8ae", fontSize: 13 }}>クレジット残高・プラン・ショップ名を直接編集できます。shops が無いユーザーは管理画面から作成できます。</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <a href="https://fal.ai/dashboard/billing" target="_blank" rel="noreferrer" style={falLinkStyle}>FALクレジット確認</a>
            <a href="/admin" style={smallButtonStyle}>生成履歴</a>
            <a href="/" style={smallButtonStyle}>アプリへ戻る</a>
            <button onClick={() => void loadAccounts()} disabled={loading} style={smallButtonStyle}>
              {loading ? "更新中..." : "更新"}
            </button>
            <button
              onClick={() => void confirmAllEmails()}
              disabled={confirmingEmails}
              style={{ ...smallButtonStyle, background: "#1a4a2e", border: "1px solid #2a7a4a", color: "#6ee7a0" }}
            >
              {confirmingEmails ? "処理中..." : "全員メール確認"}
            </button>
          </div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div style={panelStyle}>
            <div style={metricLabelStyle}>登録アカウント</div>
            <div style={metricValueStyle}>{accounts.length.toLocaleString("ja-JP")}</div>
          </div>
          <div style={panelStyle}>
            <div style={metricLabelStyle}>合計クレジット残高</div>
            <div style={metricValueStyle}>{totalCredits.toLocaleString("ja-JP")}</div>
          </div>
        </section>

        {confirmStatus ? (
          <div style={{ ...panelStyle, background: confirmStatus.includes("失敗") ? "#3a1a1a" : "#0d2e1e", color: confirmStatus.includes("失敗") ? "#e07070" : "#6ee7a0", border: "1px solid", borderColor: confirmStatus.includes("失敗") ? "#7a2a2a" : "#2a7a4a" }}>
            {confirmStatus}
          </div>
        ) : null}

        {status ? (
          <div style={{ ...panelStyle, color: status.includes("権限") || status.includes("ログイン") || status.includes("失敗") ? "#b84242" : "#171717" }}>
            {status}
          </div>
        ) : null}

        {loading ? (
          <div style={panelStyle}>読み込み中...</div>
        ) : accounts.length > 0 ? (
          <div style={{ ...panelStyle, padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #a89e8e" }}>
                  <th style={thStyle}>メールアドレス</th>
                  <th style={thStyle}>クレジット</th>
                  <th style={thStyle}>プラン</th>
                  <th style={thStyle}>店舗名</th>
                  <th style={thStyle}>ショップ</th>
                  <th style={thStyle}>登録日</th>
                  <th style={thStyle}>最終ログイン</th>
                  <th style={thStyle}>操作</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(account => {
                  const draft = drafts[account.id] ?? {
                    credits: String(account.credits ?? 0),
                    plan: account.plan ?? "free",
                    shop_name: account.shop_name ?? account.email ?? "",
                  };
                  const saving = savingId === account.id;

                  return (
                    <tr key={account.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                      <td style={tdStyle}>
                        <div>{account.email || "-"}</div>
                        <div style={{ marginTop: 6, fontSize: 10, color: "#6a6258" }}>{account.id}</div>
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          min={0}
                          value={draft.credits}
                          onChange={event => updateDraft(account.id, "credits", event.target.value)}
                          style={inputStyle}
                        />
                      </td>
                      <td style={tdStyle}>
                        <select
                          value={draft.plan}
                          onChange={event => updateDraft(account.id, "plan", event.target.value)}
                          style={inputStyle}
                        >
                          <option value="free">free</option>
                          <option value="trial">trial</option>
                          <option value="standard">standard</option>
                          <option value="pro">pro</option>
                          <option value="ultra">ultra</option>
                        </select>
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="text"
                          value={draft.shop_name}
                          onChange={event => updateDraft(account.id, "shop_name", event.target.value)}
                          style={{ ...inputStyle, minWidth: 180 }}
                        />
                      </td>
                      <td style={tdStyle}>
                        {account.shop_id ? (
                          <div>
                            <div style={{ fontSize: 11, color: "#171717", fontWeight: 600 }}>作成済み</div>
                            <div style={{ marginTop: 4, fontSize: 10, color: "#6a6258" }}>{account.shop_id}</div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ fontSize: 11, color: "#b84242", fontWeight: 600 }}>未作成</div>
                            <button
                              onClick={() => void saveAccount(account, true)}
                              disabled={saving}
                              style={miniActionButtonStyle}
                            >
                              {saving ? "作成中..." : "ショップ作成"}
                            </button>
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>{formatDate(account.created_at)}</td>
                      <td style={tdStyle}>{account.last_sign_in_at ? formatDate(account.last_sign_in_at) : "-"}</td>
                      <td style={tdStyle}>
                        <button
                          onClick={() => void saveAccount(account)}
                          disabled={saving}
                          style={primaryActionButtonStyle}
                        >
                          {saving ? "保存中..." : "保存"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={panelStyle}>登録アカウントはまだありません。</div>
        )}

        <section style={{ ...panelStyle, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#111" }}>ブロックキーワード管理</div>
            <button onClick={() => void loadKeywords()} disabled={keywordsLoading} style={smallButtonStyle}>
              {keywordsLoading ? "更新中..." : "更新"}
            </button>
          </div>
          <p style={{ fontSize: 12, color: "#6a6258", marginBottom: 12 }}>
            ここに登録したキーワードは、ユーザーがプロンプトに入力した際に警告として表示されます。
          </p>

          {keywordStatus ? (
            <div style={{ marginBottom: 12, fontSize: 12, padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,0.06)", color: keywordStatus.includes("失敗") || keywordStatus.includes("登録済み") ? "#b84242" : "#2a7a4a" }}>
              {keywordStatus}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="キーワード（例: nude）"
              value={newKeyword}
              onChange={e => setNewKeyword(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void addKeyword(); }}
              style={{ ...inputStyle, flex: "1 1 160px" }}
            />
            <input
              type="text"
              placeholder="理由・メモ（任意）"
              value={newKeywordReason}
              onChange={e => setNewKeywordReason(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void addKeyword(); }}
              style={{ ...inputStyle, flex: "2 1 220px" }}
            />
            <button
              onClick={() => void addKeyword()}
              disabled={!newKeyword.trim()}
              style={{ ...primaryActionButtonStyle, opacity: !newKeyword.trim() ? 0.5 : 1 }}
            >
              追加
            </button>
          </div>

          {keywordsLoading ? (
            <div style={{ fontSize: 12, color: "#6a6258" }}>読み込み中...</div>
          ) : keywords.length === 0 ? (
            <div style={{ fontSize: 12, color: "#6a6258" }}>登録済みキーワードはありません。</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {keywords.map(kw => (
                <div key={kw.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "#ede3c8", border: "1px solid #c9a84c", borderRadius: 20, padding: "4px 10px 4px 12px" }}>
                  <span style={{ fontSize: 12, color: "#111", fontWeight: 600 }}>{kw.keyword}</span>
                  {kw.reason ? <span style={{ fontSize: 11, color: "#6a6258" }}>— {kw.reason}</span> : null}
                  <button
                    onClick={() => void deleteKeyword(kw.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#b84242", fontWeight: 700, fontSize: 14, lineHeight: 1, padding: "0 2px" }}
                    title="削除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const panelStyle = {
  background: "#d0cabd",
  borderRadius: 8,
  padding: 14,
  border: "1px solid #9f9686",
  color: "#171717",
};

const falLinkStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "#0d2e1e",
  border: "1px solid #2a7a4a",
  color: "#6ee7a0",
  fontWeight: 600,
  fontSize: 11,
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap" as const,
};

const smallButtonStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "#b0a898",
  border: "1px solid #a89e8e",
  color: "#111",
  fontWeight: 500,
  fontSize: 11,
  cursor: "pointer",
  textDecoration: "none",
};

const miniActionButtonStyle = {
  padding: "7px 10px",
  borderRadius: 8,
  background: "#e2d19a",
  border: "1px solid #c9a84c",
  color: "#111",
  fontWeight: 600,
  fontSize: 11,
  cursor: "pointer",
};

const primaryActionButtonStyle = {
  padding: "8px 12px",
  borderRadius: 8,
  background: "#c9a84c",
  border: "1px solid #b9983d",
  color: "#111",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
};

const inputStyle = {
  width: "100%",
  minWidth: 110,
  borderRadius: 8,
  border: "1px solid #a89e8e",
  background: "#f5f1e7",
  color: "#111",
  padding: "8px 10px",
  fontSize: 12,
};

const metricLabelStyle = {
  color: "#6a6258",
  fontSize: 11,
  fontWeight: 500,
  marginBottom: 6,
};

const metricValueStyle = {
  color: "#111",
  fontSize: 24,
  fontWeight: 600,
};

const thStyle = {
  padding: "11px 12px",
  textAlign: "left" as const,
  color: "#4e4a43",
  fontSize: 11,
  fontWeight: 600,
};

const tdStyle = {
  padding: "11px 12px",
  color: "#171717",
  fontSize: 12,
  verticalAlign: "top" as const,
};
