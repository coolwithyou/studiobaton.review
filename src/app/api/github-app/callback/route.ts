import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getGitHubApp } from "@/lib/github";
import { db } from "@/lib/db";

/**
 * GitHub App Installation Callback
 * 
 * GitHub App 설치 완료 후 이 URL로 리다이렉트됩니다.
 * - installation_id: GitHub App Installation ID
 * - setup_action: install | update | delete
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const installationId = searchParams.get("installation_id");
  const setupAction = searchParams.get("setup_action"); // install, update, delete

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3020";

  // 세션 확인
  const session = await getSession();
  if (!session.isLoggedIn || !session.user) {
    // 로그인 안 된 상태에서 설치 시 로그인 페이지로 리다이렉트
    return NextResponse.redirect(
      `${baseUrl}/login?error=auth_required&return_to=/organizations`
    );
  }

  if (!installationId) {
    return NextResponse.redirect(
      `${baseUrl}/organizations?error=missing_installation_id`
    );
  }

  try {
    const app = getGitHubApp();

    // 삭제 요청인 경우
    if (setupAction === "delete") {
      // 해당 installation과 연결된 조직 찾아서 installationId 제거
      await db.organization.updateMany({
        where: { installationId: parseInt(installationId) },
        data: { installationId: null },
      });

      return NextResponse.redirect(
        `${baseUrl}/organizations?message=app_uninstalled`
      );
    }

    // Installation 정보 조회
    const { data: installation } = await app.octokit.rest.apps.getInstallation({
      installation_id: parseInt(installationId),
    });

    if (!installation.account) {
      return NextResponse.redirect(
        `${baseUrl}/organizations?error=invalid_installation`
      );
    }

    const account = installation.account as {
      id: number;
      login: string;
      avatar_url?: string;
      type: string;
      name?: string;
    };

    // Organization 또는 User 계정인지 확인
    const isOrg = account.type === "Organization";

    // Organization 저장/업데이트
    const org = await db.organization.upsert({
      where: { githubId: account.id },
      create: {
        githubId: account.id,
        login: account.login,
        name: account.name || account.login,
        avatarUrl: account.avatar_url,
        installationId: parseInt(installationId),
        settings: {
          criticalPaths: [],
          excludedRepos: [],
          defaultLlmModel: "gpt-4o",
        },
      },
      update: {
        installationId: parseInt(installationId),
        name: account.name || account.login,
        avatarUrl: account.avatar_url,
      },
    });

    // 현재 사용자가 이 조직의 멤버인지 확인하고, 없으면 추가
    const existingMembership = await db.organizationMember.findUnique({
      where: {
        orgId_userId: {
          orgId: org.id,
          userId: session.user.id,
        },
      },
    });

    if (!existingMembership) {
      // 처음 설치한 사람은 ADMIN으로
      await db.organizationMember.create({
        data: {
          orgId: org.id,
          userId: session.user.id,
          role: "ADMIN",
        },
      });
    }

    // 저장소 목록 초기 수집 (백그라운드로 처리할 수도 있음)
    // 일단은 간단히 여기서 수집
    try {
      const octokit = await app.getInstallationOctokit(parseInt(installationId));
      
      // 저장소 목록 조회
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
    } catch (repoError) {
      console.error("Error fetching repos:", repoError);
      // 저장소 수집 실패해도 계속 진행 (나중에 수집 가능)
    }

    // 성공 메시지와 함께 조직 페이지로 리다이렉트
    const message = setupAction === "update" ? "app_updated" : "app_installed";
    return NextResponse.redirect(
      `${baseUrl}/organizations?message=${message}&org=${account.login}`
    );
  } catch (error) {
    console.error("GitHub App callback error:", error);
    return NextResponse.redirect(
      `${baseUrl}/organizations?error=installation_failed`
    );
  }
}

