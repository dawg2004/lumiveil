import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getRequestIp } from "@/lib/access-control";

function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getUser(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (token) {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user } } = await sb.auth.getUser(token);
    if (user) return user;
  }
  const sb = await createServerSupabaseClient();
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

// ログイン直後にクライアントから呼ばれ、その端末のIPを「最終ログイン端末」として記録する。
// 以降、別のIPからのAPIアクセスは evaluateTabAccess() で自動的に弾かれる（パスワード使い回し対策）。
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ip = getRequestIp(req);
    const { error } = await createAdminSupabaseClient()
      .from("shops")
      .update({ last_login_ip: ip, last_login_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "セッション更新に失敗しました";
    console.error("session touch failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
