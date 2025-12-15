// ============================================
// 공통 타입 정의
// ============================================

export type WorkType = 'feature' | 'bugfix' | 'refactor' | 'chore' | 'docs' | 'test';

export type Complexity = 'low' | 'medium' | 'high';

// ============================================
// LLM 리뷰 결과 타입
// ============================================

export interface ReviewResult {
  summary: string;
  workType: WorkType;
  complexity: Complexity;
  strengths: string[];
  risks: string[];
  suggestions: string[];
  learningPoints: string[];
  confidence: number;
}

// ============================================
// 임팩트 스코어 요인
// ============================================

export interface ImpactFactors {
  baseScore: number;
  coreModuleBonus: number;
  hotspotBonus: number;
  testPenalty: number;
  configBonus: number;
  sizeScore: number;
}

// ============================================
// 리포트 통계
// ============================================

export interface ReportStats {
  totalCommits: number;
  totalWorkUnits: number;
  totalAdditions: number;
  totalDeletions: number;
  avgImpactScore: number;
  topRepos: { name: string; commits: number; percentage: number }[];
  workTypeDistribution: Record<WorkType, number>;
  monthlyActivity: { month: number; commits: number; workUnits: number }[];
}

// ============================================
// 분석 옵션
// ============================================

export interface AnalysisOptions {
  includeArchived?: boolean;
  excludeRepos?: string[];
  clusteringConfig?: Partial<ClusteringConfig>;
  impactConfig?: Partial<ImpactConfig>;
  llmModel?: 'gpt-4o' | 'claude-3-5-sonnet';
}

export interface ClusteringConfig {
  maxTimeGapHours: number;
  minPathOverlap: number;
  maxCommitsPerUnit: number;
  minCommitsPerUnit: number;
}

export interface ImpactConfig {
  criticalPaths: { pattern: string; weight: number }[];
  weights: {
    coreModule: number;
    hotspotFile: number;
    testFile: number;
    configFile: number;
    schemaChange: number;
  };
  locCap: number;
}

// ============================================
// 진행률 타입
// ============================================

export interface ClusteringProgress {
  stage: "loading" | "clustering" | "saving";
  totalCommits: number;
  processedCommits: number;
  totalRepos: number;
  processedRepos: number;
  createdWorkUnits: number;
}

export interface ProgressData {
  total: number;
  completed: number;
  failed: number;
  phase?: string;
  clusteringProgress?: ClusteringProgress;
}

export interface RepoProgress {
  repoName: string;
  status: 'pending' | 'scanning' | 'done' | 'failed';
  commitCount?: number;
  error?: string;
}

// ============================================
// API 응답 타입
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================
// 조직 설정 타입
// ============================================

export interface OrgSettings {
  criticalPaths?: { pattern: string; weight: number }[];
  excludePatterns?: string[];
  teamStandards?: string;
  defaultLlmModel?: 'gpt-4o' | 'claude-3-5-sonnet';
}

// ============================================
// 업무 일지 타입
// ============================================

export interface JournalCommit {
  sha: string;
  message: string;
  repoName: string;
  repoFullName: string;
  additions: number;
  deletions: number;
  committedAt: Date;
}

export interface DayCommits {
  date: string; // "2024-03-15"
  commits: JournalCommit[];
}

export interface PeriodAnalysis {
  summary: string;
  keyActivities: string[];
  workPattern: string;
  reposCovered: string[];
  commitCount: number;
  periodType: 'week' | 'month';
}

export interface WeeklyDiversity {
  week: number; // 1-52
  startDate: string;
  endDate: string;
  repoCount: number;
  focusScore: number; // 0-1
  commits: number;
}

export interface MonthlyDiversity {
  month: number; // 1-12
  repoCount: number;
  focusScore: number; // 0-1
  commits: number;
}

export interface RepoCoverageStats {
  weeklyDiversity: WeeklyDiversity[];
  monthlyDiversity: MonthlyDiversity[];
  workStyle: 'specialist' | 'generalist' | 'balanced';
  totalReposContributed: number;
  totalReposInOrg: number;
  coveragePercentage: number;
}

// ============================================
// AI 분석 타입
// ============================================

// 분석 상태
export type AnalysisStatus = 'PENDING' | 'STAGE1' | 'STAGE2' | 'STAGE3' | 'COMPLETED' | 'FAILED';

// 1단계: 주요 커밋 정보
export interface KeyCommitInfo {
  sha: string;
  message: string;
  repoFullName: string;
  additions: number;
  deletions: number;
  committedAt: string;
  reason: string; // 선별 이유
  score: number; // 중요도 점수
}

// 2단계: 커밋 코드 리뷰
export interface CommitReview {
  sha: string;
  message: string;
  repoFullName: string;

  // 코드 리뷰 결과
  summary: string;
  technicalQuality: 'high' | 'medium' | 'low';
  complexity: 'high' | 'medium' | 'low';
  impact: string[];
  risks: string[];
  learnings: string[];

  // 분석된 파일들
  filesAnalyzed: {
    path: string;
    changes: number;
    insight: string;
  }[];
}

// 3단계: 주간 최종 분석
export interface WeeklyAnalysisResult {
  summary: string; // 주간 업무 종합 요약
  keyActivities: string[]; // 주요 활동 목록
  workPattern: string; // 작업 패턴 (집중형/분산형/유지보수형 등)
  technicalHighlights: string[]; // 기술적 하이라이트
  insights: string[]; // 인사이트
  metrics: {
    totalCommits: number;
    keyCommitsAnalyzed: number;
    reposWorked: number;
    linesChanged: number;
  };
}

// 3단계: 월간 최종 분석
export interface MonthlyAnalysisResult {
  summary: string; // 월간 업무 종합 요약
  weeklyBreakdown: {
    // 주차별 요약
    week: number;
    summary: string;
    keyActivity: string;
  }[];
  overallPattern: string; // 전체 작업 패턴
  achievements: string[]; // 주요 성과
  technicalGrowth: string[]; // 기술적 성장
  recommendations: string[]; // 다음 달 권장 사항
  metrics: {
    totalCommits: number;
    weeksActive: number;
    reposWorked: number;
    averageCommitsPerWeek: number;
  };
}

// DB 저장용 분석 데이터
export interface WeeklyAnalysisData {
  id: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  status: AnalysisStatus;
  stage1Result?: { keyCommits: KeyCommitInfo[] };
  stage2Result?: { commitReviews: CommitReview[] };
  stage3Result?: WeeklyAnalysisResult;
  error?: string;
  analyzedAt?: string;
}

export interface MonthlyAnalysisData {
  id: string;
  month: number;
  status: AnalysisStatus;
  stage1Result?: { keyCommits: KeyCommitInfo[] };
  stage2Result?: { commitReviews: CommitReview[] };
  stage3Result?: MonthlyAnalysisResult;
  weeklyAnalysisIds: string[];
  error?: string;
  analyzedAt?: string;
}

