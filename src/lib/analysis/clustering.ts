import { Commit, CommitFile } from "@prisma/client";
import { ClusteringConfig } from "@/types";

// ============================================
// 기본 설정
// ============================================

export const DEFAULT_CLUSTERING_CONFIG: ClusteringConfig = {
  maxTimeGapHours: 8,
  minPathOverlap: 0.3,
  maxCommitsPerUnit: 50,
  minCommitsPerUnit: 1,
};

// ============================================
// 타입 정의
// ============================================

interface CommitWithFiles extends Commit {
  files: CommitFile[];
}

interface WorkUnitData {
  commits: CommitWithFiles[];
  startAt: Date;
  endAt: Date;
  primaryPaths: string[];
  additions: number;
  deletions: number;
  filesChanged: number;
}

// ============================================
// 메인 클러스터링 함수
// ============================================

export function clusterCommits(
  commits: CommitWithFiles[],
  config: Partial<ClusteringConfig> = {}
): WorkUnitData[] {
  const cfg = { ...DEFAULT_CLUSTERING_CONFIG, ...config };

  if (commits.length === 0) return [];

  // 1. 시간순 정렬
  const sorted = [...commits].sort(
    (a, b) => a.committedAt.getTime() - b.committedAt.getTime()
  );

  // 2. 시간 기반 초기 그룹핑
  const timeGroups = groupByTimeGap(sorted, cfg.maxTimeGapHours);

  // 3. 경로 유사도로 세분화
  const refined = timeGroups.flatMap((group) =>
    refineByPathSimilarity(group, cfg.minPathOverlap)
  );

  // 4. 크기 제한 적용
  const sized = refined.flatMap((group) =>
    enforceSize(group, cfg.maxCommitsPerUnit, cfg.minCommitsPerUnit)
  );

  // 5. WorkUnit 데이터 생성
  return sized.map((group) => createWorkUnitData(group));
}

// ============================================
// 시간 기반 그룹핑
// ============================================

function groupByTimeGap(
  commits: CommitWithFiles[],
  maxGapHours: number
): CommitWithFiles[][] {
  if (commits.length === 0) return [];

  const groups: CommitWithFiles[][] = [];
  let currentGroup: CommitWithFiles[] = [commits[0]];

  for (let i = 1; i < commits.length; i++) {
    const prev = commits[i - 1];
    const curr = commits[i];
    const gapMs = curr.committedAt.getTime() - prev.committedAt.getTime();
    const gapHours = gapMs / (1000 * 60 * 60);

    if (gapHours <= maxGapHours) {
      currentGroup.push(curr);
    } else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

// ============================================
// 경로 유사도 기반 세분화
// ============================================

function refineByPathSimilarity(
  commits: CommitWithFiles[],
  minOverlap: number
): CommitWithFiles[][] {
  if (commits.length <= 1) return [commits];

  const groups: CommitWithFiles[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < commits.length; i++) {
    if (used.has(i)) continue;

    const group = [commits[i]];
    used.add(i);
    const basePaths = getFilePaths(commits[i]);

    for (let j = i + 1; j < commits.length; j++) {
      if (used.has(j)) continue;

      const similarity = calculatePathSimilarity(
        basePaths,
        getFilePaths(commits[j])
      );

      if (similarity >= minOverlap) {
        group.push(commits[j]);
        used.add(j);
      }
    }

    groups.push(group);
  }

  return groups;
}

// ============================================
// 경로 유사도 계산 (Jaccard Similarity)
// ============================================

function calculatePathSimilarity(pathsA: string[], pathsB: string[]): number {
  if (pathsA.length === 0 || pathsB.length === 0) return 0;

  // 디렉토리 수준으로 정규화
  const dirsA = new Set(pathsA.map(getDirectory));
  const dirsB = new Set(pathsB.map(getDirectory));

  const intersection = [...dirsA].filter((d) => dirsB.has(d)).length;
  const union = new Set([...dirsA, ...dirsB]).size;

  return union > 0 ? intersection / union : 0;
}

function getDirectory(path: string): string {
  const parts = path.split("/");
  return parts.slice(0, -1).join("/") || "/";
}

function getFilePaths(commit: CommitWithFiles): string[] {
  return commit.files.map((f) => f.path);
}

// ============================================
// 크기 제한 적용
// ============================================

function enforceSize(
  commits: CommitWithFiles[],
  maxSize: number,
  minSize: number
): CommitWithFiles[][] {
  // 최소 크기 미만이면 필터링 (단일 커밋도 허용)
  if (commits.length < minSize) {
    return commits.length > 0 ? [commits] : [];
  }

  // 최대 크기 초과면 분할
  if (commits.length <= maxSize) {
    return [commits];
  }

  const result: CommitWithFiles[][] = [];
  for (let i = 0; i < commits.length; i += maxSize) {
    result.push(commits.slice(i, i + maxSize));
  }

  return result;
}

// ============================================
// WorkUnit 데이터 생성
// ============================================

function createWorkUnitData(commits: CommitWithFiles[]): WorkUnitData {
  const sortedByTime = [...commits].sort(
    (a, b) => a.committedAt.getTime() - b.committedAt.getTime()
  );

  const allPaths = commits.flatMap((c) => c.files.map((f) => f.path));
  const pathCounts = new Map<string, number>();
  allPaths.forEach((p) => {
    pathCounts.set(p, (pathCounts.get(p) || 0) + 1);
  });

  // 빈도 기준 상위 5개 경로
  const primaryPaths = [...pathCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path]) => path);

  const additions = commits.reduce((sum, c) => sum + c.additions, 0);
  const deletions = commits.reduce((sum, c) => sum + c.deletions, 0);
  const filesChanged = new Set(allPaths).size;

  return {
    commits,
    startAt: sortedByTime[0].committedAt,
    endAt: sortedByTime[sortedByTime.length - 1].committedAt,
    primaryPaths,
    additions,
    deletions,
    filesChanged,
  };
}

// ============================================
// 유틸리티: 커밋 메시지에서 요약 생성
// ============================================

export function generateSummary(commits: CommitWithFiles[]): string {
  if (commits.length === 0) return "";

  // 첫 커밋 메시지의 첫 줄을 기본으로
  const firstMessage = commits[0].message.split("\n")[0];

  if (commits.length === 1) {
    return firstMessage;
  }

  // 여러 커밋인 경우 공통 키워드 추출
  const allMessages = commits.map((c) => c.message.split("\n")[0]);
  const words = allMessages.flatMap((m) => m.toLowerCase().split(/\s+/));
  const wordCounts = new Map<string, number>();

  words.forEach((w) => {
    if (w.length > 3) {
      // 짧은 단어 제외
      wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
    }
  });

  const commonWords = [...wordCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word);

  if (commonWords.length > 0) {
    return `${commits.length}개 커밋: ${commonWords.join(", ")} 관련 작업`;
  }

  return `${commits.length}개 커밋: ${firstMessage}`;
}

// ============================================
// 유틸리티: Hotfix/Revert 감지
// ============================================

export function detectHotfix(commits: CommitWithFiles[]): boolean {
  const hotfixPatterns = [
    /hotfix/i,
    /hot-fix/i,
    /emergency/i,
    /urgent/i,
    /critical/i,
  ];

  return commits.some((c) =>
    hotfixPatterns.some((p) => p.test(c.message))
  );
}

export function detectRevert(commits: CommitWithFiles[]): boolean {
  const revertPatterns = [/^revert/i, /revert:/i, /rollback/i];

  return commits.some((c) =>
    revertPatterns.some((p) => p.test(c.message))
  );
}

