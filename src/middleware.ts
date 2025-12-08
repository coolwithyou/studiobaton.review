import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";

// 인증이 필요한 경로
const protectedPaths = [
  "/dashboard",
  "/analysis",
  "/organizations",
  "/reports",
  "/settings",
  "/profile",
];

// 로그인 사용자가 접근하면 안 되는 경로
const authPaths = ["/login"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API 라우트는 각 핸들러에서 처리
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // 세션 확인
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions
  );

  const isLoggedIn = session.isLoggedIn && !!session.user;

  // 보호된 경로 접근 시 로그인 필요
  if (protectedPaths.some((path) => pathname.startsWith(path))) {
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // 이미 로그인된 사용자가 로그인 페이지 접근 시
  if (authPaths.includes(pathname)) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*|public).*)",
  ],
};

