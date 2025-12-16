import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { YearlyReportView } from "@/components/report/yearly-report-view";
import { calculateDeveloperMetrics, calculateMonthlyActivity, calculateTimeHeatmap, calculateWorkTypeDistribution } from "@/lib/analysis/metrics";
import type { 
  DeveloperMetrics, 
  Stage2Result, 
  Stage3Result, 
  Stage4Result,
  MonthlyActivityData,
  WorkTypeDistribution,
  RepoContribution,
  TimeHeatmapData,
} from "@/types";

interface PageProps {
  params: Promise<{
    login: string;
    runId: string;
    userLogin: string;
  }>;
}

export default async function YearlyReportPage({ params }: PageProps) {
  const { login: orgLogin, runId, userLogin } = await params;

  // 분석 Run 조회
  const analysisRun = await db.analysisRun.findUnique({
    where: { id: runId },
    include: {
      org: true,
    },
  });

  if (!analysisRun || analysisRun.org.login !== orgLogin) {
    notFound();
  }

  // YearlyReport 조회
  const report = await db.yearlyReport.findUnique({
    where: {
      analysisRunId_userLogin: {
        analysisRunId: runId,
        userLogin,
      },
    },
    include: {
      aiReviews: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  // 사용자 정보 조회
  const githubUser = await db.gitHubUser.findUnique({
    where: { login: userLogin },
  });

  // 메트릭 계산
  const metrics = (report?.metrics as unknown as DeveloperMetrics) || 
    await calculateDeveloperMetrics(analysisRun.orgId, userLogin, analysisRun.year);

  // AI 분석 결과 추출
  const stage2Review = report?.aiReviews.find(r => r.stage === 2);
  const stage3Review = report?.aiReviews.find(r => r.stage === 3);
  const stage4Review = report?.aiReviews.find(r => r.stage === 4);

  const stage2Result = stage2Review?.result as unknown as Stage2Result | null;
  const stage3Result = stage3Review?.result as unknown as Stage3Result | null;
  const stage4Result = (report?.aiInsights as unknown as Stage4Result) || 
    (stage4Review?.result as unknown as Stage4Result | null);

  // 차트 데이터 조회
  const monthlyActivity = await calculateMonthlyActivity(
    analysisRun.orgId, 
    userLogin, 
    analysisRun.year
  );

  const timeHeatmap = await calculateTimeHeatmap(
    analysisRun.orgId,
    userLogin,
    analysisRun.year
  );

  const workTypeData = await calculateWorkTypeDistribution(
    analysisRun.orgId,
    userLogin,
    analysisRun.year
  );

  const workTypeDistribution: WorkTypeDistribution[] = workTypeData.map(d => ({
    type: d.type as any,
    count: d.count,
    percentage: d.percentage,
  }));

  // 저장소별 기여 계산
  const repoContributions = await getRepoContributions(
    analysisRun.orgId,
    userLogin,
    analysisRun.year
  );

  // 커밋 크기 데이터
  const commits = await getCommitSizes(
    analysisRun.orgId,
    userLogin,
    analysisRun.year
  );

  return (
    <div className="container max-w-7xl py-6">
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link href={`/organizations/${orgLogin}/analysis/${runId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          분석 결과로 돌아가기
        </Link>
      </Button>

      <YearlyReportView
        userLogin={userLogin}
        userName={githubUser?.name}
        userAvatarUrl={githubUser?.avatarUrl}
        year={analysisRun.year}
        metrics={metrics}
        stage2Result={stage2Result}
        stage3Result={stage3Result}
        stage4Result={stage4Result}
        monthlyActivity={monthlyActivity}
        workTypeDistribution={workTypeDistribution}
        repoContributions={repoContributions}
        timeHeatmap={timeHeatmap}
        commits={commits}
        managerComment={report?.managerComment}
        confirmedAt={report?.confirmedAt}
      />
    </div>
  );
}

// ============================================
// 데이터 조회 헬퍼
// ============================================

async function getRepoContributions(
  orgId: string,
  userLogin: string,
  year: number
): Promise<RepoContribution[]> {
  const startDate = new Date(`${year}-01-01T00:00:00Z`);
  const endDate = new Date(`${year}-12-31T23:59:59Z`);

  const commits = await db.commit.groupBy({
    by: ['repoId'],
    where: {
      authorLogin: userLogin,
      committedAt: {
        gte: startDate,
        lte: endDate,
      },
      repo: { orgId },
    },
    _count: { id: true },
    _sum: {
      additions: true,
      deletions: true,
    },
  });

  const totalCommits = commits.reduce((sum, c) => sum + c._count.id, 0);

  // 저장소 이름 조회
  const repoIds = commits.map(c => c.repoId);
  const repos = await db.repository.findMany({
    where: { id: { in: repoIds } },
    select: { id: true, fullName: true },
  });

  const repoMap = new Map(repos.map(r => [r.id, r.fullName]));

  return commits
    .map(c => ({
      repo: repoMap.get(c.repoId) || c.repoId,
      commits: c._count.id,
      linesAdded: c._sum.additions || 0,
      linesDeleted: c._sum.deletions || 0,
      percentage: totalCommits > 0 
        ? Math.round((c._count.id / totalCommits) * 100) 
        : 0,
    }))
    .sort((a, b) => b.commits - a.commits);
}

async function getCommitSizes(
  orgId: string,
  userLogin: string,
  year: number
): Promise<Array<{ additions: number; deletions: number }>> {
  const startDate = new Date(`${year}-01-01T00:00:00Z`);
  const endDate = new Date(`${year}-12-31T23:59:59Z`);

  const commits = await db.commit.findMany({
    where: {
      authorLogin: userLogin,
      committedAt: {
        gte: startDate,
        lte: endDate,
      },
      repo: { orgId },
    },
    select: {
      additions: true,
      deletions: true,
    },
  });

  return commits;
}

