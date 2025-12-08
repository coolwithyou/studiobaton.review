import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();

  if (!session.isLoggedIn || !session.user) {
    return NextResponse.json({ isLoggedIn: false }, { status: 401 });
  }

  // accessToken은 제외하고 반환
  const { accessToken, ...safeUser } = session.user;

  return NextResponse.json({
    isLoggedIn: true,
    user: safeUser,
  });
}

