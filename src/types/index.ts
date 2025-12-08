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

export interface ProgressData {
  total: number;
  completed: number;
  failed: number;
  phase?: string;
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

