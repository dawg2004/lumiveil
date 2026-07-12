import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import { ADMIN_PANEL_COOKIE_NAME, isValidAdminPanelSessionToken } from "@/lib/admin-auth";

export const runtime = "nodejs";

// Admin-only maintenance endpoint. Connects to the DB via pg (using the
// Supabase-Vercel connection string) and sets auth.users.instance_id to the
// canonical value so GoTrue can see migrated users. Idempotent.
export async function POST(req: NextRequest) {
  const token = req.cookies.get(ADMIN_PANEL_COOKIE_NAME)?.value;
  if (!(await isValidAdminPanelSessionToken(token))) {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  const candidates = [
    "POSTGRES_URL_NON_POOLING",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "DATABASE_URL",
    "SUPABASE_DB_URL",
  ];
  const picked = candidates.find(name => !!process.env[name]);
  if (!picked) {
    return NextResponse.json({
      error: "DB接続文字列が環境変数に見つかりません（POSTGRES_URL 等）。",
      checked: candidates,
    }, { status: 500 });
  }

  const client = new Client({ connectionString: process.env[picked]!, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();

    const before = await client.query(
      "select count(*)::int as total, count(*) filter (where instance_id = '00000000-0000-0000-0000-000000000000')::int as canonical from auth.users"
    );

    const upd = await client.query(
      `update auth.users
         set instance_id = '00000000-0000-0000-0000-000000000000',
             aud = 'authenticated',
             role = 'authenticated',
             email_confirmed_at = coalesce(email_confirmed_at, now())
       where instance_id is distinct from '00000000-0000-0000-0000-000000000000'
          or aud is distinct from 'authenticated'
          or role is distinct from 'authenticated'
          or email_confirmed_at is null`
    );

    const after = await client.query(
      "select count(*)::int as total, count(*) filter (where instance_id = '00000000-0000-0000-0000-000000000000')::int as canonical from auth.users"
    );

    return NextResponse.json({
      ok: true,
      rowsUpdated: upd.rowCount,
      before: before.rows[0],
      after: after.rows[0],
      message: `${upd.rowCount} 件を修復しました。GoTrue が認識できるユーザー: ${after.rows[0].canonical}/${after.rows[0].total}`,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}
