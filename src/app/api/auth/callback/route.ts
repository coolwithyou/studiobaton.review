import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // 에러 처리
  if (error) {
    console.error("GitHub OAuth error:", error);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=no_code", request.url)
    );
  }

  try {
    // 1. GitHub에서 액세스 토큰 획득
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      }
    );

    const tokenData: GitHubTokenResponse = await tokenResponse.json();

    if (tokenData.error) {
      console.error("Token exchange error:", tokenData.error_description);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(tokenData.error)}`, request.url)
      );
    }

    const accessToken = tokenData.access_token;

    // 2. GitHub 사용자 정보 조회
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!userResponse.ok) {
      throw new Error("Failed to fetch user info");
    }

    const githubUser: GitHubUser = await userResponse.json();

    // 3. 이메일 조회 (private email 포함)
    let email = githubUser.email;
    if (!email) {
      const emailResponse = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (emailResponse.ok) {
        const emails = await emailResponse.json();
        const primaryEmail = emails.find(
          (e: { primary: boolean; verified: boolean }) => e.primary && e.verified
        );
        email = primaryEmail?.email || emails[0]?.email || null;
      }
    }

    // 4. DB에 사용자 저장/업데이트
    const user = await db.user.upsert({
      where: { githubId: githubUser.id },
      update: {
        login: githubUser.login,
        name: githubUser.name,
        email,
        avatarUrl: githubUser.avatar_url,
        accessToken, // TODO: 암호화 필요
      },
      create: {
        githubId: githubUser.id,
        login: githubUser.login,
        name: githubUser.name,
        email,
        avatarUrl: githubUser.avatar_url,
        accessToken, // TODO: 암호화 필요
      },
    });

    // 5. 세션 생성
    const session = await getSession();
    session.user = {
      id: user.id,
      githubId: Number(user.githubId),
      login: user.login,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      accessToken,
    };
    session.isLoggedIn = true;
    await session.save();

    // 6. 대시보드로 리다이렉트
    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/login?error=callback_failed", request.url)
    );
  }
}

