import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PANEL_COOKIE_NAME, isValidAdminPanelSessionToken } from "@/lib/admin-auth";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    const token = request.cookies.get(ADMIN_PANEL_COOKIE_NAME)?.value;
    const isValid = await isValidAdminPanelSessionToken(token);

    if (!isValid) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin-login";
      url.search = "";
      const nextValue = `${pathname}${search}`;
      if (nextValue && nextValue !== "/") {
        url.searchParams.set("next", nextValue);
      }
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
