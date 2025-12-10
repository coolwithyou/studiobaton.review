import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getInstallationOctokit, getOrganizationMembers } from "@/lib/github";
import { db } from "@/lib/db";

/**
 * GET /api/organizations/[login]/members
 * 
 * 조직의 멤버 목록을 반환합니다.
 * GitHub API에서 조회하고, DB에 저장된 GitHubUser 정보와 매핑합니다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  const session = await getSession();
  
  if (!session.isLoggedIn || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { login } = await params;

  try {
    // 조직 조회 (installationId 확인)
    const org = await db.organization.findUnique({
      where: { login },
      include: {
        members: {
          where: { userId: session.user.id },
        },
      },
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // 멤버십 확인
    if (org.members.length === 0) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (!org.installationId) {
      return NextResponse.json(
        { error: "GitHub App not installed" },
        { status: 400 }
      );
    }

    // GitHub API로 멤버 조회
    const octokit = await getInstallationOctokit(org.installationId);
    const githubMembers = await getOrganizationMembers(octokit, login);

    // DB의 GitHubUser 정보와 매핑
    const memberLogins = githubMembers.map((m) => m.login);
    const dbUsers = await db.gitHubUser.findMany({
      where: { login: { in: memberLogins } },
    });

    const dbUserMap = new Map(dbUsers.map((u) => [u.login, u]));

    const members = githubMembers.map((member) => {
      const dbUser = dbUserMap.get(member.login);
      return {
        login: member.login,
        avatarUrl: member.avatarUrl,
        name: dbUser?.name || null,
        email: dbUser?.email || null,
        aliases: dbUser?.aliases || [],
        hasData: !!dbUser,
      };
    });

    return NextResponse.json({ members });
  } catch (error) {
    console.error("Error fetching organization members:", error);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}

