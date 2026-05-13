import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  ADMIN_PANEL_COOKIE_NAME,
  createAdminPanelSessionToken,
  getAdminEmails,
  isValidAdminPanelSessionToken,
} from "@/lib/admin-auth";

function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}

async function getCurrentUserEmail() {
  const cookieSupabase = await createServerSupabaseClient();
  const { data: { user } } = await cookieSupabase.auth.getUser();
  return user?.email?.toLowerCase() ?? "";
}

export async function GET(req: NextRequest) {
  try {
    const email = await getCurrentUserEmail();
    const token = req.cookies.get(ADMIN_PANEL_COOKIE_NAME)?.value;
    const authenticated = Boolean(email) && getAdminEmails().includes(email) && await isValidAdminPanelSessionToken(token);

    return NextResponse.json({ authenticated, email });
  } catch (error) {
    const message = error instanceof Error ? error.message : "管理者状態を確認できませんでした";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const email = await getCurrentUserEmail();
    if (!email) {
      return NextResponse.json({ error: "先に通常ログインしてください。" }, { status: 401 });
    }

    if (!getAdminEmails().includes(email)) {
      return NextResponse.json({ error: "管理者として許可されていないメールアドレスです。" }, { status: 403 });
    }

    const body = await req.json();
    const password = typeof body.password === "string" ? body.password : "";
    const adminPassword = process.env.ADMIN_PANEL_PASSWORD ?? "";

    if (!adminPassword) {
      return NextResponse.json({ error: "ADMIN_PANEL_PASSWORD が未設定です。" }, { status: 500 });
    }

    if (!password || password !== adminPassword) {
      return NextResponse.json({ error: "管理画面パスワードが違います。" }, { status: 401 });
    }

    const token = await createAdminPanelSessionToken();
    const response = NextResponse.json({ success: true });
    response.cookies.set(ADMIN_PANEL_COOKIE_NAME, token, getCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "管理者ログインに失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_PANEL_COOKIE_NAME, "", {
    ...getCookieOptions(),
    maxAge: 0,
  });
  return response;
}
