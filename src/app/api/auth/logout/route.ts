import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET(request: Request) {
  const session = await getSession();
  
  // 세션 초기화
  session.user = undefined;
  session.isLoggedIn = false;
  await session.save();

  // 홈페이지로 리다이렉트
  return NextResponse.redirect(new URL("/", request.url));
}

