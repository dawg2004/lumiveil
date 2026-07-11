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

async function findUserIdByEmail(email: string): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  try {
    const res = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}&per_page=10`,
      { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } }
    );
    if (!res.ok) return null;
    const data = await res.json() as { users?: Array<{ id: string; email: string }> };
    return data.users?.find(u => u.email === email)?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { userId, email, password } = await req.json() as {
      userId?: string;
      email?: string;
      password?: string;
    };

    if (!password || password.length < 6) {
      return NextResponse.json({ error: "パスワードは6文字以上にしてください" }, { status: 400 });
    }

    const adminClient = getAdminClient();

    // Try by userId first
    if (userId) {
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
      if (!error) {
        return NextResponse.json({ success: true, message: "パスワードを更新しました。" });
      }
      if (error.message !== "User not found") {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // Fallback: look up by email
    if (email) {
      const realId = await findUserIdByEmail(email);
      if (realId) {
        const { error } = await adminClient.auth.admin.updateUserById(realId, { password });
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, message: "パスワードを更新しました。" });
      }
    }

    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "パスワード更新に失敗しました";
    console.error("set-password failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
