export const ADMIN_PANEL_COOKIE_NAME = "lumiveil_admin_session";

export function getAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createAdminPanelSessionToken() {
  const password = process.env.ADMIN_PANEL_PASSWORD ?? "";
  if (!password) {
    return "";
  }

  const data = new TextEncoder().encode(`lumiveil-admin:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

export async function isValidAdminPanelSessionToken(value: string | undefined) {
  if (!value) {
    return false;
  }

  const expected = await createAdminPanelSessionToken();
  return Boolean(expected) && value === expected;
}
