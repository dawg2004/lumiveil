import { randomUUID } from "crypto";

import type { EditSession } from "@/types/chat";

const store = new Map<string, EditSession>();

export function createSession(): EditSession {
  const session: EditSession = {
    sessionId: randomUUID(),
    step: "waiting_user_photo",
    options: {},
  };

  store.set(session.sessionId, session);
  return session;
}

export function getSession(sessionId?: string): EditSession | null {
  if (!sessionId) {
    return null;
  }

  return store.get(sessionId) ?? null;
}

export function saveSession(session: EditSession): EditSession {
  store.set(session.sessionId, session);
  return session;
}

export function resetSession(sessionId: string): EditSession {
  const session: EditSession = {
    sessionId,
    step: "waiting_user_photo",
    options: {},
  };

  store.set(sessionId, session);
  return session;
}
