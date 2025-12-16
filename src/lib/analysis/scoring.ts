/**
 * 임팩트 스코어링 모듈
 * 
 * WorkUnit의 영향력을 다양한 요소를 고려하여 점수화합니다.
 * - 코드 변경량 (LoC)
 * - 핵심 모듈 가중치
 * - 핫스팟 가중치
 * - 테스트 비율
 * - 설정/스키마 변경
 */

import { db } from "@/lib/db";
import type { WorkUnitData, ImpactFactors, OrgSettings } from "@/types";

// ============================================
// 기본 설정
// ============================================

const DEFAULT_CRITICAL_PATHS = [
  { pattern: 'src/core/', weight: 2.0, label: '핵심 비즈니스 로직' },
  { pattern: 'src/lib/', weight: 1.5, label: '공통 라이브러리' },
  { pattern: 'src/api/', weight: 1.5, label: 'API 엔드포인트' },
  { pattern: 'prisma/', weight: 1.8, label: '데이터베이스 스키마' },
  { pattern: 'src/components/ui/', weight: 1.0, label: 'UI 컴포넌트' },
];

const CONFIG_PATTERNS = [
  'package.json',
  'tsconfig.json',
  '.eslintrc',
  'next.config',
  'tailwind.config',
  '.env',
  'docker',
  'Dockerfile',
];

const SCHEMA_PATTERNS = [
  'prisma/schema.prisma',
  'schema.sql',
  'migrations/',
  'db/schema',
];

const TEST_PATTERNS = [
  '__tests__/',
  '.test.',
  '.spec.',
  'test/',
  'tests/',
  'cypress/',
  'e2e/',
];

// ============================================
// 메인 스코어링 함수
// ============================================

export async function calculateImpactScore(
  workUnit: WorkUnitData,
  orgId: string
): Promise<{ impactScore: number; impactFactors: ImpactFactors }> {
  // 조직 설정 가져오기
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { settings: true },
  });

  const orgSettings = (org?.settings as OrgSettings) || {};
  const criticalPaths = orgSettings.criticalPaths || DEFAULT_CRITICAL_PATHS;

  // 모든 파일 경로 수집
  const allFiles = workUnit.commits.flatMap(c => c.files);
  const allPaths = allFiles.map(f => f.path);
  const uniquePaths = [...new Set(allPaths)];

  // 각 요소 계산
  const baseScore = calculateBaseScore(workUnit.totalAdditions, workUnit.totalDeletions);
  const sizeScore = calculateSizeScore(workUnit.totalAdditions, workUnit.totalDeletions);
  const coreModuleBonus = calculateCoreModuleBonus(uniquePaths, criticalPaths);
  const hotspotBonus = await calculateHotspotBonus(workUnit.repoId, uniquePaths);
  const testScore = calculateTestScore(allFiles);
  const configBonus = calculateConfigBonus(uniquePaths);

  const impactFactors: ImpactFactors = {
    baseScore: round(baseScore),
    sizeScore: round(sizeScore),
    coreModuleBonus: round(coreModuleBonus),
    hotspotBonus: round(hotspotBonus),
    testScore: round(testScore),
    configBonus: round(configBonus),
  };

  const impactScore = round(
    baseScore + sizeScore + coreModuleBonus + hotspotBonus + testScore + configBonus
  );

  return { impactScore, impactFactors };
}

// ============================================
// 기본 점수 (LoC 기반)
// ============================================

function calculateBaseScore(additions: number, deletions: number): number {
  const totalLoc = additions + deletions;
  const cappedLoc = Math.min(totalLoc, 500); // 500줄 캡

  // log10(LoC + 1) * 10
  if (cappedLoc <= 0) return 0;
  return Math.log10(cappedLoc + 1) * 10;
}

// ============================================
// 규모 점수
// ============================================

function calculateSizeScore(additions: number, deletions: number): number {
  const totalLoc = additions + deletions;
  const cappedLoc = Math.min(totalLoc, 500);

  // min(LoC / 100, 5)
  return Math.min(cappedLoc / 100, 5);
}

// ============================================
// 핵심 모듈 보너스
// ============================================

function calculateCoreModuleBonus(
  paths: string[],
  criticalPaths: Array<{ pattern: string; weight: number }>
): number {
  let bonus = 0;

  for (const path of paths) {
    for (const critical of criticalPaths) {
      if (matchPattern(path, critical.pattern)) {
        bonus += critical.weight;
      }
    }
  }

  // 최대 10점 캡
  return Math.min(bonus, 10);
}

function matchPattern(path: string, pattern: string): boolean {
  // 간단한 패턴 매칭 (glob 스타일이 아닌 포함 여부)
  const normalizedPath = path.toLowerCase();
  const normalizedPattern = pattern.toLowerCase().replace(/\*+/g, '');
  
  return normalizedPath.includes(normalizedPattern);
}

// ============================================
// 핫스팟 보너스 (자주 변경되는 파일)
// ============================================

async function calculateHotspotBonus(
  repoId: string,
  paths: string[]
): Promise<number> {
  // 최근 3개월간 가장 많이 변경된 파일 조회
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const hotspotFiles = await db.commitFile.groupBy({
    by: ['path'],
    where: {
      commit: {
        repoId,
        committedAt: { gte: threeMonthsAgo },
      },
    },
    _count: { path: true },
    orderBy: { _count: { path: 'desc' } },
    take: 20,
  });

  const hotspotPaths = new Set(hotspotFiles.map(f => f.path));

  // 현재 WorkUnit에서 핫스팟 파일과 겹치는 수
  const hotspotCount = paths.filter(p => hotspotPaths.has(p)).length;

  // 핫스팟당 1.5점, 최대 5점
  return Math.min(hotspotCount * 1.5, 5);
}

// ============================================
// 테스트 점수
// ============================================

function calculateTestScore(
  files: Array<{ path: string; additions: number; deletions: number }>
): number {
  const testFiles = files.filter(f => 
    TEST_PATTERNS.some(p => f.path.includes(p))
  );
  const sourceFiles = files.filter(f => 
    !TEST_PATTERNS.some(p => f.path.includes(p))
  );

  const totalFiles = files.length;
  if (totalFiles === 0) return 0;

  const testRatio = testFiles.length / totalFiles;

  // 테스트 비율에 따른 점수
  if (testRatio > 0.8) {
    // 테스트만 너무 많으면 감점
    return -3;
  } else if (testRatio > 0.5) {
    // 테스트가 절반 이상이면 약간의 보너스
    return 1;
  } else if (testRatio > 0) {
    // 적절한 테스트 포함 시 보너스
    return 2;
  }

  return 0;
}

// ============================================
// 설정/스키마 변경 보너스
// ============================================

function calculateConfigBonus(paths: string[]): number {
  let bonus = 0;

  const hasConfig = paths.some(p => 
    CONFIG_PATTERNS.some(pattern => p.toLowerCase().includes(pattern.toLowerCase()))
  );

  const hasSchema = paths.some(p =>
    SCHEMA_PATTERNS.some(pattern => p.toLowerCase().includes(pattern.toLowerCase()))
  );

  if (hasConfig) bonus += 1.3;
  if (hasSchema) bonus += 1.8;

  return bonus;
}

// ============================================
// 일괄 스코어링
// ============================================

export async function scoreAllWorkUnits(
  workUnits: WorkUnitData[],
  orgId: string
): Promise<WorkUnitData[]> {
  const scoredWorkUnits: WorkUnitData[] = [];

  for (const workUnit of workUnits) {
    const { impactScore, impactFactors } = await calculateImpactScore(workUnit, orgId);
    
    scoredWorkUnits.push({
      ...workUnit,
      impactScore,
      impactFactors,
    });
  }

  // 점수 기준 내림차순 정렬
  return scoredWorkUnits.sort((a, b) => b.impactScore - a.impactScore);
}

// ============================================
// DB의 WorkUnit 점수 업데이트
// ============================================

export async function updateWorkUnitScores(
  analysisRunId: string,
  orgId: string
): Promise<void> {
  // 해당 분석의 모든 WorkUnit 조회
  const workUnits = await db.workUnit.findMany({
    where: { analysisRunId },
    include: {
      commits: {
        include: {
          commit: {
            include: {
              files: true,
            },
          },
        },
      },
      repo: true,
    },
  });

  // 조직 설정 가져오기
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { settings: true },
  });

  const orgSettings = (org?.settings as OrgSettings) || {};
  const criticalPaths = orgSettings.criticalPaths || DEFAULT_CRITICAL_PATHS;

  for (const workUnit of workUnits) {
    // WorkUnit의 모든 파일 경로 수집
    const allFiles = workUnit.commits.flatMap(wuc => 
      wuc.commit.files.map(f => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
      }))
    );
    const allPaths = allFiles.map(f => f.path);
    const uniquePaths = [...new Set(allPaths)];

    // 총계 계산
    const totalAdditions = allFiles.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = allFiles.reduce((sum, f) => sum + f.deletions, 0);

    // 각 요소 계산
    const baseScore = calculateBaseScore(totalAdditions, totalDeletions);
    const sizeScore = calculateSizeScore(totalAdditions, totalDeletions);
    const coreModuleBonus = calculateCoreModuleBonus(uniquePaths, criticalPaths);
    const hotspotBonus = await calculateHotspotBonus(workUnit.repoId, uniquePaths);
    const testScore = calculateTestScore(allFiles);
    const configBonus = calculateConfigBonus(uniquePaths);

    const impactFactors: ImpactFactors = {
      baseScore: round(baseScore),
      sizeScore: round(sizeScore),
      coreModuleBonus: round(coreModuleBonus),
      hotspotBonus: round(hotspotBonus),
      testScore: round(testScore),
      configBonus: round(configBonus),
    };

    const impactScore = round(
      baseScore + sizeScore + coreModuleBonus + hotspotBonus + testScore + configBonus
    );

    // DB 업데이트
    await db.workUnit.update({
      where: { id: workUnit.id },
      data: {
        impactScore,
        impactFactors: impactFactors as any,
      },
    });
  }
}

// ============================================
// 임팩트 점수 분포 분석
// ============================================

export interface ScoreDistribution {
  min: number;
  max: number;
  avg: number;
  median: number;
  percentiles: {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
  buckets: Array<{ range: string; count: number }>;
}

export function analyzeScoreDistribution(workUnits: WorkUnitData[]): ScoreDistribution {
  if (workUnits.length === 0) {
    return {
      min: 0,
      max: 0,
      avg: 0,
      median: 0,
      percentiles: { p25: 0, p50: 0, p75: 0, p90: 0 },
      buckets: [],
    };
  }

  const scores = workUnits.map(wu => wu.impactScore).sort((a, b) => a - b);
  const n = scores.length;

  const min = scores[0];
  const max = scores[n - 1];
  const avg = round(scores.reduce((a, b) => a + b, 0) / n);
  const median = scores[Math.floor(n / 2)];

  const percentiles = {
    p25: scores[Math.floor(n * 0.25)],
    p50: scores[Math.floor(n * 0.5)],
    p75: scores[Math.floor(n * 0.75)],
    p90: scores[Math.floor(n * 0.9)],
  };

  // 버킷 분포
  const buckets = [
    { range: '0-5', count: scores.filter(s => s >= 0 && s < 5).length },
    { range: '5-10', count: scores.filter(s => s >= 5 && s < 10).length },
    { range: '10-15', count: scores.filter(s => s >= 10 && s < 15).length },
    { range: '15-20', count: scores.filter(s => s >= 15 && s < 20).length },
    { range: '20-25', count: scores.filter(s => s >= 20 && s < 25).length },
    { range: '25+', count: scores.filter(s => s >= 25).length },
  ];

  return {
    min: round(min),
    max: round(max),
    avg,
    median: round(median),
    percentiles,
    buckets,
  };
}

// ============================================
// 유틸리티
// ============================================

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// ============================================
// 상위 WorkUnit 선택 (AI 샘플링용)
// ============================================

export function selectTopWorkUnits(
  workUnits: WorkUnitData[],
  count: number = 10
): WorkUnitData[] {
  // 점수 기준 내림차순 정렬 후 상위 선택
  return [...workUnits]
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, count);
}

// ============================================
// 작업 유형별 대표 WorkUnit 선택
// ============================================

export function selectRepresentativeWorkUnits(
  workUnits: WorkUnitData[],
  countPerType: number = 2
): WorkUnitData[] {
  const byType = new Map<string, WorkUnitData[]>();

  workUnits.forEach(wu => {
    if (!byType.has(wu.workType)) {
      byType.set(wu.workType, []);
    }
    byType.get(wu.workType)!.push(wu);
  });

  const selected: WorkUnitData[] = [];

  byType.forEach((typeWorkUnits, type) => {
    // 각 유형에서 상위 N개 선택
    const sorted = typeWorkUnits.sort((a, b) => b.impactScore - a.impactScore);
    selected.push(...sorted.slice(0, countPerType));
  });

  return selected;
}

