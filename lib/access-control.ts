import type { NextRequest } from "next/server";

export const GATED_TABS = ["generate", "avatar", "mosaic", "step", "edit", "faceswap", "video", "analyze"] as const;
export type GatedTab = (typeof GATED_TABS)[number];

export function getRequestIp(req: NextRequest): string | null {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip");
}

export type AccessGateShop = {
  allowed_tabs?: string[] | null;
  last_login_ip?: string | null;
};

export type AccessCheckResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export function checkIpBinding(
  shop: AccessGateShop | null | undefined,
  requestIp: string | null
): AccessCheckResult {
  if (shop?.last_login_ip && requestIp && shop.last_login_ip !== requestIp) {
    return {
      ok: false,
      status: 401,
      error: "別の端末でログインされたため、セッションが無効になりました。再度ログインしてください。",
    };
  }
  return { ok: true };
}

export function evaluateTabAccess(
  shop: AccessGateShop | null | undefined,
  tab: GatedTab,
  requestIp: string | null
): AccessCheckResult {
  const ipCheck = checkIpBinding(shop, requestIp);
  if (!ipCheck.ok) return ipCheck;

  const allowedTabs = Array.isArray(shop?.allowed_tabs) ? shop.allowed_tabs : [];
  if (!allowedTabs.includes(tab)) {
    return {
      ok: false,
      status: 403,
      error: "このメニューを利用する権限がありません。管理者にお問い合わせください。",
    };
  }

  return { ok: true };
}
