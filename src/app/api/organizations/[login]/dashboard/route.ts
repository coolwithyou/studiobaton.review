/**
 * 조직 대시보드 통계 API
 * GET /api/organizations/[login]/dashboard?year={year}
 * 
 * 선택 연도의 조직 전체 통계와 기여자 요약 목록을 반환합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

interface OrgStats {
  totalCommits: number;
  totalAdditions: number;
  totalDeletions: number;
  totalPullRequests: number;
  totalContributors: number;
  activeRepos: number;
  totalRepos: number;
}

interface ContributorSummary {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  isOrgMember: boolean;
  stats: {
    commits: number;
    additions: number;
    deletions: number;
    pullRequests: number;
    contributedRepos: number;
  };
  analysisStatus: string | null;
}

interface MonthlyActivity {
  month: number;
  commits: number;
  additions: number;
  deletions: number;
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

    // 연도가 없으면 현재 연도
    const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();

    // 2. 조직 조회
    const org = await db.organization.findUnique({
      where: { login },
      include: {
        members: true, // githubLogin으로 조회
        repos: {
          where: { isArchived: false },
        },
      },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const startDate = new Date(`${year}-01-01T00:00:00Z`);
    const endDate = new Date(`${year}-12-31T23:59:59Z`);

    // 3. 조직 멤버 login 목록 (githubLogin 사용)
    const memberLogins = new Set(org.members.map((m) => m.githubLogin));

    // 4. 전체 커밋 통계
    const commitStats = await db.commit.aggregate({
      where: {
        committedAt: { gte: startDate, lte: endDate },
        repo: { orgId: org.id },
      },
      _count: { id: true },
      _sum: {
        additions: true,
        deletions: true,
      },
    });

    // 5. 기여자별 커밋 통계
    const contributorCommits = await db.commit.groupBy({
      by: ["authorLogin"],
      where: {
        committedAt: { gte: startDate, lte: endDate },
        repo: { orgId: org.id },
      },
      _count: { id: true },
      _sum: {
        additions: true,
        deletions: true,
      },
    });

    // 6. 기여자별 PR 수
    const contributorPRs = await db.pullRequest.groupBy({
      by: ["authorLogin"],
      where: {
        createdAt: { gte: startDate, lte: endDate },
        repo: { orgId: org.id },
      },
      _count: { id: true },
    });
    const prCountMap = new Map(contributorPRs.map((p) => [p.authorLogin, p._count.id]));

    // 7. 기여자별 리포 수
    const contributorRepos = await db.commit.groupBy({
      by: ["authorLogin", "repoId"],
      where: {
        committedAt: { gte: startDate, lte: endDate },
        repo: { orgId: org.id },
      },
    });
    const repoCountMap = new Map<string, number>();
    contributorRepos.forEach((row) => {
      const count = repoCountMap.get(row.authorLogin) || 0;
      repoCountMap.set(row.authorLogin, count + 1);
    });

    // 8. 활성 리포 수 (해당 연도에 커밋이 있는 리포)
    const activeRepoIds = await db.commit.groupBy({
      by: ["repoId"],
      where: {
        committedAt: { gte: startDate, lte: endDate },
        repo: { orgId: org.id },
      },
    });

    // 9. 전체 PR 수
    const totalPRs = await db.pullRequest.count({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        repo: { orgId: org.id },
      },
    });

    // 10. GitHubUser 정보
    const authorLogins = contributorCommits.map((c) => c.authorLogin);
    const githubUsers = await db.gitHubUser.findMany({
      where: { login: { in: authorLogins } },
    });
    const githubUserMap = new Map(githubUsers.map((u) => [u.login, u]));

    // 11. 분석 상태 조회 (조직 멤버만)
    const analysisRuns = await db.analysisRun.findMany({
      where: {
        orgId: org.id,
        year,
        userLogin: { in: Array.from(memberLogins) },
      },
    });
    const analysisMap = new Map(analysisRuns.map((r) => [r.userLogin, r.status]));

    // 12. 월별 활동 통계
    const monthlyStats = await db.$queryRaw<
      { month: number; commits: bigint; additions: bigint; deletions: bigint }[]
    >`
      SELECT 
        EXTRACT(MONTH FROM "committedAt")::int as month,
        COUNT(*)::bigint as commits,
        COALESCE(SUM("additions"), 0)::bigint as additions,
        COALESCE(SUM("deletions"), 0)::bigint as deletions
      FROM "Commit" c
      JOIN "Repository" r ON c."repoId" = r."id"
      WHERE r."orgId" = ${org.id}
        AND c."committedAt" >= ${startDate}
        AND c."committedAt" <= ${endDate}
      GROUP BY EXTRACT(MONTH FROM "committedAt")
      ORDER BY month
    `;

    const monthlyActivity: MonthlyActivity[] = monthlyStats.map((m) => ({
      month: m.month,
      commits: Number(m.commits),
      additions: Number(m.additions),
      deletions: Number(m.deletions),
    }));

    // 13. 조직 통계 구성
    const orgStats: OrgStats = {
      totalCommits: commitStats._count.id,
      totalAdditions: commitStats._sum.additions || 0,
      totalDeletions: commitStats._sum.deletions || 0,
      totalPullRequests: totalPRs,
      totalContributors: contributorCommits.length,
      activeRepos: activeRepoIds.length,
      totalRepos: org.repos.length,
    };

    // 14. 기여자 목록 구성 (조직 멤버 먼저)
    const contributors: ContributorSummary[] = contributorCommits
      .map((c) => {
        const user = githubUserMap.get(c.authorLogin);
        const isOrgMember = memberLogins.has(c.authorLogin);

        return {
          login: c.authorLogin,
          name: user?.name || null,
          avatarUrl: user?.avatarUrl || null,
          isOrgMember,
          stats: {
            commits: c._count.id,
            additions: c._sum.additions || 0,
            deletions: c._sum.deletions || 0,
            pullRequests: prCountMap.get(c.authorLogin) || 0,
            contributedRepos: repoCountMap.get(c.authorLogin) || 0,
          },
          analysisStatus: isOrgMember ? analysisMap.get(c.authorLogin) || null : null,
        };
      })
      .filter((c) => c.isOrgMember) // 조직 멤버만 필터링
      .sort((a, b) => b.stats.commits - a.stats.commits);

    // 15. 수집 완료된 연도 목록
    const syncJobs = await db.commitSyncJob.findMany({
      where: {
        orgId: org.id,
        status: "COMPLETED",
      },
      orderBy: { year: "desc" },
      select: { year: true },
    });
    const availableYears = syncJobs.map((j) => j.year);

    return NextResponse.json({
      orgLogin: login,
      year,
      availableYears,
      stats: orgStats,
      monthlyActivity,
      contributors,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

