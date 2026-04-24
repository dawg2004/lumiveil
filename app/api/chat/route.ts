import { NextResponse } from "next/server";

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

export async function POST(req: Request) {
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
