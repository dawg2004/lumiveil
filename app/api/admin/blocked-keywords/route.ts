import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ADMIN_PANEL_COOKIE_NAME, isValidAdminPanelSessionToken } from "@/lib/admin-auth";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAdmin(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_PANEL_COOKIE_NAME)?.value;
  if (await isValidAdminPanelSessionToken(token)) return true;

  const cookieSupabase = await createServerSupabaseClient();
  const { data: { user } } = await cookieSupabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email) return false;

  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  return adminEmails.includes(email);
}

export async function GET() {
  try {
    const { data, error } = await getAdminClient()
      .from("blocked_keywords")
      .select("id, keyword, reason, created_at")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json({ keywords: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "取得失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const keyword = typeof body.keyword === "string" ? body.keyword.trim().toLowerCase() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!keyword) return NextResponse.json({ error: "keyword は必須です" }, { status: 400 });

    const { data, error } = await getAdminClient()
      .from("blocked_keywords")
      .insert({ keyword, reason: reason || null })
      .select("id, keyword, reason, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "すでに登録済みのキーワードです" }, { status: 409 });
      }
      throw new Error(error.message);
    }

    return NextResponse.json({ keyword: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "追加失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });

    const { error } = await getAdminClient()
      .from("blocked_keywords")
      .delete()
      .eq("id", id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "削除失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
