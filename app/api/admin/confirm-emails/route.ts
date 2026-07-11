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
    // Try listUsers first; fall back to shops table for user IDs
    let userIds: string[] = [];

    const { data: usersData, error: usersError } = await getAdminClient().auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (!usersError && (usersData?.users?.length ?? 0) > 0) {
      userIds = usersData.users.filter(u => !u.email_confirmed_at).map(u => u.id);
    } else {
      // Fallback: get user IDs from shops table
      const { data: shops, error: shopsError } = await getAdminClient()
        .from("shops")
        .select("user_id");
      if (shopsError) throw new Error(shopsError.message);
      userIds = (shops ?? []).map(s => s.user_id).filter(Boolean);
    }

    if (userIds.length === 0) {
      return NextResponse.json({ success: true, confirmed: 0, message: "確認が必要なユーザーはいません。" });
    }

    const results = await Promise.allSettled(
      userIds.map(id =>
        getAdminClient().auth.admin.updateUserById(id, { email_confirm: true })
      )
    );

    const succeeded = results.filter(r => r.status === "fulfilled" && !((r as PromiseFulfilledResult<{ error: unknown }>).value.error)).length;
    const errors = results
      .filter(r => r.status === "rejected" || ((r as PromiseFulfilledResult<{ error: { message?: string } | null }>).value?.error))
      .map(r =>
        r.status === "rejected"
          ? String((r as PromiseRejectedResult).reason)
          : String(((r as PromiseFulfilledResult<{ error: { message?: string } | null }>).value?.error)?.message ?? "unknown")
      );

    return NextResponse.json({
      success: true,
      confirmed: succeeded,
      total: userIds.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `${succeeded}/${userIds.length} 件のユーザーのメールアドレスを確認済みにしました。`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "メール確認に失敗しました";
    console.error("confirm-emails failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
