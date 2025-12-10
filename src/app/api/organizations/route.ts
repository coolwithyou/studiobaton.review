import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserOrganizations } from "@/lib/github";
import { db } from "@/lib/db";

/**
 * GET /api/organizations
 * 
 * 현재 사용자가 접근 가능한 조직 목록을 반환합니다.
 * - DB에 등록된 조직 (멤버십 기반)
 * - GitHub에서 조회한 조직 (미등록 포함)
 */
export async function GET() {
  const session = await getSession();
  
  if (!session.isLoggedIn || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. DB에서 사용자가 속한 조직 조회
    const dbOrgs = await db.organization.findMany({
      where: {
        members: {
          some: { userId: session.user.id },
        },
      },
      include: {
        _count: {
          select: { repos: true, members: true },
        },
      },
      orderBy: { login: "asc" },
    });

    // 2. GitHub API로 사용자의 조직 목록 조회
    let githubOrgs: { id: number; login: string; avatarUrl: string; description: string | null }[] = [];
    try {
      githubOrgs = await getUserOrganizations(session.user.accessToken);
    } catch (error) {
      console.error("Error fetching GitHub orgs:", error);
    }

    // 3. 병합하여 반환
    const registeredLogins = new Set(dbOrgs.map((org) => org.login));
    
    const organizations = dbOrgs.map((org) => ({
      id: org.id,
      githubId: org.githubId,
      login: org.login,
      name: org.name,
      avatarUrl: org.avatarUrl,
      hasInstallation: !!org.installationId,
      repoCount: org._count.repos,
      memberCount: org._count.members,
      isRegistered: true,
    }));

    const unregisteredOrgs = githubOrgs
      .filter((org) => !registeredLogins.has(org.login))
      .map((org) => ({
        id: null,
        githubId: org.id,
        login: org.login,
        name: org.login,
        avatarUrl: org.avatarUrl,
        hasInstallation: false,
        repoCount: 0,
        memberCount: 0,
        isRegistered: false,
      }));

    return NextResponse.json({
      organizations: [...organizations, ...unregisteredOrgs],
    });
  } catch (error) {
    console.error("Error fetching organizations:", error);
    return NextResponse.json(
      { error: "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}

