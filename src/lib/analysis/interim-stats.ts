/**
 * Interim Report Statistics Calculation
 * 
 * AI 리뷰 전 정량적 중간 리포트를 위한 통계 계산 로직
 */

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface InterimReportData {
  runId: string;
  userLogin: string;
  year: number;
  generatedAt: string;
  
  summary: {
    totalCommits: number;
    totalWorkUnits: number;
    totalAdditions: number;
    totalDeletions: number;
    totalFilesChanged: number;
    activeDays: number;
    avgDailyCommits: number;
    avgImpactScore: number;
  };
  
  monthlyActivity: {
    month: number;
    commits: number;
    workUnits: number;
    additions: number;
    deletions: number;
    filesChanged: number;
  }[];
  
  repoContribution: {
    repoName: string;
    commits: number;
    additions: number;
    deletions: number;
    percentage: number;
  }[];
  
  workPatterns: {
    commitTypes: Record<string, number>;
    avgCommitSize: number;
    avgCommitsPerWorkUnit: number;
    largeChanges: number;
    smallChanges: number;
  };
  
  qualityIndicators: {
    testFileRatio: number;
    docsRatio: number;
    hotfixRatio: number;
    revertRatio: number;
  };
  
  impactAnalysis: {
    avgScore: number;
    distribution: { range: string; count: number }[];
    topWorkUnits: {
      id: string;
      primaryPaths: string[];
      score: number;
      commitCount: number;
      repoName: string;
    }[];
  };
  
  activityHeatmap: {
    dayOfWeek: number;
    hour: number;
    count: number;
  }[];
}

export async function calculateInterimStats(
  runId: string,
  userLogin: string
): Promise<InterimReportData> {
  // 분석 실행 정보 조회
  const run = await db.analysisRun.findUnique({
    where: { id: runId },
    select: { year: true, orgId: true },
  });

  if (!run) {
    throw new Error("Analysis run not found");
  }

  const { year, orgId } = run;

  // 해당 사용자의 커밋 조회
  const commits = await db.commit.findMany({
    where: {
      authorLogin: userLogin,
      repo: { orgId },
      committedAt: {
        gte: new Date(`${year}-01-01`),
        lte: new Date(`${year}-12-31T23:59:59`),
      },
    },
    include: {
      repo: {
        select: { name: true, fullName: true },
      },
      files: {
        select: { path: true },
      },
    },
    orderBy: { committedAt: "asc" },
  });

  // Work Units 조회
  const workUnits = await db.workUnit.findMany({
    where: {
      runId,
      userLogin,
    },
    include: {
      repo: {
        select: { name: true },
      },
    },
    orderBy: { impactScore: "desc" },
  });

  // 1. Summary 계산
  const totalCommits = commits.length;
  const totalWorkUnits = workUnits.length;
  const totalAdditions = commits.reduce((sum, c) => sum + c.additions, 0);
  const totalDeletions = commits.reduce((sum, c) => sum + c.deletions, 0);
  const totalFilesChanged = commits.reduce((sum, c) => sum + c.filesChanged, 0);

  // 활동 일수 계산 (distinct dates)
  const activeDaysSet = new Set(
    commits.map((c) => c.committedAt.toISOString().split("T")[0])
  );
  const activeDays = activeDaysSet.size;
  const avgDailyCommits = activeDays > 0 ? totalCommits / activeDays : 0;

  const avgImpactScore = workUnits.length > 0
    ? workUnits.reduce((sum, wu) => sum + wu.impactScore, 0) / workUnits.length
    : 0;

  // 2. 월별 활동 계산
  const monthlyActivity = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    commits: 0,
    workUnits: 0,
    additions: 0,
    deletions: 0,
    filesChanged: 0,
  }));

  commits.forEach((commit) => {
    const month = commit.committedAt.getMonth();
    monthlyActivity[month].commits++;
    monthlyActivity[month].additions += commit.additions;
    monthlyActivity[month].deletions += commit.deletions;
    monthlyActivity[month].filesChanged += commit.filesChanged;
  });

  workUnits.forEach((wu) => {
    const month = wu.startAt.getMonth();
    monthlyActivity[month].workUnits++;
  });

  // 3. 저장소별 기여도
  const repoStats = new Map<
    string,
    { commits: number; additions: number; deletions: number }
  >();

  commits.forEach((commit) => {
    const repoName = commit.repo.name;
    const stats = repoStats.get(repoName) || {
      commits: 0,
      additions: 0,
      deletions: 0,
    };
    stats.commits++;
    stats.additions += commit.additions;
    stats.deletions += commit.deletions;
    repoStats.set(repoName, stats);
  });

  const repoContribution = Array.from(repoStats.entries())
    .map(([repoName, stats]) => ({
      repoName,
      ...stats,
      percentage: totalCommits > 0 ? (stats.commits / totalCommits) * 100 : 0,
    }))
    .sort((a, b) => b.commits - a.commits);

  // 4. 작업 패턴 분석
  const commitTypes: Record<string, number> = {};
  const commitSizes: number[] = [];

  commits.forEach((commit) => {
    // 커밋 메시지에서 타입 추출
    const message = commit.message.toLowerCase();
    let type = "other";

    if (message.startsWith("feat:") || message.includes("[feat]")) type = "feat";
    else if (message.startsWith("fix:") || message.includes("[fix]")) type = "fix";
    else if (message.startsWith("refactor:") || message.includes("[refactor]")) type = "refactor";
    else if (message.startsWith("docs:") || message.includes("[docs]")) type = "docs";
    else if (message.startsWith("test:") || message.includes("[test]")) type = "test";
    else if (message.startsWith("chore:") || message.includes("[chore]")) type = "chore";
    else if (message.startsWith("style:") || message.includes("[style]")) type = "style";
    else if (message.startsWith("perf:") || message.includes("[perf]")) type = "perf";

    commitTypes[type] = (commitTypes[type] || 0) + 1;

    // 커밋 크기 계산
    const size = commit.additions + commit.deletions;
    commitSizes.push(size);
  });

  const avgCommitSize = commitSizes.length > 0
    ? commitSizes.reduce((sum, size) => sum + size, 0) / commitSizes.length
    : 0;

  const avgCommitsPerWorkUnit = workUnits.length > 0
    ? totalCommits / workUnits.length
    : 0;

  const largeChanges = commitSizes.filter((size) => size > 500).length;
  const smallChanges = commitSizes.filter((size) => size < 50).length;

  // 5. 품질 지표
  let testFileCount = 0;
  let docsFileCount = 0;
  let totalFileChanges = 0;

  commits.forEach((commit) => {
    commit.files.forEach((file) => {
      totalFileChanges++;
      const path = file.path.toLowerCase();
      if (
        path.includes("test") ||
        path.includes("spec") ||
        path.endsWith(".test.ts") ||
        path.endsWith(".test.js") ||
        path.endsWith(".spec.ts")
      ) {
        testFileCount++;
      }
      if (
        path.endsWith(".md") ||
        path.includes("docs/") ||
        path.includes("readme")
      ) {
        docsFileCount++;
      }
    });
  });

  const testFileRatio = totalFileChanges > 0 ? testFileCount / totalFileChanges : 0;
  const docsRatio = totalFileChanges > 0 ? docsFileCount / totalFileChanges : 0;

  const hotfixCount = workUnits.filter((wu) => wu.isHotfix).length;
  const revertCount = workUnits.filter((wu) => wu.hasRevert).length;

  const hotfixRatio = workUnits.length > 0 ? hotfixCount / workUnits.length : 0;
  const revertRatio = workUnits.length > 0 ? revertCount / workUnits.length : 0;

  // 6. Impact 분석
  const impactScores = workUnits.map((wu) => wu.impactScore);
  const distribution = [
    { range: "0-20", count: 0 },
    { range: "20-40", count: 0 },
    { range: "40-60", count: 0 },
    { range: "60-80", count: 0 },
    { range: "80-100", count: 0 },
    { range: "100+", count: 0 },
  ];

  impactScores.forEach((score) => {
    if (score < 20) distribution[0].count++;
    else if (score < 40) distribution[1].count++;
    else if (score < 60) distribution[2].count++;
    else if (score < 80) distribution[3].count++;
    else if (score < 100) distribution[4].count++;
    else distribution[5].count++;
  });

  const topWorkUnits = workUnits.slice(0, 10).map((wu) => ({
    id: wu.id,
    primaryPaths: wu.primaryPaths,
    score: wu.impactScore,
    commitCount: wu.commitCount,
    repoName: wu.repo.name,
  }));

  // 7. 활동 히트맵 (요일 x 시간대)
  const heatmapData = new Map<string, number>();

  commits.forEach((commit) => {
    const date = commit.committedAt;
    const dayOfWeek = date.getDay(); // 0 (일요일) - 6 (토요일)
    const hour = date.getHours();
    const key = `${dayOfWeek}-${hour}`;
    heatmapData.set(key, (heatmapData.get(key) || 0) + 1);
  });

  const activityHeatmap: { dayOfWeek: number; hour: number; count: number }[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const key = `${day}-${hour}`;
      const count = heatmapData.get(key) || 0;
      if (count > 0) {
        activityHeatmap.push({ dayOfWeek: day, hour, count });
      }
    }
  }

  return {
    runId,
    userLogin,
    year,
    generatedAt: new Date().toISOString(),
    summary: {
      totalCommits,
      totalWorkUnits,
      totalAdditions,
      totalDeletions,
      totalFilesChanged,
      activeDays,
      avgDailyCommits: Math.round(avgDailyCommits * 10) / 10,
      avgImpactScore: Math.round(avgImpactScore * 10) / 10,
    },
    monthlyActivity,
    repoContribution,
    workPatterns: {
      commitTypes,
      avgCommitSize: Math.round(avgCommitSize),
      avgCommitsPerWorkUnit: Math.round(avgCommitsPerWorkUnit * 10) / 10,
      largeChanges,
      smallChanges,
    },
    qualityIndicators: {
      testFileRatio: Math.round(testFileRatio * 1000) / 10, // percentage
      docsRatio: Math.round(docsRatio * 1000) / 10,
      hotfixRatio: Math.round(hotfixRatio * 1000) / 10,
      revertRatio: Math.round(revertRatio * 1000) / 10,
    },
    impactAnalysis: {
      avgScore: Math.round(avgImpactScore * 10) / 10,
      distribution,
      topWorkUnits,
    },
    activityHeatmap,
  };
}

