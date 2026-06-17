import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    .select("credits, plan")
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({
    credits: shop?.credits ?? 0,
    plan: shop?.plan ?? "free",
  });
}
