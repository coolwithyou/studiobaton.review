import { WorkType, Complexity, ImpactFactors } from "@/types";

// ============================================
// LLM Provider 인터페이스
// ============================================

export interface LLMProvider {
  name: string;
  generateReview(input: ReviewInput): Promise<ReviewResult>;
  estimateCost(input: ReviewInput): number;
}

// ============================================
// 리뷰 입력/출력 타입
// ============================================

export interface ReviewInput {
  workUnit: {
    summary: string;
    commits: { message: string; sha: string }[];
    primaryPaths: string[];
    stats: {
      additions: number;
      deletions: number;
      filesChanged: number;
      commitCount: number;
    };
    impactScore: number;
    impactFactors: ImpactFactors;
    startAt: string;
    endAt: string;
  };
  diffSamples: DiffSample[];
  context: {
    orgName: string;
    repoName: string;
    userName: string;
    year: number;
    teamStandards?: string;
  };
}

export interface DiffSample {
  path: string;
  diff: string;
  additions: number;
  deletions: number;
}

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
// Diff 샘플링 설정
// ============================================

export interface DiffSamplingConfig {
  maxTotalTokens: number;
  maxFilesPerUnit: number;
  maxLinesPerFile: number;
  priorityPatterns: string[];
}

export const DEFAULT_DIFF_SAMPLING_CONFIG: DiffSamplingConfig = {
  maxTotalTokens: 4000,
  maxFilesPerUnit: 5,
  maxLinesPerFile: 100,
  priorityPatterns: [
    "src/",
    "lib/",
    "app/",
    "components/",
    "pages/",
    "api/",
  ],
};

