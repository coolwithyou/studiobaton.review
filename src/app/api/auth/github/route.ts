import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`;
  
  if (!clientId) {
    return NextResponse.json(
      { error: "GitHub OAuth가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  // GitHub OAuth 인증 URL 생성
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "read:user user:email read:org",
    state: crypto.randomUUID(), // CSRF 방지
  });

  const githubAuthUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

  return NextResponse.redirect(githubAuthUrl);
}

