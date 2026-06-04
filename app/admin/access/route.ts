import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_ACCESS_COOKIE, getAdminAccessPassword } from "@/lib/admin-access";

function sanitizeNextPath(nextPath: string) {
  if (!nextPath.startsWith("/admin")) {
    return "/admin";
  }
  return nextPath;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const nextPath = sanitizeNextPath(String(formData.get("next") ?? "/admin"));
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = nextPath;
  redirectUrl.search = "";

  if (password !== getAdminAccessPassword()) {
    redirectUrl.pathname = "/admin";
    redirectUrl.searchParams.set("error", "1");
    if (nextPath !== "/admin") {
      redirectUrl.searchParams.set("next", nextPath);
    }
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  const response = NextResponse.redirect(redirectUrl, { status: 303 });
  response.cookies.set(ADMIN_ACCESS_COOKIE, "granted", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
