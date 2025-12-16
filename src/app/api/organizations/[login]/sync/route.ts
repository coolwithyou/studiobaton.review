import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getGitHubApp, getInstallationOctokit, getOrganizationMembers } from "@/lib/github";
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

    // GitHub 조직 멤버 동기화
    const octokit = await getInstallationOctokit(installation.id);
    let memberCount = 0;
    
    try {
      const githubMembers = await getOrganizationMembers(octokit, account.login);
      
      for (const member of githubMembers) {
        // GitHubUser 저장/업데이트
        await db.gitHubUser.upsert({
          where: { login: member.login },
          create: {
            login: member.login,
            avatarUrl: member.avatarUrl,
          },
          update: {
            avatarUrl: member.avatarUrl,
          },
        });

        // 현재 사용자인지 확인
        const isCurrentUser = member.login === session.user.login;

        // OrganizationMember 저장/업데이트
        await db.organizationMember.upsert({
          where: {
            orgId_githubLogin: {
              orgId: org.id,
              githubLogin: member.login,
            },
          },
          create: {
            orgId: org.id,
            githubLogin: member.login,
            userId: isCurrentUser ? session.user.id : null,
            role: isCurrentUser ? "ADMIN" : "MEMBER",
          },
          update: {
            userId: isCurrentUser ? session.user.id : undefined, // 기존 userId 유지
          },
        });
        
        memberCount++;
      }
    } catch (memberError) {
      console.error("Error syncing members:", memberError);
      // 멤버 동기화 실패해도 계속 진행
    }

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
          memberCount,
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
          memberCount,
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

