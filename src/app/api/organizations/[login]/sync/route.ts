import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getGitHubApp } from "@/lib/github";
import { db } from "@/lib/db";

/**
 * POST /api/organizations/[login]/sync
 * 
 * GitHub에 설치된 앱을 기반으로 조직을 수동으로 동기화합니다.
 * 이미 GitHub에 앱이 설치되어 있지만 DB에 등록되지 않은 경우 사용합니다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  const session = await getSession();
  
  if (!session.isLoggedIn || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { login } = await params;

  try {
    const app = getGitHubApp();

    // GitHub에서 이 조직의 installation 정보 조회
    let installation;
    try {
      const { data } = await app.octokit.rest.apps.getOrgInstallation({
        org: login,
      });
      installation = data;
    } catch (error: any) {
      if (error.status === 404) {
        return NextResponse.json(
          { error: "GitHub App이 이 조직에 설치되지 않았습니다." },
          { status: 404 }
        );
      }
      throw error;
    }

    if (!installation.account) {
      return NextResponse.json(
        { error: "Installation 정보를 가져올 수 없습니다." },
        { status: 500 }
      );
    }

    const account = installation.account as {
      id: number;
      login: string;
      avatar_url?: string;
      type: string;
      name?: string;
    };

    // Organization 저장/업데이트
    const org = await db.organization.upsert({
      where: { githubId: account.id },
      create: {
        githubId: account.id,
        login: account.login,
        name: account.name || account.login,
        avatarUrl: account.avatar_url,
        installationId: installation.id,
        settings: {
          criticalPaths: [],
          excludedRepos: [],
          defaultLlmModel: "gpt-4o",
        },
      },
      update: {
        installationId: installation.id,
        name: account.name || account.login,
        avatarUrl: account.avatar_url,
      },
    });

    // 현재 사용자를 멤버로 추가 (이미 있으면 무시)
    await db.organizationMember.upsert({
      where: {
        orgId_userId: {
          orgId: org.id,
          userId: session.user.id,
        },
      },
      create: {
        orgId: org.id,
        userId: session.user.id,
        role: "ADMIN", // 동기화를 실행한 사람은 관리자로
      },
      update: {}, // 이미 있으면 변경 없음
    });

    // 저장소 목록 수집
    try {
      const octokit = await app.getInstallationOctokit(installation.id);
      
      const repos = await octokit.paginate(octokit.rest.repos.listForOrg, {
        org: account.login,
        type: "all",
        per_page: 100,
      });

      // DB에 저장소 저장
      for (const repo of repos) {
        await db.repository.upsert({
          where: { fullName: repo.full_name },
          create: {
            orgId: org.id,
            githubId: repo.id,
            fullName: repo.full_name,
            name: repo.name,
            defaultBranch: repo.default_branch || "main",
            isArchived: repo.archived || false,
            isPrivate: repo.private,
            language: repo.language,
            description: repo.description,
          },
          update: {
            defaultBranch: repo.default_branch || "main",
            isArchived: repo.archived || false,
            isPrivate: repo.private,
            language: repo.language,
            description: repo.description,
          },
        });
      }

      return NextResponse.json({
        success: true,
        organization: {
          login: org.login,
          name: org.name,
          repoCount: repos.length,
        },
      });
    } catch (repoError) {
      console.error("Error fetching repos:", repoError);
      // 저장소 수집 실패해도 조직은 등록됨
      return NextResponse.json({
        success: true,
        organization: {
          login: org.login,
          name: org.name,
        },
        warning: "저장소 목록을 가져오는데 실패했습니다.",
      });
    }
  } catch (error) {
    console.error("Organization sync error:", error);
    return NextResponse.json(
      { error: "조직 동기화에 실패했습니다." },
      { status: 500 }
    );
  }
}

