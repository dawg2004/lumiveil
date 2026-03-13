import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token!);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const castName = formData.get("castName") as string;
    const files = formData.getAll("photos") as File[];

    if (!castName || files.length === 0) {
      return NextResponse.json({ error: "キャスト名と写真は必須です" }, { status: 400 });
    }

    const { data: shopData } = await supabase
      .from("shops").select("id, credits").eq("user_id", user.id).single();

    if (!shopData || shopData.credits < 50) {
      return NextResponse.json({ error: "クレジットが不足しています（アバター作成：50クレジット）" }, { status: 402 });
    }

    const uploadedUrls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const buffer = await file.arrayBuffer();
      const fileName = `avatars/${user.id}/temp/${Date.now()}_${i}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("cast-photos").upload(fileName, buffer, { contentType: file.type });
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from("cast-photos").getPublicUrl(fileName);
        uploadedUrls.push(publicUrl);
      }
    }

    const { data: avatarData, error: insertError } = await supabase
      .from("avatars").insert({
        shop_id: shopData.id, name: castName,
        face_image_url: uploadedUrls[0], all_photo_urls: uploadedUrls, status: "ready",
      }).select().single();

    if (insertError) throw new Error(insertError.message);

    await supabase.from("shops").update({ credits: shopData.credits - 50 }).eq("user_id", user.id);

    return NextResponse.json({
      success: true,
      avatar: { id: avatarData.id, name: avatarData.name, date: new Date().toLocaleDateString("ja") },
      creditsRemaining: shopData.credits - 50,
    });
  } catch (error) {
    console.error("Avatar creation error:", error);
    return NextResponse.json({ error: "アバター作成中にエラーが発生しました" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await supabase.auth.getUser(token!);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: shopData } = await supabase
    .from("shops").select("id").eq("user_id", user.id).single();

  const { data: avatars } = await supabase
    .from("avatars").select("id, name, face_image_url, created_at, status")
    .eq("shop_id", shopData?.id).order("created_at", { ascending: false });

  return NextResponse.json({ avatars: avatars || [] });
}
