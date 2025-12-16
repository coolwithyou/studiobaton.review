import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getInstallationOctokit } from "@/lib/github";
import { db } from "@/lib/db";

/**
 * GET /api/organizations/[login]
 * 
 * 특정 조직의 상세 정보를 반환합니다.
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
    // 조직 조회 (멤버십 확인)
    const org = await db.organization.findUnique({
      where: { login },
      include: {
        members: {
          where: { userId: session.user.id },
        },
        _count: {
          select: { repos: true, members: true, syncJobs: true },
        },
        repos: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            fullName: true,
            isArchived: true,
            isPrivate: true,
            language: true,
            description: true,
          },
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

    const userRole = org.members[0].role;

    return NextResponse.json({
      id: org.id,
      githubId: org.githubId,
      login: org.login,
      name: org.name,
      avatarUrl: org.avatarUrl,
      hasInstallation: !!org.installationId,
      settings: org.settings,
      userRole,
      stats: {
        repoCount: org._count.repos,
        memberCount: org._count.members,
        syncJobCount: org._count.syncJobs,
      },
      repos: org.repos,
    });
  } catch (error) {
    console.error("Error fetching organization:", error);
    return NextResponse.json(
      { error: "Failed to fetch organization" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/organizations/[login]/settings
 * 
 * 조직 설정을 업데이트합니다.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  const session = await getSession();
  
  if (!session.isLoggedIn || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { login } = await params;

  try {
    // 조직 조회 및 권한 확인
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

    // ADMIN만 설정 변경 가능
    if (org.members.length === 0 || org.members[0].role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { settings } = body;

    // 설정 업데이트
    const updatedOrg = await db.organization.update({
      where: { login },
      data: {
        settings: {
          ...(org.settings as object || {}),
          ...settings,
        },
      },
    });

    return NextResponse.json({
      success: true,
      settings: updatedOrg.settings,
    });
  } catch (error) {
    console.error("Error updating organization settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}

