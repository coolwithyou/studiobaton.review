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
  criticalPaths?: { pattern: string; weight: number; label?: string }[];
  excludePatterns?: string[];
  teamStandards?: string;
}

// ============================================
// 커밋 동기화 타입
// ============================================

export interface SyncProgress {
  totalRepos: number;
  completedRepos: number;
  failedRepos: number;
  totalCommits: number;
}

export interface RepoProgress {
  repoName: string;
  status: 'pending' | 'scanning' | 'done' | 'failed';
  commitCount?: number;
  error?: string;
}

// ============================================
// 분석 메트릭 타입
// ============================================

export interface ProductivityMetrics {
  totalCommits: number;
  totalPRs: number;
  linesAdded: number;
  linesDeleted: number;
  netLines: number;
  filesChanged: number;
  workingDays: number;
  avgCommitsPerDay: number;
  avgLinesPerCommit: number;
}

export interface WorkPatternMetrics {
  timeDistribution: {
    morning: number;   // 06:00-12:00
    afternoon: number; // 12:00-18:00
    evening: number;   // 18:00-22:00
    night: number;     // 22:00-06:00
  };
  dayOfWeekDistribution: number[]; // 일~토 (0~6)
  longestStreak: number;
  weekendWorkRatio: number;
  avgSessionDuration: number; // 분
}

export interface DiversityMetrics {
  repositoryCount: number;
  primaryRepository: { name: string; percentage: number };
  repoDistribution: Array<{ repo: string; commits: number; percentage: number }>;
  languageVariety: string[];
  techStackCoverage: {
    frontend: number;
    backend: number;
    infra: number;
    test: number;
    docs: number;
  };
}

export interface PRActivityMetrics {
  totalPRs: number;
  mergedPRs: number;
  prParticipationRate: number;
  avgCommitsPerPR: number;
  mergeSuccessRate: number;
  avgPRCycleTime: number; // 시간
}

export interface CommitQualityMetrics {
  avgMessageLength: number;
  conventionalCommitsRate: number;
  issueReferenceRate: number;
  meaningfulCommitRate: number;
  revertRate: number;
  testCommitRate: number;
}

export interface AIUsageEstimate {
  largeCommitFrequency: number;
  styleConsistencyScore: number;
  documentationRate: number;
  estimatedAiAssistance: 'low' | 'medium' | 'high';
}

export interface DeveloperMetrics {
  productivity: ProductivityMetrics;
  workPattern: WorkPatternMetrics;
  diversity: DiversityMetrics;
  prActivity: PRActivityMetrics;
  commitQuality: CommitQualityMetrics;
  aiUsageEstimate: AIUsageEstimate;
}

// ============================================
// WorkUnit 타입
// ============================================

export type WorkType = 'feature' | 'bugfix' | 'refactor' | 'docs' | 'test' | 'style' | 'chore' | 'unknown';

export interface ImpactFactors {
  baseScore: number;
  sizeScore: number;
  coreModuleBonus: number;
  hotspotBonus: number;
  testScore: number;
  configBonus: number;
}

export interface WorkUnitData {
  id: string;
  userLogin: string;
  repoId: string;
  repoFullName: string;
  title?: string;
  summary?: string;
  workType: WorkType;
  impactScore: number;
  impactFactors: ImpactFactors;
  commits: Array<{
    sha: string;
    message: string;
    additions: number;
    deletions: number;
    filesChanged: number;
    committedAt: Date;
    files: Array<{ path: string; additions: number; deletions: number; status: string }>;
  }>;
  startDate: Date;
  endDate: Date;
  totalAdditions: number;
  totalDeletions: number;
  totalFilesChanged: number;
  primaryPaths: string[];
}

// ============================================
// AI 분석 결과 타입
// ============================================

export interface Stage0Result {
  selectedWorkUnitIds: string[];
  selectionReasons: Array<{
    workUnitId: string;
    reason: string;
    category: 'business_logic' | 'architecture' | 'bug_fix' | 'feature' | 'quality';
  }>;
}

export interface Stage1Result {
  codeQuality: {
    score: number;
    readability: number;
    maintainability: number;
    bestPractices: number;
  };
  strengths: string[];
  weaknesses: string[];
  codePatterns: string[];
  suggestions: string[];
}

export interface Stage2Result {
  workStyle: {
    type: 'deep-diver' | 'multi-tasker' | 'firefighter' | 'architect';
    description: string;
  };
  collaborationPattern: {
    type: 'solo' | 'collaborative' | 'mentor' | 'learner';
    description: string;
  };
  productivityInsights: string[];
  timeManagementFeedback: string;
}

export interface Stage3Result {
  areasForImprovement: Array<{
    area: string;
    priority: 'high' | 'medium' | 'low';
    specificFeedback: string;
    suggestedResources: string[];
  }>;
  learningOpportunities: string[];
  strengths: string[];
  careerGrowthSuggestions: string[];
}

export interface Stage4Result {
  executiveSummary: string;
  overallAssessment: {
    productivity: { score: number; feedback: string };
    codeQuality: { score: number; feedback: string };
    diversity: { score: number; feedback: string };
    collaboration: { score: number; feedback: string };
    growth: { score: number; feedback: string };
  };
  topAchievements: string[];
  keyImprovements: string[];
  actionItems: Array<{
    item: string;
    deadline: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  yearOverYearComparison?: string;
}

// ============================================
// 차트 데이터 타입
// ============================================

export interface MonthlyActivityData {
  month: number;
  commits: number;
  linesChanged: number;
  prs: number;
}

export interface WorkTypeDistribution {
  type: WorkType;
  count: number;
  percentage: number;
}

export interface RepoContribution {
  repo: string;
  commits: number;
  linesAdded: number;
  linesDeleted: number;
  percentage: number;
}

export interface TimeHeatmapData {
  dayOfWeek: number; // 0-6
  hour: number; // 0-23
  count: number;
}

// ============================================
// Journal 타입 (기존)
// ============================================

export interface DayCommits {
  date: string;
  commits: Array<{
    sha: string;
    message: string;
    additions: number;
    deletions: number;
    filesChanged: number;
    committedAt: string;
    repoFullName: string;
  }>;
}

export interface MonthlyAnalysisData {
  id: string;
  month: number;
  status: 'PENDING' | 'ANALYZING' | 'DONE' | 'FAILED';
  summary?: string;
}

export interface WeeklyAnalysisData {
  id: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  status: 'PENDING' | 'ANALYZING' | 'DONE' | 'FAILED';
  summary?: string;
}
