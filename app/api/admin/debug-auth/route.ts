import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PANEL_COOKIE_NAME, isValidAdminPanelSessionToken } from "@/lib/admin-auth";

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(ADMIN_PANEL_COOKIE_NAME)?.value;
  if (await isValidAdminPanelSessionToken(token)) return { ok: true as const };
  return { ok: false as const, response: NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 }) };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const { email, password, fix } = await req.json().catch(() => ({})) as {
    email?: string;
    password?: string;
    fix?: boolean;
  };
  if (!email) return NextResponse.json({ error: "email は必須です" }, { status: 400 });

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const out: Record<string, unknown> = { host: new URL(SUPABASE_URL).host };

  try {
    // 1) Does GoTrue's admin API see this user?
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, {
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
    const body = (await r.json().catch(() => null)) as { users?: Array<Record<string, unknown>> } | null;
    const list = body?.users ?? [];
    const found = list.find(u => u.email === email);
    out.adminApi = {
      status: r.status,
      totalUsers: list.length,
      foundByEmail: !!found,
      user: found
        ? {
            id: found.id,
            aud: found.aud,
            role: found.role,
            banned_until: found.banned_until,
            email_confirmed_at: found.email_confirmed_at,
            identities: Array.isArray(found.identities) ? found.identities.length : found.identities,
          }
        : null,
    };

    // 2) Attempt the real login (password grant) if a password was provided
    if (password) {
      const grant = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const gb = (await grant.json().catch(() => null)) as Record<string, unknown> | null;
      out.login = { status: grant.status, ok: grant.status === 200, error: gb?.error_description ?? gb?.msg ?? gb?.error };
    }

    // 3) Repair via GoTrue admin API (only works if the user is visible to GoTrue)
    if (fix && found?.id && password) {
      const put = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${found.id}`, {
        method: "PUT",
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password, email_confirm: true, ban_duration: "none" }),
      });
      const pb = (await put.json().catch(() => null)) as Record<string, unknown> | null;
      out.fix = { status: put.status, ok: put.status === 200, error: pb?.msg ?? pb?.error };

      const retry = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      out.loginAfterFix = { status: retry.status, ok: retry.status === 200 };
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(out);
}
