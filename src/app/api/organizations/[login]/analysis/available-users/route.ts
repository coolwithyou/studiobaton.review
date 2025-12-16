/**
 * 분석 대상자 후보 조회 API
 * GET /api/organizations/[login]/analysis/available-users?year={year}
 * 
 * 조직 멤버 중 해당 연도에 커밋이 있는 사용자 목록과 통계를 반환합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

interface UserCandidate {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  isOrgMember: boolean;
  stats: {
    totalCommits: number;
    totalAdditions: number;
    totalDeletions: number;
    contributedRepos: number;
    activeDays: number;
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  try {
    // 1. 인증 확인
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { login } = await params;
    const { searchParams } = new URL(request.url);
    const yearStr = searchParams.get("year");

    if (!yearStr) {
      return NextResponse.json(
        { error: "Missing required parameter: year" },
        { status: 400 }
      );
    }

    const year = parseInt(yearStr, 10);
    if (isNaN(year) || year < 2000 || year > new Date().getFullYear()) {
      return NextResponse.json(
        { error: "Invalid year parameter" },
        { status: 400 }
      );
    }

    // 2. 조직 조회
    const org = await db.organization.findUnique({
      where: { login },
      include: {
        members: true, // githubLogin 사용
      },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // 3. 커밋 동기화 완료 여부 확인
    const syncJob = await db.commitSyncJob.findUnique({
      where: {
        orgId_year: {
          orgId: org.id,
          year,
        },
      },
    });

    if (!syncJob || syncJob.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "Commit sync not completed for this year" },
        { status: 400 }
      );
    }

    // 4. 해당 연도 커밋 통계 조회 (조직 멤버 기준)
    const startDate = new Date(`${year}-01-01T00:00:00Z`);
    const endDate = new Date(`${year}-12-31T23:59:59Z`);

    // 조직 멤버 login 목록 (githubLogin 사용)
    const memberLogins = new Set(org.members.map((m) => m.githubLogin));

    // 커밋 작성자별 통계
    const commitStats = await db.commit.groupBy({
      by: ["authorLogin"],
      where: {
        committedAt: {
          gte: startDate,
          lte: endDate,
        },
        repo: { orgId: org.id },
      },
      _count: { id: true },
      _sum: {
        additions: true,
        deletions: true,
      },
    });

    // 작성자별 리포 수
    const repoCountByUser = await db.commit.groupBy({
      by: ["authorLogin", "repoId"],
      where: {
        committedAt: {
          gte: startDate,
          lte: endDate,
        },
        repo: { orgId: org.id },
      },
    });

    const repoCountMap = new Map<string, number>();
    repoCountByUser.forEach((row) => {
      const count = repoCountMap.get(row.authorLogin) || 0;
      repoCountMap.set(row.authorLogin, count + 1);
    });

    // 작성자별 활동 일수
    const activeDaysByUser = await db.$queryRaw<
      { authorLogin: string; activeDays: bigint }[]
    >`
      SELECT "authorLogin", COUNT(DISTINCT DATE("committedAt")) as "activeDays"
      FROM "Commit" c
      JOIN "Repository" r ON c."repoId" = r."id"
      WHERE r."orgId" = ${org.id}
        AND c."committedAt" >= ${startDate}
        AND c."committedAt" <= ${endDate}
      GROUP BY "authorLogin"
    `;

    const activeDaysMap = new Map<string, number>();
    activeDaysByUser.forEach((row) => {
      activeDaysMap.set(row.authorLogin, Number(row.activeDays));
    });

    // 5. GitHubUser 정보 조회
    const authorLogins = commitStats.map((s) => s.authorLogin);
    const githubUsers = await db.gitHubUser.findMany({
      where: { login: { in: authorLogins } },
    });
    const githubUserMap = new Map(githubUsers.map((u) => [u.login, u]));

    // 6. 결과 구성 (조직 멤버 먼저, 그 다음 비멤버)
    const candidates: UserCandidate[] = commitStats
      .map((stat) => {
        const user = githubUserMap.get(stat.authorLogin);
        const isOrgMember = memberLogins.has(stat.authorLogin);

        return {
          login: stat.authorLogin,
          name: user?.name || null,
          avatarUrl: user?.avatarUrl || null,
          isOrgMember,
          stats: {
            totalCommits: stat._count.id,
            totalAdditions: stat._sum.additions || 0,
            totalDeletions: stat._sum.deletions || 0,
            contributedRepos: repoCountMap.get(stat.authorLogin) || 0,
            activeDays: activeDaysMap.get(stat.authorLogin) || 0,
          },
        };
      })
      .sort((a, b) => {
        // 조직 멤버 우선, 그 다음 커밋 수 내림차순
        if (a.isOrgMember !== b.isOrgMember) {
          return a.isOrgMember ? -1 : 1;
        }
        return b.stats.totalCommits - a.stats.totalCommits;
      });

    return NextResponse.json({
      orgLogin: login,
      year,
      totalCandidates: candidates.length,
      orgMemberCount: candidates.filter((c) => c.isOrgMember).length,
      candidates,
    });
  } catch (error) {
    console.error("Available users error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

