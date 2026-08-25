import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { evaluateTabAccess, getRequestIp } from "@/lib/access-control";
import { buildResponse } from "@/lib/chat-response";
import {
  createSession,
  getSession,
  resetSession,
  saveSession,
} from "@/lib/session-store";
import type { ChatRequest, EditSession } from "@/types/chat";

function ensureSession(sessionId?: string): EditSession {
  return getSession(sessionId) ?? createSession();
}

function createBearerSupabaseClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    }
  );
}

async function getAuthenticatedContext(req: NextRequest): Promise<{ user: User | null; client: SupabaseClient }> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (token) {
    const tokenSupabase = createBearerSupabaseClient(token);
    const { data: { user } } = await tokenSupabase.auth.getUser(token);
    if (user) return { user, client: tokenSupabase };
  }

  const cookieSupabase = await createServerSupabaseClient();
  const { data: { user } } = await cookieSupabase.auth.getUser();
  return { user, client: cookieSupabase };
}

async function getShopRecord(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("shops")
    .select("id, credits, allowed_tabs, last_login_ip")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function POST(req: NextRequest) {
  const { user, client } = await getAuthenticatedContext(req);
  if (!user) {
    return NextResponse.json({ error: "ログイン状態が切れています。もう一度ログインしてください。" }, { status: 401 });
  }

  const shop = await getShopRecord(client, user.id);
  if (!shop?.id) {
    return NextResponse.json({ error: "ショップ情報が見つかりません。" }, { status: 400 });
  }

  const access = evaluateTabAccess(shop, "step", getRequestIp(req));
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await req.json()) as ChatRequest;
  let session = ensureSession(body.sessionId);

  switch (body.event) {
    case "chat_opened":
      session.step = "waiting_user_photo";
      saveSession(session);
      return NextResponse.json(buildResponse(session));

    case "user_photo_uploaded":
      if (!body.imageUrl) {
        return NextResponse.json(
          { error: "imageUrl is required" },
          { status: 400 }
        );
      }

      session.sourceImageUrl = body.imageUrl;
      session.step = "photo_uploaded_menu";
      saveSession(session);
      return NextResponse.json(buildResponse(session));

    case "tool_selected":
      session.selectedTool = body.tool;

      if (body.tool === "mosaic") session.step = "mosaic_menu";
      if (body.tool === "background") session.step = "background_menu";
      if (body.tool === "beauty") session.step = "beauty_menu";
      if (body.tool === "brightness") session.step = "brightness_menu";
      if (body.tool === "pose") session.step = "pose_menu";
      if (body.tool === "custom") session.step = "custom_menu";

      saveSession(session);
      return NextResponse.json(buildResponse(session));

    case "background_photo_uploaded":
      if (!body.backgroundImageUrl) {
        return NextResponse.json(
          { error: "backgroundImageUrl is required" },
          { status: 400 }
        );
      }

      session.backgroundImageUrl = body.backgroundImageUrl;
      session.step = "waiting_background_confirm";
      saveSession(session);
      return NextResponse.json(buildResponse(session));

    case "confirm_go":
      session.step = "processing";
      saveSession(session);
      return NextResponse.json(buildResponse(session));

    case "processing_completed":
      if (!body.resultImageUrl) {
        return NextResponse.json(
          { error: "resultImageUrl is required" },
          { status: 400 }
        );
      }

      session.resultImageUrl = body.resultImageUrl;
      session.step = "completed";
      saveSession(session);
      return NextResponse.json(buildResponse(session));

    case "continue_with_result":
      if (session.resultImageUrl) {
        session.sourceImageUrl = session.resultImageUrl;
      }
      session.backgroundImageUrl = undefined;
      session.selectedTool = undefined;
      session.step = "photo_uploaded_menu";
      saveSession(session);
      return NextResponse.json(buildResponse(session));

    case "reset_session":
      session = resetSession(session.sessionId);
      return NextResponse.json(buildResponse(session));

    default:
      return NextResponse.json(
        { error: "unsupported event" },
        { status: 400 }
      );
  }
}
