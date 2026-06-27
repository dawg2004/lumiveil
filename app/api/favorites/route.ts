import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const MAX_FAVORITES = 30;

function createBearerSupabaseClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

async function getAuthenticatedClient(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (token) {
    const sb = createBearerSupabaseClient(token);
    const { data: { user } } = await sb.auth.getUser(token);
    if (user) return { user, client: sb };
  }
  const sb = await createServerSupabaseClient();
  const { data: { user } } = await sb.auth.getUser();
  return { user, client: sb };
}

export async function GET(req: NextRequest) {
  try {
    const { user, client } = await getAuthenticatedClient(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await client
      .from("prompt_favorites")
      .select("id, prompt, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(MAX_FAVORITES);

    if (error) throw new Error(error.message);
    return NextResponse.json({ favorites: (data ?? []).map(r => ({ id: r.id, prompt: r.prompt })) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, client } = await getAuthenticatedClient(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { prompt } = await req.json();
    const trimmed = typeof prompt === "string" ? prompt.trim() : "";
    if (!trimmed) return NextResponse.json({ error: "prompt が必要です" }, { status: 400 });

    // 重複チェック
    const { data: existing } = await client
      .from("prompt_favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("prompt", trimmed)
      .maybeSingle();

    if (existing) return NextResponse.json({ id: existing.id, duplicate: true });

    // 上限チェック（古いものを削除）
    const { count } = await client
      .from("prompt_favorites")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if ((count ?? 0) >= MAX_FAVORITES) {
      const { data: oldest } = await client
        .from("prompt_favorites")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);
      if (oldest?.[0]) {
        await client.from("prompt_favorites").delete().eq("id", oldest[0].id);
      }
    }

    const { data, error } = await client
      .from("prompt_favorites")
      .insert({ user_id: user.id, prompt: trimmed })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user, client } = await getAuthenticatedClient(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await req.json();
    if (!id || typeof id !== "string") return NextResponse.json({ error: "id が必要です" }, { status: 400 });

    const { error } = await client
      .from("prompt_favorites")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
