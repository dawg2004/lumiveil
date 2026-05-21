import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getVideoAccessPassword, VIDEO_ACCESS_COOKIE } from "@/lib/video-access";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const url = request.nextUrl.clone();
  url.pathname = "/videos";

  if (password !== getVideoAccessPassword()) {
    url.searchParams.set("error", "1");
    return NextResponse.redirect(url, { status: 303 });
  }

  const response = NextResponse.redirect(url, { status: 303 });
  response.cookies.set(VIDEO_ACCESS_COOKIE, "granted", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/videos",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
