import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const FAL_KEY = process.env.FAL_API_KEY!;

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function GET() {
  try {
    const cookieSupabase = await createServerSupabaseClient();
    const { data: { user } } = await cookieSupabase.auth.getUser();
    const email = user?.email?.toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    if (!getAdminEmails().includes(email)) {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    }

    if (!FAL_KEY) {
      return NextResponse.json({ error: "FAL_API_KEY が設定されていません" }, { status: 500 });
    }

    const res = await fetch("https://fal.ai/api/billing/account", {
      headers: { Authorization: `Key ${FAL_KEY}` },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `FAL API error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json() as { balance?: number; currency?: string };
    const balance = typeof data.balance === "number" ? data.balance : null;

    return NextResponse.json({ balance, currency: data.currency ?? "USD" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "FALクレジット取得に失敗しました";
    console.error("fal-credits fetch failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
