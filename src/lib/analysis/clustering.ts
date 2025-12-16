/**
 * WorkUnit 클러스터링 모듈
 * 
 * 관련 커밋들을 의미 있는 작업 단위(WorkUnit)로 그룹화합니다.
 * - 시간 기반 초기 그룹핑 (기본 8시간 이내)
 * - 경로 유사도 기반 세분화 (Jaccard Similarity)
 */

import { db } from "@/lib/db";
import { detectWorkType } from "./metrics";
import type { WorkUnitData, WorkType, ImpactFactors } from "@/types";

// ============================================
// 클러스터링 설정
// ============================================

export interface ClusteringConfig {
  maxTimeGapHours: number;      // 기본 8시간
  minPathOverlap: number;       // 기본 0.3 (Jaccard)
  maxCommitsPerUnit: number;    // 기본 50
  minCommitsPerUnit: number;    // 기본 1
}

const DEFAULT_CONFIG: ClusteringConfig = {
  maxTimeGapHours: 8,
  minPathOverlap: 0.3,
  maxCommitsPerUnit: 50,
  minCommitsPerUnit: 1,
};

// ============================================
// 커밋 타입 정의
// ============================================

interface CommitWithFiles {
  id: string;
  sha: string;
  message: string;
  additions: number;
  deletions: number;
  filesChanged: number;
  committedAt: Date;
  files: Array<{
    path: string;
    additions: number;
    deletions: number;
    status: string;
  }>;
  repo: {
    id: string;
    fullName: string;
  };
}

// ============================================
// 메인 클러스터링 함수
// ============================================

export async function clusterCommitsIntoWorkUnits(
  orgId: string,
  userLogin: string,
  year: number,
  config: Partial<ClusteringConfig> = {}
): Promise<WorkUnitData[]> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  const startDate = new Date(`${year}-01-01T00:00:00Z`);
  const endDate = new Date(`${year}-12-31T23:59:59Z`);

  // 커밋 조회
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
      repo: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
    orderBy: {
      committedAt: 'asc',
    },
  });

  if (commits.length === 0) {
    return [];
  }

  // 저장소별로 그룹화
  const commitsByRepo = groupByRepo(commits);

  const allWorkUnits: WorkUnitData[] = [];

  // 각 저장소별로 클러스터링
  for (const [repoId, repoCommits] of commitsByRepo.entries()) {
    const repoWorkUnits = clusterRepoCommits(
      repoCommits as CommitWithFiles[],
      userLogin,
      finalConfig
    );
    allWorkUnits.push(...repoWorkUnits);
  }

  return allWorkUnits;
}

// ============================================
// 저장소별 그룹화
// ============================================

function groupByRepo(commits: any[]): Map<string, any[]> {
  const byRepo = new Map<string, any[]>();
  
  commits.forEach(commit => {
    const repoId = commit.repo.id;
    if (!byRepo.has(repoId)) {
      byRepo.set(repoId, []);
    }
    byRepo.get(repoId)!.push(commit);
  });

  return byRepo;
}

// ============================================
// 저장소 내 커밋 클러스터링
// ============================================

function clusterRepoCommits(
  commits: CommitWithFiles[],
  userLogin: string,
  config: ClusteringConfig
): WorkUnitData[] {
  if (commits.length === 0) return [];

  // Step 1: 시간순 정렬 (이미 정렬되어 있지만 확인)
  const sortedCommits = [...commits].sort(
    (a, b) => a.committedAt.getTime() - b.committedAt.getTime()
  );

  // Step 2: 시간 기반 초기 그룹핑
  const timeGroups = groupByTimeGap(sortedCommits, config.maxTimeGapHours);

  // Step 3: 경로 유사도로 세분화
  const refinedGroups: CommitWithFiles[][] = [];
  
  for (const group of timeGroups) {
    const subGroups = refineByPathSimilarity(group, config.minPathOverlap);
    refinedGroups.push(...subGroups);
  }

  // Step 4: 크기 제한 적용
  const sizedGroups = applySizeLimits(refinedGroups, config);

  // Step 5: WorkUnitData 생성
  const workUnits = sizedGroups.map((group, index) => 
    createWorkUnitData(group, userLogin, index)
  );

  return workUnits;
}

// ============================================
// 시간 간격 기반 그룹핑
// ============================================

function groupByTimeGap(
  commits: CommitWithFiles[],
  maxTimeGapHours: number
): CommitWithFiles[][] {
  if (commits.length === 0) return [];

  const maxGapMs = maxTimeGapHours * 60 * 60 * 1000;
  const groups: CommitWithFiles[][] = [];
  let currentGroup: CommitWithFiles[] = [commits[0]];

  for (let i = 1; i < commits.length; i++) {
    const prevCommit = commits[i - 1];
    const currCommit = commits[i];
    const timeGap = currCommit.committedAt.getTime() - prevCommit.committedAt.getTime();

    if (timeGap <= maxGapMs) {
      currentGroup.push(currCommit);
    } else {
      groups.push(currentGroup);
      currentGroup = [currCommit];
    }
  }

  groups.push(currentGroup);
  return groups;
}

// ============================================
// 경로 유사도 기반 세분화
// ============================================

function refineByPathSimilarity(
  commits: CommitWithFiles[],
  minPathOverlap: number
): CommitWithFiles[][] {
  if (commits.length <= 1) return [commits];

  // 각 커밋의 디렉토리 집합 계산
  const commitDirs = commits.map(commit => 
    new Set(commit.files.map(f => getDirectory(f.path)))
  );

  // Union-Find 스타일로 클러스터링
  const clusters: number[] = commits.map((_, i) => i);

  function find(i: number): number {
    if (clusters[i] !== i) {
      clusters[i] = find(clusters[i]);
    }
    return clusters[i];
  }

  function union(i: number, j: number) {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) {
      clusters[rootJ] = rootI;
    }
  }

  // 인접한 커밋 간 유사도 계산 및 병합
  for (let i = 0; i < commits.length - 1; i++) {
    const similarity = jaccardSimilarity(commitDirs[i], commitDirs[i + 1]);
    if (similarity >= minPathOverlap) {
      union(i, i + 1);
    }
  }

  // 클러스터별로 그룹화
  const groupMap = new Map<number, CommitWithFiles[]>();
  
  for (let i = 0; i < commits.length; i++) {
    const root = find(i);
    if (!groupMap.has(root)) {
      groupMap.set(root, []);
    }
    groupMap.get(root)!.push(commits[i]);
  }

  return Array.from(groupMap.values());
}

// ============================================
// 유틸리티 함수
// ============================================

function getDirectory(filePath: string): string {
  const parts = filePath.split('/');
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/');
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

// ============================================
// 크기 제한 적용
// ============================================

function applySizeLimits(
  groups: CommitWithFiles[][],
  config: ClusteringConfig
): CommitWithFiles[][] {
  const result: CommitWithFiles[][] = [];

  for (const group of groups) {
    // 최소 크기 미달
    if (group.length < config.minCommitsPerUnit) {
      continue; // 또는 이전 그룹에 병합할 수 있음
    }

    // 최대 크기 초과 시 분할
    if (group.length > config.maxCommitsPerUnit) {
      for (let i = 0; i < group.length; i += config.maxCommitsPerUnit) {
        result.push(group.slice(i, i + config.maxCommitsPerUnit));
      }
    } else {
      result.push(group);
    }
  }

  return result;
}

// ============================================
// WorkUnitData 생성
// ============================================

function createWorkUnitData(
  commits: CommitWithFiles[],
  userLogin: string,
  index: number
): WorkUnitData {
  const repoId = commits[0].repo.id;
  const repoFullName = commits[0].repo.fullName;

  // 시간 범위
  const sortedByTime = [...commits].sort(
    (a, b) => a.committedAt.getTime() - b.committedAt.getTime()
  );
  const startDate = sortedByTime[0].committedAt;
  const endDate = sortedByTime[sortedByTime.length - 1].committedAt;

  // 총계
  const totalAdditions = commits.reduce((sum, c) => sum + c.additions, 0);
  const totalDeletions = commits.reduce((sum, c) => sum + c.deletions, 0);
  const totalFilesChanged = commits.reduce((sum, c) => sum + c.filesChanged, 0);

  // 주요 경로 (가장 많이 변경된 디렉토리)
  const pathCounts = new Map<string, number>();
  commits.forEach(commit => {
    commit.files.forEach(file => {
      const dir = getDirectory(file.path);
      if (dir) {
        pathCounts.set(dir, (pathCounts.get(dir) || 0) + 1);
      }
    });
  });

  const primaryPaths = Array.from(pathCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path]) => path);

  // 작업 유형 추론 (가장 빈번한 유형)
  const typeCounts = new Map<string, number>();
  commits.forEach(commit => {
    const type = detectWorkType(commit.message);
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  });

  let workType: WorkType = 'unknown';
  let maxCount = 0;
  typeCounts.forEach((count, type) => {
    if (count > maxCount) {
      maxCount = count;
      workType = type as WorkType;
    }
  });

  // 기본 임팩트 점수 계산 (상세 스코어링은 별도 모듈에서)
  const impactFactors = calculateBasicImpactFactors(
    totalAdditions,
    totalDeletions,
    primaryPaths
  );

  const impactScore = Object.values(impactFactors).reduce((a, b) => a + b, 0);

  return {
    id: `workunit-${index}-${Date.now()}`, // 임시 ID, DB 저장 시 실제 ID 부여
    userLogin,
    repoId,
    repoFullName,
    workType,
    impactScore,
    impactFactors,
    commits: commits.map(c => ({
      sha: c.sha,
      message: c.message,
      additions: c.additions,
      deletions: c.deletions,
      filesChanged: c.filesChanged,
      committedAt: c.committedAt,
      files: c.files.map(f => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        status: f.status,
      })),
    })),
    startDate,
    endDate,
    totalAdditions,
    totalDeletions,
    totalFilesChanged,
    primaryPaths,
  };
}

// ============================================
// 기본 임팩트 점수 계산
// ============================================

function calculateBasicImpactFactors(
  additions: number,
  deletions: number,
  primaryPaths: string[]
): ImpactFactors {
  const totalLoc = additions + deletions;
  const cappedLoc = Math.min(totalLoc, 500);

  // 기본 점수: log10(LoC) * 10
  const baseScore = cappedLoc > 0 ? Math.log10(cappedLoc + 1) * 10 : 0;

  // 규모 점수: min(LoC/100, 5)
  const sizeScore = Math.min(cappedLoc / 100, 5);

  // 핵심 모듈 보너스 (기본값, 나중에 조직 설정에서 가져옴)
  let coreModuleBonus = 0;
  const corePatterns = ['src/core', 'src/api', 'lib/', 'prisma/'];
  for (const path of primaryPaths) {
    if (corePatterns.some(pattern => path.includes(pattern))) {
      coreModuleBonus += 1;
    }
  }
  coreModuleBonus = Math.min(coreModuleBonus, 5);

  // 핫스팟 보너스 (기본값)
  const hotspotBonus = 0; // 나중에 계산

  // 테스트 점수
  const hasTest = primaryPaths.some(p => 
    p.includes('test') || p.includes('spec') || p.includes('__tests__')
  );
  const testScore = hasTest ? 2 : 0;

  // 설정 파일 보너스
  const configPatterns = ['package.json', 'tsconfig', '.eslintrc', 'prisma/schema'];
  const hasConfig = primaryPaths.some(p =>
    configPatterns.some(pattern => p.includes(pattern))
  );
  const configBonus = hasConfig ? 1.5 : 0;

  return {
    baseScore: Math.round(baseScore * 100) / 100,
    sizeScore: Math.round(sizeScore * 100) / 100,
    coreModuleBonus,
    hotspotBonus,
    testScore,
    configBonus,
  };
}

// ============================================
// DB에 WorkUnit 저장
// ============================================

export async function saveWorkUnitsToDb(
  analysisRunId: string,
  workUnits: WorkUnitData[]
): Promise<void> {
  for (const workUnit of workUnits) {
    // WorkUnit 생성
    const savedWorkUnit = await db.workUnit.create({
      data: {
        analysisRunId,
        userLogin: workUnit.userLogin,
        repoId: workUnit.repoId,
        workType: workUnit.workType,
        impactScore: workUnit.impactScore,
        impactFactors: workUnit.impactFactors as any,
        startDate: workUnit.startDate,
        endDate: workUnit.endDate,
      },
    });

    // WorkUnitCommit 연결
    const commitIds = await Promise.all(
      workUnit.commits.map(async (commit) => {
        const found = await db.commit.findFirst({
          where: {
            sha: commit.sha,
            repoId: workUnit.repoId,
          },
          select: { id: true },
        });
        return found?.id;
      })
    );

    const validCommitIds = commitIds.filter((id): id is string => id !== undefined);

    if (validCommitIds.length > 0) {
      await db.workUnitCommit.createMany({
        data: validCommitIds.map(commitId => ({
          workUnitId: savedWorkUnit.id,
          commitId,
        })),
        skipDuplicates: true,
      });
    }
  }
}

// ============================================
// 클러스터링 통계
// ============================================

export interface ClusteringStats {
  totalCommits: number;
  totalWorkUnits: number;
  avgCommitsPerUnit: number;
  avgImpactScore: number;
  workTypeDistribution: Record<string, number>;
}

export function calculateClusteringStats(workUnits: WorkUnitData[]): ClusteringStats {
  const totalCommits = workUnits.reduce((sum, wu) => sum + wu.commits.length, 0);
  const totalWorkUnits = workUnits.length;
  const avgCommitsPerUnit = totalWorkUnits > 0 ? totalCommits / totalWorkUnits : 0;
  const avgImpactScore = totalWorkUnits > 0
    ? workUnits.reduce((sum, wu) => sum + wu.impactScore, 0) / totalWorkUnits
    : 0;

  const workTypeDistribution: Record<string, number> = {};
  workUnits.forEach(wu => {
    workTypeDistribution[wu.workType] = (workTypeDistribution[wu.workType] || 0) + 1;
  });

  return {
    totalCommits,
    totalWorkUnits,
    avgCommitsPerUnit: Math.round(avgCommitsPerUnit * 100) / 100,
    avgImpactScore: Math.round(avgImpactScore * 100) / 100,
    workTypeDistribution,
  };
}

