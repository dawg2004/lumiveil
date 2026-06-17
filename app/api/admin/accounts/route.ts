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

type ShopRecord = {
  id: string;
  user_id: string;
  name: string | null;
  plan: string | null;
  credits: number | null;
  created_at?: string | null;
};

type AdminAuthResult = {
  ok: true;
  email: string;
} | {
  ok: false;
  response: NextResponse;
};

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdmin(req: NextRequest): Promise<AdminAuthResult> {
  // admin panel cookie による認証
  const token = req.cookies.get(ADMIN_PANEL_COOKIE_NAME)?.value;
  if (await isValidAdminPanelSessionToken(token)) {
    return { ok: true, email: "admin" };
  }

  // Supabase セッションによるフォールバック
  const cookieSupabase = await createServerSupabaseClient();
  const { data: { user } } = await cookieSupabase.auth.getUser();
  const email = user?.email?.toLowerCase();

  if (!email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "ログインが必要です" }, { status: 401 }),
    };
  }

  if (!getAdminEmails().includes(email)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 }),
    };
  }

  return { ok: true, email };
}

async function fetchAccounts() {
  const [{ data: usersData, error: usersError }, { data: shops, error: shopsError }] = await Promise.all([
    getAdminClient().auth.admin.listUsers({ page: 1, perPage: 1000 }),
    getAdminClient()
      .from("shops")
      .select("id, user_id, name, plan, credits, created_at")
      .order("created_at", { ascending: false }),
  ]);

  if (usersError) throw new Error(usersError.message);
  if (shopsError) throw new Error(shopsError.message);

  const shopByUserId = new Map((shops ?? []).map(shop => [shop.user_id, shop as ShopRecord]));

  return (usersData.users ?? []).map(authUser => {
    const shop = shopByUserId.get(authUser.id);
    return {
      id: authUser.id,
      email: authUser.email ?? "",
      created_at: authUser.created_at,
      last_sign_in_at: authUser.last_sign_in_at ?? null,
      shop_id: shop?.id ?? null,
      shop_name: shop?.name ?? null,
      plan: shop?.plan ?? "free",
      credits: Number(shop?.credits ?? 0),
    };
  });
}

async function ensureShopForUser(userId: string, email: string) {
  const { data: existing, error: existingError } = await getAdminClient()
    .from("shops")
    .select("id, user_id, name, plan, credits, created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    return existing as ShopRecord;
  }

  const { data: created, error: createError } = await getAdminClient()
    .from("shops")
    .insert({
      id: userId,
      user_id: userId,
      name: email || "default shop",
      plan: "free",
      credits: 0,
    })
    .select("id, user_id, name, plan, credits, created_at")
    .single();

  if (createError) {
    throw new Error(createError.message);
  }

  return created as ShopRecord;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) {
      return auth.response;
    }

    const accounts = await fetchAccounts();

    return NextResponse.json({
      accounts,
      total: accounts.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "アカウント一覧を取得できませんでした";
    console.error("admin accounts fetch failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json();
    const userId = typeof body.userId === "string" ? body.userId : "";
    const email = typeof body.email === "string" ? body.email : "";
    const createShop = Boolean(body.createShop);
    const shopName = typeof body.shopName === "string" ? body.shopName.trim() : "";
    const plan = typeof body.plan === "string" ? body.plan.trim() : "";
    const creditsValue = Number(body.credits);

    if (!userId) {
      return NextResponse.json({ error: "userId が必要です" }, { status: 400 });
    }

    let shop = await ensureShopForUser(userId, email);

    if (createShop && !shop) {
      shop = await ensureShopForUser(userId, email);
    }

    const updates: Record<string, string | number> = {};
    if (shopName) {
      updates.name = shopName;
    }
    if (plan) {
      updates.plan = plan;
    }
    if (!Number.isNaN(creditsValue)) {
      updates.credits = Math.max(0, Math.floor(creditsValue));
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await getAdminClient()
        .from("shops")
        .update(updates)
        .eq("user_id", userId);

      if (updateError) {
        throw new Error(updateError.message);
      }
    }

    const accounts = await fetchAccounts();
    const account = accounts.find(item => item.id === userId) ?? null;

    return NextResponse.json({
      success: true,
      account,
      message: createShop && Object.keys(updates).length === 0
        ? "ショップを作成しました。"
        : "アカウント情報を更新しました。",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "アカウント更新に失敗しました";
    console.error("admin accounts update failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
