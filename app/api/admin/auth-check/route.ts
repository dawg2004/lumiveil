import { NextRequest, NextResponse } from "next/server";

// Read-only diagnostic. No mutation. Gated by the (already-public) publishable key.
// Reports only coarse auth flags so the migration issue can be pinpointed.
export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const key = u.searchParams.get("key") ?? "";
  const email = u.searchParams.get("email") ?? "";
  const password = u.searchParams.get("password") ?? "";

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!key || key !== ANON) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const out: Record<string, unknown> = { host: new URL(SUPABASE_URL).host };

  try {
    // Does GoTrue's admin API see this email? (Filtered by instance_id internally.)
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, {
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
    const body = (await r.json().catch(() => null)) as { users?: Array<Record<string, unknown>> } | null;
    const list = body?.users ?? [];
    const found = list.find(x => x.email === email);
    out.adminApi = {
      status: r.status,
      totalUsers: list.length,
      foundByEmail: !!found,
      aud: found?.aud,
      role: found?.role,
      banned_until: found?.banned_until ?? null,
      email_confirmed_at: found?.email_confirmed_at ?? null,
      identities: Array.isArray(found?.identities) ? (found!.identities as unknown[]).length : found?.identities ?? null,
    };

    // What does the real login return? (Uses the public anon key, exactly like the login page.)
    if (password) {
      const grant = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const gb = (await grant.json().catch(() => null)) as Record<string, unknown> | null;
      // Do NOT echo tokens; only the coarse result / error message.
      out.login = {
        status: grant.status,
        ok: grant.status === 200,
        error: gb?.error_description ?? gb?.msg ?? gb?.error ?? null,
      };
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(out);
}
