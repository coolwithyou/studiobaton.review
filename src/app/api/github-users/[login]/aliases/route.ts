import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * PATCH /api/github-users/[login]/aliases
 * 
 * GitHub 사용자의 이메일 alias를 업데이트합니다.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { login } = await params;
    const body = await request.json();
    const { aliases } = body;

    if (!Array.isArray(aliases)) {
      return NextResponse.json(
        { error: "Invalid aliases format" },
        { status: 400 }
      );
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validAliases = aliases.filter(
      (alias: string) => typeof alias === "string" && emailRegex.test(alias)
    );

    // GitHubUser 업데이트 또는 생성
    const user = await db.gitHubUser.upsert({
      where: { login },
      create: {
        login,
        aliases: validAliases,
      },
      update: {
        aliases: validAliases,
      },
    });

    return NextResponse.json({
      success: true,
      aliases: user.aliases,
    });
  } catch (error) {
    console.error("Update aliases error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/github-users/[login]/aliases
 * 
 * GitHub 사용자의 이메일 alias 목록을 조회합니다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { login } = await params;

    const user = await db.gitHubUser.findUnique({
      where: { login },
      select: { aliases: true },
    });

    return NextResponse.json({
      aliases: user?.aliases || [],
    });
  } catch (error) {
    console.error("Get aliases error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

