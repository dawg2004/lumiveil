import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_PANEL_COOKIE_NAME, isValidAdminPanelSessionToken } from "@/lib/admin-auth";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(ADMIN_PANEL_COOKIE_NAME)?.value;
  if (await isValidAdminPanelSessionToken(token)) {
    return { ok: true as const };
  }
  return {
    ok: false as const,
    response: NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 }),
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { email, password } = await req.json() as {
      email?: string;
      password?: string;
    };

    if (!email) {
      return NextResponse.json({ error: "email は必須です" }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: "パスワードは6文字以上にしてください" }, { status: 400 });
    }

    const { data, error } = await getAdminClient().rpc("admin_update_user_password", {
      p_email: email,
      p_password: password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "パスワードを更新しました。" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "パスワード更新に失敗しました";
    console.error("set-password failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
