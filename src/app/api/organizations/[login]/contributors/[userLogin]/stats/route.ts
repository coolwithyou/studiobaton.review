/**
 * 기여자 상세 통계 API
 * GET /api/organizations/[login]/contributors/[userLogin]/stats?year={year}
 * 
 * 특정 기여자의 상세 통계를 반환합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

interface ContributorStats {
  totalCommits: number;
  totalAdditions: number;
  totalDeletions: number;
  totalFilesChanged: number;
  totalPullRequests: number;
  mergedPullRequests: number;
  contributedRepos: number;
  activeDays: number;
  averageCommitsPerDay: number;
  largestCommit: {
    sha: string;
    message: string;
    additions: number;
    deletions: number;
    repoFullName: string;
  } | null;
}

interface MonthlyCommits {
  month: number;
  commits: number;
  additions: number;
  deletions: number;
}

interface RepoContribution {
  repoId: string;
  repoFullName: string;
  repoName: string;
  language: string | null;
  commits: number;
  additions: number;
  deletions: number;
  percentage: number;
}

interface DayOfWeekActivity {
  day: number; // 0=Sunday, 6=Saturday
  commits: number;
}

interface HourlyActivity {
  hour: number;
  commits: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ login: string; userLogin: string }> }
) {
  try {
    // 1. 인증 확인
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { login: orgLogin, userLogin } = await params;
    const { searchParams } = new URL(request.url);
    const yearStr = searchParams.get("year");

    const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();

    // 2. 조직 조회
    const org = await db.organization.findUnique({
      where: { login: orgLogin },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const startDate = new Date(`${year}-01-01T00:00:00Z`);
    const endDate = new Date(`${year}-12-31T23:59:59Z`);

    // 3. 기여자 정보
    const githubUser = await db.gitHubUser.findUnique({
      where: { login: userLogin },
    });

    if (!githubUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // 4. 커밋 통계
    const commitStats = await db.commit.aggregate({
      where: {
        authorLogin: userLogin,
        committedAt: { gte: startDate, lte: endDate },
        repo: { orgId: org.id },
      },
      _count: { id: true },
      _sum: {
        additions: true,
        deletions: true,
        filesChanged: true,
      },
    });

    // 5. PR 통계
    const prStats = await db.pullRequest.aggregate({
      where: {
        authorLogin: userLogin,
        createdAt: { gte: startDate, lte: endDate },
        repo: { orgId: org.id },
      },
      _count: { id: true },
    });

    const mergedPRs = await db.pullRequest.count({
      where: {
        authorLogin: userLogin,
        createdAt: { gte: startDate, lte: endDate },
        repo: { orgId: org.id },
        state: "merged",
      },
    });

    // 6. 기여 리포 수
    const repoContribs = await db.commit.groupBy({
      by: ["repoId"],
      where: {
        authorLogin: userLogin,
        committedAt: { gte: startDate, lte: endDate },
        repo: { orgId: org.id },
      },
      _count: { id: true },
      _sum: {
        additions: true,
        deletions: true,
      },
    });

    // 7. 리포 정보 조회
    const repoIds = repoContribs.map((r) => r.repoId);
    const repos = await db.repository.findMany({
      where: { id: { in: repoIds } },
    });
    const repoMap = new Map(repos.map((r) => [r.id, r]));

    const totalCommitsForPercentage = commitStats._count.id;
    const repoContributions: RepoContribution[] = repoContribs
      .map((rc) => {
        const repo = repoMap.get(rc.repoId);
        return {
          repoId: rc.repoId,
          repoFullName: repo?.fullName || "unknown",
          repoName: repo?.name || "unknown",
          language: repo?.language || null,
          commits: rc._count.id,
          additions: rc._sum.additions || 0,
          deletions: rc._sum.deletions || 0,
          percentage: totalCommitsForPercentage > 0
            ? Math.round((rc._count.id / totalCommitsForPercentage) * 100)
            : 0,
        };
      })
      .sort((a, b) => b.commits - a.commits);

    // 8. 활동 일수
    const activeDaysResult = await db.$queryRaw<{ activeDays: bigint }[]>`
      SELECT COUNT(DISTINCT DATE("committedAt"))::bigint as "activeDays"
      FROM "Commit" c
      JOIN "Repository" r ON c."repoId" = r."id"
      WHERE c."authorLogin" = ${userLogin}
        AND r."orgId" = ${org.id}
        AND c."committedAt" >= ${startDate}
        AND c."committedAt" <= ${endDate}
    `;
    const activeDays = Number(activeDaysResult[0]?.activeDays || 0);

    // 9. 월별 커밋 추이
    const monthlyData = await db.$queryRaw<
      { month: number; commits: bigint; additions: bigint; deletions: bigint }[]
    >`
      SELECT 
        EXTRACT(MONTH FROM "committedAt")::int as month,
        COUNT(*)::bigint as commits,
        COALESCE(SUM("additions"), 0)::bigint as additions,
        COALESCE(SUM("deletions"), 0)::bigint as deletions
      FROM "Commit" c
      JOIN "Repository" r ON c."repoId" = r."id"
      WHERE c."authorLogin" = ${userLogin}
        AND r."orgId" = ${org.id}
        AND c."committedAt" >= ${startDate}
        AND c."committedAt" <= ${endDate}
      GROUP BY EXTRACT(MONTH FROM "committedAt")
      ORDER BY month
    `;

    const monthlyCommits: MonthlyCommits[] = monthlyData.map((m) => ({
      month: m.month,
      commits: Number(m.commits),
      additions: Number(m.additions),
      deletions: Number(m.deletions),
    }));

    // 10. 요일별 활동
    const dayOfWeekData = await db.$queryRaw<{ day: number; commits: bigint }[]>`
      SELECT 
        EXTRACT(DOW FROM "committedAt")::int as day,
        COUNT(*)::bigint as commits
      FROM "Commit" c
      JOIN "Repository" r ON c."repoId" = r."id"
      WHERE c."authorLogin" = ${userLogin}
        AND r."orgId" = ${org.id}
        AND c."committedAt" >= ${startDate}
        AND c."committedAt" <= ${endDate}
      GROUP BY EXTRACT(DOW FROM "committedAt")
      ORDER BY day
    `;

    const dayOfWeekActivity: DayOfWeekActivity[] = dayOfWeekData.map((d) => ({
      day: d.day,
      commits: Number(d.commits),
    }));

    // 11. 시간대별 활동
    const hourlyData = await db.$queryRaw<{ hour: number; commits: bigint }[]>`
      SELECT 
        EXTRACT(HOUR FROM "committedAt")::int as hour,
        COUNT(*)::bigint as commits
      FROM "Commit" c
      JOIN "Repository" r ON c."repoId" = r."id"
      WHERE c."authorLogin" = ${userLogin}
        AND r."orgId" = ${org.id}
        AND c."committedAt" >= ${startDate}
        AND c."committedAt" <= ${endDate}
      GROUP BY EXTRACT(HOUR FROM "committedAt")
      ORDER BY hour
    `;

    const hourlyActivity: HourlyActivity[] = hourlyData.map((h) => ({
      hour: h.hour,
      commits: Number(h.commits),
    }));

    // 12. 가장 큰 커밋
    const largestCommit = await db.commit.findFirst({
      where: {
        authorLogin: userLogin,
        committedAt: { gte: startDate, lte: endDate },
        repo: { orgId: org.id },
      },
      orderBy: [{ additions: "desc" }, { deletions: "desc" }],
      include: { repo: true },
    });

    // 13. 수집 완료된 연도 목록
    const syncJobs = await db.commitSyncJob.findMany({
      where: {
        orgId: org.id,
        status: "COMPLETED",
      },
      orderBy: { year: "desc" },
      select: { year: true },
    });
    const availableYears = syncJobs.map((j) => j.year);

    // 14. 통계 구성
    const stats: ContributorStats = {
      totalCommits: commitStats._count.id,
      totalAdditions: commitStats._sum.additions || 0,
      totalDeletions: commitStats._sum.deletions || 0,
      totalFilesChanged: commitStats._sum.filesChanged || 0,
      totalPullRequests: prStats._count.id,
      mergedPullRequests: mergedPRs,
      contributedRepos: repoContribs.length,
      activeDays,
      averageCommitsPerDay: activeDays > 0
        ? Math.round((commitStats._count.id / activeDays) * 10) / 10
        : 0,
      largestCommit: largestCommit
        ? {
            sha: largestCommit.sha,
            message: largestCommit.message.split("\n")[0].substring(0, 100),
            additions: largestCommit.additions,
            deletions: largestCommit.deletions,
            repoFullName: largestCommit.repo.fullName,
          }
        : null,
    };

    return NextResponse.json({
      orgLogin,
      userLogin,
      year,
      availableYears,
      user: {
        login: githubUser.login,
        name: githubUser.name,
        avatarUrl: githubUser.avatarUrl,
        email: githubUser.email,
      },
      stats,
      monthlyCommits,
      repoContributions,
      dayOfWeekActivity,
      hourlyActivity,
    });
  } catch (error) {
    console.error("Contributor stats error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

