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
