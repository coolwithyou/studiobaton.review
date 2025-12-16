/**
 * 개발자 메트릭 계산 모듈
 * 
 * 커밋, PR 데이터를 기반으로 개발자의 정량적 지표를 계산합니다.
 */

import { db } from "@/lib/db";
import type {
  DeveloperMetrics,
  ProductivityMetrics,
  WorkPatternMetrics,
  DiversityMetrics,
  PRActivityMetrics,
  CommitQualityMetrics,
  AIUsageEstimate,
  MonthlyActivityData,
  TimeHeatmapData,
} from "@/types";

// ============================================
// 작업 유형 분류를 위한 키워드
// ============================================

const WORK_TYPE_KEYWORDS = {
  feature: ['feat', 'feature', 'add', 'implement', 'create', '추가', '구현', '신규'],
  bugfix: ['fix', 'bug', 'hotfix', 'patch', 'resolve', '수정', '버그', '오류'],
  refactor: ['refactor', 'refactoring', 'cleanup', 'improve', 'optimize', '리팩토링', '개선', '최적화'],
  docs: ['docs', 'documentation', 'readme', '문서', 'comment'],
  test: ['test', 'testing', 'spec', 'coverage', '테스트'],
  style: ['style', 'format', 'prettier', 'lint', 'eslint', '스타일', '포맷'],
  chore: ['chore', 'deps', 'dependency', 'dependencies', 'update', 'upgrade', 'bump', '의존성', '업데이트'],
} as const;

// Conventional Commits 패턴
const CONVENTIONAL_PATTERN = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?:\s.+/i;

// 이슈 참조 패턴
const ISSUE_REFERENCE_PATTERN = /#\d+|[A-Z]+-\d+/;

// 의미 없는 커밋 메시지 패턴
const MEANINGLESS_PATTERNS = [
  /^(wip|fix|update|edit|change|modify)$/i,
  /^(merge|initial|first|init)$/i,
  /^\.+$/,
  /^[a-z]$/i,
];

// 파일 경로 분류
const FILE_CATEGORIES = {
  frontend: [
    /\.(tsx?|jsx?)$/,
    /components\//,
    /pages\//,
    /app\//,
    /styles\//,
    /\.css$/,
    /\.scss$/,
  ],
  backend: [
    /api\//,
    /server\//,
    /controllers?\//,
    /services?\//,
    /models?\//,
    /routes?\//,
    /middleware\//,
  ],
  infra: [
    /\.github\//,
    /docker/i,
    /terraform/i,
    /kubernetes/i,
    /k8s/i,
    /\.ya?ml$/,
    /Dockerfile/i,
  ],
  test: [
    /__tests__\//,
    /\.test\./,
    /\.spec\./,
    /test\//,
    /tests\//,
  ],
  docs: [
    /\.md$/,
    /docs?\//,
    /README/i,
    /CHANGELOG/i,
  ],
};

// ============================================
// 메인 메트릭 계산 함수
// ============================================

export async function calculateDeveloperMetrics(
  orgId: string,
  userLogin: string,
  year: number
): Promise<DeveloperMetrics> {
  // 해당 연도의 커밋 조회
  const startDate = new Date(`${year}-01-01T00:00:00Z`);
  const endDate = new Date(`${year}-12-31T23:59:59Z`);

  const commits = await db.commit.findMany({
    where: {
      authorLogin: userLogin,
      committedAt: {
        gte: startDate,
        lte: endDate,
      },
      repo: {
        orgId: orgId,
      },
    },
    include: {
      files: true,
      repo: true,
      prLinks: {
        include: {
          pr: true,
        },
      },
    },
    orderBy: {
      committedAt: 'asc',
    },
  });

  // PR 조회
  const prs = await db.pullRequest.findMany({
    where: {
      authorLogin: userLogin,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      repo: {
        orgId: orgId,
      },
    },
    include: {
      commits: true,
    },
  });

  // 각 메트릭 계산
  const productivity = calculateProductivityMetrics(commits, prs);
  const workPattern = calculateWorkPatternMetrics(commits);
  const diversity = calculateDiversityMetrics(commits);
  const prActivity = calculatePRActivityMetrics(commits, prs);
  const commitQuality = calculateCommitQualityMetrics(commits);
  const aiUsageEstimate = estimateAIUsage(commits);

  return {
    productivity,
    workPattern,
    diversity,
    prActivity,
    commitQuality,
    aiUsageEstimate,
  };
}

// ============================================
// 생산성 메트릭
// ============================================

function calculateProductivityMetrics(
  commits: any[],
  prs: any[]
): ProductivityMetrics {
  const totalCommits = commits.length;
  const totalPRs = prs.length;
  
  const linesAdded = commits.reduce((sum, c) => sum + c.additions, 0);
  const linesDeleted = commits.reduce((sum, c) => sum + c.deletions, 0);
  const netLines = linesAdded - linesDeleted;
  const filesChanged = commits.reduce((sum, c) => sum + c.filesChanged, 0);

  // 작업일 계산 (고유 날짜 수)
  const uniqueDates = new Set(
    commits.map(c => c.committedAt.toISOString().split('T')[0])
  );
  const workingDays = uniqueDates.size;

  const avgCommitsPerDay = workingDays > 0 ? totalCommits / workingDays : 0;
  const avgLinesPerCommit = totalCommits > 0 ? (linesAdded + linesDeleted) / totalCommits : 0;

  return {
    totalCommits,
    totalPRs,
    linesAdded,
    linesDeleted,
    netLines,
    filesChanged,
    workingDays,
    avgCommitsPerDay: Math.round(avgCommitsPerDay * 100) / 100,
    avgLinesPerCommit: Math.round(avgLinesPerCommit * 100) / 100,
  };
}

// ============================================
// 작업 패턴 메트릭
// ============================================

function calculateWorkPatternMetrics(commits: any[]): WorkPatternMetrics {
  // 시간대별 분포
  const timeDistribution = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  // 요일별 분포 (일~토)
  const dayOfWeekDistribution = [0, 0, 0, 0, 0, 0, 0];

  commits.forEach(commit => {
    const hour = commit.committedAt.getHours();
    const dayOfWeek = commit.committedAt.getDay();

    // 시간대 분류
    if (hour >= 6 && hour < 12) timeDistribution.morning++;
    else if (hour >= 12 && hour < 18) timeDistribution.afternoon++;
    else if (hour >= 18 && hour < 22) timeDistribution.evening++;
    else timeDistribution.night++;

    dayOfWeekDistribution[dayOfWeek]++;
  });

  // 백분율로 변환
  const total = commits.length || 1;
  timeDistribution.morning = Math.round((timeDistribution.morning / total) * 100);
  timeDistribution.afternoon = Math.round((timeDistribution.afternoon / total) * 100);
  timeDistribution.evening = Math.round((timeDistribution.evening / total) * 100);
  timeDistribution.night = Math.round((timeDistribution.night / total) * 100);

  // 연속 작업일 계산
  const longestStreak = calculateLongestStreak(commits);

  // 주말 작업 비율
  const weekendCommits = dayOfWeekDistribution[0] + dayOfWeekDistribution[6];
  const weekendWorkRatio = total > 0 ? Math.round((weekendCommits / total) * 100) : 0;

  // 평균 세션 시간 (같은 날 연속 커밋 간격)
  const avgSessionDuration = calculateAvgSessionDuration(commits);

  return {
    timeDistribution,
    dayOfWeekDistribution,
    longestStreak,
    weekendWorkRatio,
    avgSessionDuration,
  };
}

function calculateLongestStreak(commits: any[]): number {
  if (commits.length === 0) return 0;

  const dates = [...new Set(
    commits.map(c => c.committedAt.toISOString().split('T')[0])
  )].sort();

  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const curr = new Date(dates[i]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  return maxStreak;
}

function calculateAvgSessionDuration(commits: any[]): number {
  if (commits.length < 2) return 0;

  // 날짜별로 그룹화
  const byDate = new Map<string, Date[]>();
  commits.forEach(commit => {
    const dateKey = commit.committedAt.toISOString().split('T')[0];
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, []);
    }
    byDate.get(dateKey)!.push(commit.committedAt);
  });

  let totalDuration = 0;
  let sessionCount = 0;

  byDate.forEach(times => {
    if (times.length < 2) return;
    
    times.sort((a, b) => a.getTime() - b.getTime());
    const firstCommit = times[0];
    const lastCommit = times[times.length - 1];
    const duration = (lastCommit.getTime() - firstCommit.getTime()) / (1000 * 60); // 분
    
    if (duration > 0 && duration < 720) { // 12시간 이내만 유효한 세션으로
      totalDuration += duration;
      sessionCount++;
    }
  });

  return sessionCount > 0 ? Math.round(totalDuration / sessionCount) : 0;
}

// ============================================
// 프로젝트 다양성 메트릭
// ============================================

function calculateDiversityMetrics(commits: any[]): DiversityMetrics {
  // 저장소별 커밋 수
  const repoCommits = new Map<string, number>();
  const repoLanguages = new Map<string, string>();
  
  commits.forEach(commit => {
    const repoName = commit.repo.fullName;
    repoCommits.set(repoName, (repoCommits.get(repoName) || 0) + 1);
    if (commit.repo.language) {
      repoLanguages.set(repoName, commit.repo.language);
    }
  });

  const totalCommits = commits.length || 1;
  const repoDistribution = Array.from(repoCommits.entries())
    .map(([repo, count]) => ({
      repo,
      commits: count,
      percentage: Math.round((count / totalCommits) * 100),
    }))
    .sort((a, b) => b.commits - a.commits);

  // 주력 저장소
  const primaryRepository = repoDistribution[0] || { name: '', percentage: 0 };

  // 사용 언어
  const languageVariety = [...new Set(repoLanguages.values())];

  // 기술 스택 커버리지 (파일 경로 분석)
  const techStackCoverage = calculateTechStackCoverage(commits);

  return {
    repositoryCount: repoCommits.size,
    primaryRepository: {
      name: primaryRepository.repo || '',
      percentage: primaryRepository.percentage,
    },
    repoDistribution,
    languageVariety,
    techStackCoverage,
  };
}

function calculateTechStackCoverage(commits: any[]): DiversityMetrics['techStackCoverage'] {
  const coverage = { frontend: 0, backend: 0, infra: 0, test: 0, docs: 0 };
  const allFiles = commits.flatMap(c => c.files.map((f: any) => f.path));
  const totalFiles = allFiles.length || 1;

  allFiles.forEach(path => {
    if (FILE_CATEGORIES.frontend.some(p => p.test(path))) coverage.frontend++;
    if (FILE_CATEGORIES.backend.some(p => p.test(path))) coverage.backend++;
    if (FILE_CATEGORIES.infra.some(p => p.test(path))) coverage.infra++;
    if (FILE_CATEGORIES.test.some(p => p.test(path))) coverage.test++;
    if (FILE_CATEGORIES.docs.some(p => p.test(path))) coverage.docs++;
  });

  // 백분율로 변환
  return {
    frontend: Math.round((coverage.frontend / totalFiles) * 100),
    backend: Math.round((coverage.backend / totalFiles) * 100),
    infra: Math.round((coverage.infra / totalFiles) * 100),
    test: Math.round((coverage.test / totalFiles) * 100),
    docs: Math.round((coverage.docs / totalFiles) * 100),
  };
}

// ============================================
// PR 활동 메트릭
// ============================================

function calculatePRActivityMetrics(commits: any[], prs: any[]): PRActivityMetrics {
  const totalPRs = prs.length;
  const mergedPRs = prs.filter(pr => pr.mergedAt).length;
  
  // PR에 포함된 커밋 비율
  const commitsInPR = commits.filter(c => c.prLinks.length > 0).length;
  const prParticipationRate = commits.length > 0 
    ? Math.round((commitsInPR / commits.length) * 100) 
    : 0;

  // PR당 평균 커밋 수
  const avgCommitsPerPR = totalPRs > 0
    ? Math.round((prs.reduce((sum, pr) => sum + pr.commits.length, 0) / totalPRs) * 100) / 100
    : 0;

  // Merge 성공률
  const closedPRs = prs.filter(pr => pr.state === 'closed' || pr.mergedAt).length;
  const mergeSuccessRate = closedPRs > 0
    ? Math.round((mergedPRs / closedPRs) * 100)
    : 0;

  // PR 사이클 타임 (생성 ~ merge까지 평균 시간)
  const cycleTimesHours = prs
    .filter(pr => pr.mergedAt)
    .map(pr => {
      const created = new Date(pr.createdAt);
      const merged = new Date(pr.mergedAt);
      return (merged.getTime() - created.getTime()) / (1000 * 60 * 60);
    });
  
  const avgPRCycleTime = cycleTimesHours.length > 0
    ? Math.round(cycleTimesHours.reduce((a, b) => a + b, 0) / cycleTimesHours.length)
    : 0;

  return {
    totalPRs,
    mergedPRs,
    prParticipationRate,
    avgCommitsPerPR,
    mergeSuccessRate,
    avgPRCycleTime,
  };
}

// ============================================
// 커밋 품질 메트릭
// ============================================

function calculateCommitQualityMetrics(commits: any[]): CommitQualityMetrics {
  if (commits.length === 0) {
    return {
      avgMessageLength: 0,
      conventionalCommitsRate: 0,
      issueReferenceRate: 0,
      meaningfulCommitRate: 0,
      revertRate: 0,
      testCommitRate: 0,
    };
  }

  const totalCommits = commits.length;

  // 평균 메시지 길이
  const avgMessageLength = Math.round(
    commits.reduce((sum, c) => sum + c.message.length, 0) / totalCommits
  );

  // Conventional Commits 준수율
  const conventionalCount = commits.filter(c => 
    CONVENTIONAL_PATTERN.test(c.message)
  ).length;
  const conventionalCommitsRate = Math.round((conventionalCount / totalCommits) * 100);

  // 이슈 참조율
  const issueRefCount = commits.filter(c => 
    ISSUE_REFERENCE_PATTERN.test(c.message)
  ).length;
  const issueReferenceRate = Math.round((issueRefCount / totalCommits) * 100);

  // 의미 있는 커밋 비율
  const meaninglessCount = commits.filter(c => 
    MEANINGLESS_PATTERNS.some(p => p.test(c.message.trim()))
  ).length;
  const meaningfulCommitRate = Math.round(((totalCommits - meaninglessCount) / totalCommits) * 100);

  // Revert 비율
  const revertCount = commits.filter(c => 
    c.message.toLowerCase().startsWith('revert')
  ).length;
  const revertRate = Math.round((revertCount / totalCommits) * 100);

  // 테스트 커밋 비율
  const testCommitCount = commits.filter(c => 
    c.files.some((f: any) => FILE_CATEGORIES.test.some(p => p.test(f.path)))
  ).length;
  const testCommitRate = Math.round((testCommitCount / totalCommits) * 100);

  return {
    avgMessageLength,
    conventionalCommitsRate,
    issueReferenceRate,
    meaningfulCommitRate,
    revertRate,
    testCommitRate,
  };
}

// ============================================
// AI 활용도 추정 (간접 지표)
// ============================================

function estimateAIUsage(commits: any[]): AIUsageEstimate {
  if (commits.length === 0) {
    return {
      largeCommitFrequency: 0,
      styleConsistencyScore: 0,
      documentationRate: 0,
      estimatedAiAssistance: 'low',
    };
  }

  // 대규모 커밋 빈도 (300줄 이상)
  const largeCommits = commits.filter(c => c.additions + c.deletions > 300);
  const largeCommitFrequency = Math.round((largeCommits.length / commits.length) * 100);

  // 스타일 일관성 점수 (커밋 메시지 형식 일관성)
  const hasPrefix = commits.filter(c => 
    /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf)[\(:]/.test(c.message)
  ).length;
  const styleConsistencyScore = Math.round((hasPrefix / commits.length) * 100);

  // 문서화 비율 (문서/주석 관련 파일 변경)
  const docsCommits = commits.filter(c =>
    c.files.some((f: any) => FILE_CATEGORIES.docs.some(p => p.test(f.path)))
  );
  const documentationRate = Math.round((docsCommits.length / commits.length) * 100);

  // AI 활용 추정
  let estimatedAiAssistance: 'low' | 'medium' | 'high' = 'low';
  
  // 대규모 커밋이 많고, 스타일이 일관되며, 문서화가 잘 되어 있으면 AI 활용 가능성 높음
  const aiScore = largeCommitFrequency * 0.3 + styleConsistencyScore * 0.4 + documentationRate * 0.3;
  
  if (aiScore > 50) estimatedAiAssistance = 'high';
  else if (aiScore > 25) estimatedAiAssistance = 'medium';

  return {
    largeCommitFrequency,
    styleConsistencyScore,
    documentationRate,
    estimatedAiAssistance,
  };
}

// ============================================
// 월별 활동 데이터
// ============================================

export async function calculateMonthlyActivity(
  orgId: string,
  userLogin: string,
  year: number
): Promise<MonthlyActivityData[]> {
  const startDate = new Date(`${year}-01-01T00:00:00Z`);
  const endDate = new Date(`${year}-12-31T23:59:59Z`);

  const commits = await db.commit.findMany({
    where: {
      authorLogin: userLogin,
      committedAt: {
        gte: startDate,
        lte: endDate,
      },
      repo: {
        orgId: orgId,
      },
    },
    select: {
      committedAt: true,
      additions: true,
      deletions: true,
    },
  });

  const prs = await db.pullRequest.findMany({
    where: {
      authorLogin: userLogin,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      repo: {
        orgId: orgId,
      },
    },
    select: {
      createdAt: true,
    },
  });

  // 월별로 그룹화
  const monthlyData: MonthlyActivityData[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    commits: 0,
    linesChanged: 0,
    prs: 0,
  }));

  commits.forEach(commit => {
    const month = commit.committedAt.getMonth();
    monthlyData[month].commits++;
    monthlyData[month].linesChanged += commit.additions + commit.deletions;
  });

  prs.forEach(pr => {
    const month = pr.createdAt.getMonth();
    monthlyData[month].prs++;
  });

  return monthlyData;
}

// ============================================
// 시간대 히트맵 데이터
// ============================================

export async function calculateTimeHeatmap(
  orgId: string,
  userLogin: string,
  year: number
): Promise<TimeHeatmapData[]> {
  const startDate = new Date(`${year}-01-01T00:00:00Z`);
  const endDate = new Date(`${year}-12-31T23:59:59Z`);

  const commits = await db.commit.findMany({
    where: {
      authorLogin: userLogin,
      committedAt: {
        gte: startDate,
        lte: endDate,
      },
      repo: {
        orgId: orgId,
      },
    },
    select: {
      committedAt: true,
    },
  });

  // 요일 x 시간 그리드 초기화
  const heatmap: TimeHeatmapData[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      heatmap.push({ dayOfWeek: day, hour, count: 0 });
    }
  }

  commits.forEach(commit => {
    const dayOfWeek = commit.committedAt.getDay();
    const hour = commit.committedAt.getHours();
    const index = dayOfWeek * 24 + hour;
    heatmap[index].count++;
  });

  return heatmap;
}

// ============================================
// 커밋 메시지에서 작업 유형 추출
// ============================================

export function detectWorkType(message: string): keyof typeof WORK_TYPE_KEYWORDS | 'unknown' {
  const lowerMessage = message.toLowerCase();
  
  for (const [type, keywords] of Object.entries(WORK_TYPE_KEYWORDS)) {
    if (keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()))) {
      return type as keyof typeof WORK_TYPE_KEYWORDS;
    }
  }
  
  return 'unknown';
}

// ============================================
// 작업 유형별 분포 계산
// ============================================

export async function calculateWorkTypeDistribution(
  orgId: string,
  userLogin: string,
  year: number
): Promise<Array<{ type: string; count: number; percentage: number }>> {
  const startDate = new Date(`${year}-01-01T00:00:00Z`);
  const endDate = new Date(`${year}-12-31T23:59:59Z`);

  const commits = await db.commit.findMany({
    where: {
      authorLogin: userLogin,
      committedAt: {
        gte: startDate,
        lte: endDate,
      },
      repo: {
        orgId: orgId,
      },
    },
    select: {
      message: true,
    },
  });

  const typeCounts: Record<string, number> = {};
  
  commits.forEach(commit => {
    const type = detectWorkType(commit.message);
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  const total = commits.length || 1;
  
  return Object.entries(typeCounts)
    .map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

