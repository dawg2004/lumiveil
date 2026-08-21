import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkIpBinding, getRequestIp } from "@/lib/access-control";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user }, error: authError } = await getAdminClient().auth.getUser(token!);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: shop } = await getAdminClient()
    .from("shops")
    .select("credits, plan, allowed_tabs, last_login_ip")
    .eq("user_id", user.id)
    .single();

  const ipCheck = checkIpBinding(shop, getRequestIp(req));
  if (!ipCheck.ok) {
    return NextResponse.json({ error: ipCheck.error }, { status: ipCheck.status });
  }

  return NextResponse.json({
    credits: shop?.credits ?? 0,
    plan: shop?.plan ?? "free",
    allowedTabs: Array.isArray(shop?.allowed_tabs) ? shop.allowed_tabs : [],
  });
}
