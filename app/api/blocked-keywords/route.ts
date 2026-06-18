import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  try {
    const { data, error } = await getAdminClient()
      .from("blocked_keywords")
      .select("keyword, reason")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json({ keywords: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "取得失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
