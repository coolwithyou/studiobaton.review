/**
 * Stage 1: AI 코드 품질 분석
 * 
 * 샘플링된 커밋의 Diff를 분석하여 코드 품질을 평가합니다.
 * - 가독성
 * - 유지보수성
 * - 베스트 프랙티스 준수
 * - 강점/약점 도출
 */

import { callClaudeWithRetry, PROMPT_VERSION, type TokenUsage } from "../client";
import { db } from "@/lib/db";
import { getWorkUnitDiffs, summarizeDiff } from "@/lib/analysis/diff";
import type { Stage1Result } from "@/types";

// ============================================
// 시스템 프롬프트
// ============================================

const STAGE1_SYSTEM_PROMPT = `당신은 10년 이상 경력의 시니어 개발자입니다. 주어진 코드 변경사항(diff)을 분석하여 코드 품질을 평가해주세요.

# 평가 관점

## 1. 가독성 (Readability)
- 변수/함수명이 명확한가
- 코드 구조가 이해하기 쉬운가
- 적절한 주석이 있는가
- 일관된 코딩 스타일인가

## 2. 유지보수성 (Maintainability)
- 함수/클래스가 적절한 크기인가
- 중복 코드가 없는가
- 의존성이 잘 관리되는가
- 테스트하기 쉬운 구조인가

## 3. 베스트 프랙티스 (Best Practices)
- 에러 처리가 적절한가
- 보안 고려사항이 반영되었는가
- 성능 최적화가 되어있는가
- 타입 안전성이 확보되었는가

# 출력 형식
반드시 아래 JSON 형식으로만 응답해주세요:
\`\`\`json
{
  "codeQuality": {
    "score": 7,
    "readability": 8,
    "maintainability": 7,
    "bestPractices": 6
  },
  "strengths": [
    "강점 1",
    "강점 2"
  ],
  "weaknesses": [
    "약점 1",
    "약점 2"
  ],
  "codePatterns": [
    "발견된 코딩 패턴 1",
    "발견된 코딩 패턴 2"
  ],
  "suggestions": [
    "개선 제안 1",
    "개선 제안 2"
  ]
}
\`\`\`

# 점수 기준 (1-10)
- 9-10: 탁월함 - 모범적인 코드
- 7-8: 우수함 - 약간의 개선 여지
- 5-6: 보통 - 개선 필요
- 3-4: 미흡 - 상당한 개선 필요
- 1-2: 매우 미흡 - 전면 재작성 필요`;

// ============================================
// 메인 분석 함수
// ============================================

export async function analyzeCodeQuality(
  workUnitId: string
): Promise<{ result: Stage1Result; tokenUsage: TokenUsage }> {
  console.log(`[Stage1:analyzeCodeQuality] 분석 시작: ${workUnitId.substring(0, 8)}...`);

  // WorkUnit 정보 조회
  const workUnit = await db.workUnit.findUnique({
    where: { id: workUnitId },
    include: {
      repo: {
        select: { fullName: true, language: true },
      },
      commits: {
        include: {
          commit: {
            select: {
              sha: true,
              message: true,
            },
          },
        },
      },
    },
  });

  if (!workUnit) {
    throw new Error(`WorkUnit not found: ${workUnitId}`);
  }

  // Diff 조회
  const diffs = await getWorkUnitDiffs(workUnitId);

  if (diffs.length === 0) {
    // Diff가 없으면 기본 결과 반환
    return {
      result: getDefaultResult(),
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalCost: 0 },
    };
  }

  // Diff 요약 (토큰 제한)
  const summarizedDiffs = diffs.map(d => ({
    sha: d.sha.substring(0, 7),
    message: d.message.split('\n')[0],
    diff: summarizeDiff(d.diff, 80, 1500),
  }));

  const userPrompt = `
# 작업 정보
- 저장소: ${workUnit.repo.fullName}
- 언어: ${workUnit.repo.language || '알 수 없음'}
- 작업 유형: ${workUnit.workType || '일반'}
- 커밋 수: ${workUnit.commits.length}

# 코드 변경사항

${summarizedDiffs.map(d => `
## 커밋: ${d.sha} - ${d.message}
\`\`\`diff
${d.diff}
\`\`\`
`).join('\n')}

위 코드 변경사항을 분석하여 코드 품질을 평가해주세요.
`;

  const response = await callClaudeWithRetry<Stage1Result>({
    systemPrompt: STAGE1_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 2048,
  });

  // 결과 검증 및 정규화
  const result = normalizeResult(response.data);

  return {
    result,
    tokenUsage: response.tokenUsage,
  };
}

// ============================================
// WorkUnit 일괄 분석
// ============================================

export async function analyzeCodeQualityBatch(
  workUnitIds: string[]
): Promise<Map<string, { result: Stage1Result; tokenUsage: TokenUsage }>> {
  const results = new Map<string, { result: Stage1Result; tokenUsage: TokenUsage }>();

  for (const workUnitId of workUnitIds) {
    try {
      const analysis = await analyzeCodeQuality(workUnitId);
      results.set(workUnitId, analysis);

      // Rate limit 방지
      await sleep(500);
    } catch (error) {
      console.error(`Stage 1 분석 실패 (${workUnitId}):`, error);
      results.set(workUnitId, {
        result: getDefaultResult(),
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalCost: 0 },
      });
    }
  }

  return results;
}

// ============================================
// 분석 결과 저장
// ============================================

export async function saveStage1Result(
  workUnitId: string,
  result: Stage1Result,
  tokenUsage: TokenUsage
): Promise<void> {
  await db.aiReview.create({
    data: {
      workUnitId,
      stage: 1,
      promptVersion: PROMPT_VERSION,
      result: result as any,
      tokenUsage: tokenUsage as any,
    },
  });
}

// ============================================
// 분석 결과 조회
// ============================================

export async function getStage1Result(
  workUnitId: string
): Promise<Stage1Result | null> {
  const review = await db.aiReview.findFirst({
    where: {
      workUnitId,
      stage: 1,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return (review?.result as unknown as Stage1Result) || null;
}

// ============================================
// 결과 정규화
// ============================================

function normalizeResult(data: any): Stage1Result {
  return {
    codeQuality: {
      score: clamp(data?.codeQuality?.score || 5, 1, 10),
      readability: clamp(data?.codeQuality?.readability || 5, 1, 10),
      maintainability: clamp(data?.codeQuality?.maintainability || 5, 1, 10),
      bestPractices: clamp(data?.codeQuality?.bestPractices || 5, 1, 10),
    },
    strengths: ensureArray(data?.strengths),
    weaknesses: ensureArray(data?.weaknesses),
    codePatterns: ensureArray(data?.codePatterns),
    suggestions: ensureArray(data?.suggestions),
  };
}

function getDefaultResult(): Stage1Result {
  return {
    codeQuality: {
      score: 5,
      readability: 5,
      maintainability: 5,
      bestPractices: 5,
    },
    strengths: [],
    weaknesses: [],
    codePatterns: [],
    suggestions: [],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ensureArray(value: any): string[] {
  if (Array.isArray(value)) {
    return value.filter(item => typeof item === 'string');
  }
  return [];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// 병렬 처리 설정
// ============================================

const PARALLEL_CONCURRENCY = 5; // 동시 실행 개수

// ============================================
// Stage1 분석 진행 상황 타입
// ============================================

interface Stage1AnalysisProgress {
  total: number;
  completed: number;
  failed: number;
  inProgress: string[];
  recentResults: Array<{
    workUnitId: string;
    repoName: string;
    workType: string;
    score: number;
    completedAt: string;
  }>;
}

// ============================================
// 분석 진행 상황 DB 업데이트
// ============================================

async function updateStage1Progress(
  analysisRunId: string,
  progress: Stage1AnalysisProgress
): Promise<void> {
  try {
    const current = await db.analysisRun.findUnique({
      where: { id: analysisRunId },
      select: { progress: true },
    });

    const currentProgress = (current?.progress as any) || {};

    await db.analysisRun.update({
      where: { id: analysisRunId },
      data: {
        progress: {
          ...currentProgress,
          stage1Analysis: progress,
        },
      },
    });
  } catch (error) {
    console.error(`[Stage1] Failed to update progress:`, error);
  }
}

// ============================================
// 전체 분석 실행 (분석 Run 단위) - 병렬 처리
// ============================================

export async function runStage1Analysis(
  analysisRunId: string
): Promise<{ processed: number; failed: number; totalCost: number }> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[Stage1] 🚀 runStage1Analysis 시작: ${analysisRunId}`);
  console.log(`[Stage1] 시작 시간: ${new Date().toISOString()}`);
  console.log(`${"=".repeat(60)}\n`);

  // 샘플링된 WorkUnit 조회 (상세 정보 포함)
  const sampledWorkUnits = await db.workUnit.findMany({
    where: {
      analysisRunId,
      isSampled: true,
    },
    select: {
      id: true,
      workType: true,
      impactScore: true,
      repo: {
        select: { fullName: true },
      },
    },
  });

  // 이미 분석된 WorkUnit 제외
  const existingReviews = await db.aiReview.findMany({
    where: {
      workUnitId: { in: sampledWorkUnits.map(wu => wu.id) },
      stage: 1,
    },
    select: { workUnitId: true },
  });

  const analyzedIds = new Set(existingReviews.map(r => r.workUnitId));
  const toAnalyze = sampledWorkUnits.filter(wu => !analyzedIds.has(wu.id));

  const totalBatches = Math.ceil(toAnalyze.length / PARALLEL_CONCURRENCY);

  console.log(`\n[Stage1] ====== 병렬 분석 시작 (${PARALLEL_CONCURRENCY}개 동시) ======`);
  console.log(`[Stage1] 분석 대상: ${toAnalyze.length}개 (이미 완료: ${analyzedIds.size}개)`);
  console.log(`[Stage1] 총 ${totalBatches}개 배치로 처리 예정\n`);

  let processed = analyzedIds.size;
  let failed = 0;
  let totalCost = 0;
  const recentResults: Stage1AnalysisProgress['recentResults'] = [];

  // 초기 진행 상황 저장
  await updateStage1Progress(analysisRunId, {
    total: sampledWorkUnits.length,
    completed: processed,
    failed: 0,
    inProgress: [],
    recentResults: [],
  });

  // 병렬 처리 (동시에 PARALLEL_CONCURRENCY개씩)
  for (let i = 0; i < toAnalyze.length; i += PARALLEL_CONCURRENCY) {
    const batch = toAnalyze.slice(i, i + PARALLEL_CONCURRENCY);
    const batchNum = Math.floor(i / PARALLEL_CONCURRENCY) + 1;

    console.log(`[Stage1] --- Batch ${batchNum}/${totalBatches} 시작 ---`);

    // 분석 중인 WorkUnit ID 목록
    const inProgressIds = batch.map(wu => wu.id);

    // 진행 상황 업데이트 (분석 시작)
    await updateStage1Progress(analysisRunId, {
      total: sampledWorkUnits.length,
      completed: processed,
      failed,
      inProgress: inProgressIds,
      recentResults: recentResults.slice(-5),
    });

    // 배치 내 각 WorkUnit 분석 시작 로그
    batch.forEach((wu, idx) => {
      console.log(`[Stage1] [${idx + 1}/${batch.length}] 분석 중: "${wu.repo.fullName}" ${wu.workType || 'unknown'} (impact: ${wu.impactScore.toFixed(1)})`);
    });

    const batchStartTime = Date.now();
    let batchCost = 0;

    const results = await Promise.allSettled(
      batch.map(async (workUnit, idx) => {
        const startTime = Date.now();
        const { result, tokenUsage } = await analyzeCodeQuality(workUnit.id);
        await saveStage1Result(workUnit.id, result, tokenUsage);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        // 완료 로그
        const { score, readability, maintainability, bestPractices } = result.codeQuality;
        console.log(
          `[Stage1] [${idx + 1}/${batch.length}] ✓ 완료 (${elapsed}s): ` +
          `score=${score} (가독성:${readability}, 유지보수:${maintainability}, BP:${bestPractices})`
        );

        return {
          workUnitId: workUnit.id,
          repoName: workUnit.repo.fullName,
          workType: workUnit.workType || 'unknown',
          score,
          cost: tokenUsage.totalCost,
        };
      })
    );

    // 결과 집계
    for (const result of results) {
      if (result.status === 'fulfilled') {
        processed++;
        batchCost += result.value.cost;
        totalCost += result.value.cost;

        // 최근 결과에 추가
        recentResults.push({
          workUnitId: result.value.workUnitId,
          repoName: result.value.repoName,
          workType: result.value.workType,
          score: result.value.score,
          completedAt: new Date().toISOString(),
        });
      } else {
        console.error(`[Stage1] ✗ 분석 실패:`, result.reason);
        failed++;
      }
    }

    const batchElapsed = ((Date.now() - batchStartTime) / 1000).toFixed(1);
    console.log(
      `[Stage1] --- Batch ${batchNum}/${totalBatches} 완료 ` +
      `(${processed}/${sampledWorkUnits.length}, ${batchElapsed}s, cost: $${batchCost.toFixed(4)}) ---\n`
    );

    // 진행 상황 업데이트 (배치 완료)
    await updateStage1Progress(analysisRunId, {
      total: sampledWorkUnits.length,
      completed: processed,
      failed,
      inProgress: [],
      recentResults: recentResults.slice(-5),
    });

    // 배치 간 Rate limit 방지
    if (i + PARALLEL_CONCURRENCY < toAnalyze.length) {
      await sleep(500);
    }
  }

  console.log(`[Stage1] ====== 분석 완료 ======`);
  console.log(`[Stage1] 총 처리: ${processed}개, 실패: ${failed}개, 총 비용: $${totalCost.toFixed(4)}\n`);

  // Stage 1 완료 후 리포별 요약 업데이트
  try {
    await updateRepoSummariesWithInsights(analysisRunId);
    console.log(`[Stage1] Updated repo summaries with insights for ${analysisRunId}`);
  } catch (error) {
    console.error(`[Stage1] Failed to update repo summaries:`, error);
  }

  return { processed, failed, totalCost };
}

// ============================================
// 리포별 요약 업데이트 (Stage 1 완료 후)
// ============================================

export async function updateRepoSummariesWithInsights(
  analysisRunId: string
): Promise<void> {
  // 분석된 WorkUnit 조회
  const analyzedWorkUnits = await db.workUnit.findMany({
    where: { analysisRunId, isSampled: true },
    include: {
      aiReviews: { where: { stage: 1 } },
    },
  });

  // 리포별 그룹화
  const byRepo = new Map<string, typeof analyzedWorkUnits>();
  for (const wu of analyzedWorkUnits) {
    if (!byRepo.has(wu.repoId)) byRepo.set(wu.repoId, []);
    byRepo.get(wu.repoId)!.push(wu);
  }

  // 각 리포 요약 업데이트
  for (const [repoId, workUnits] of byRepo) {
    const stage1Results = workUnits
      .map(wu => wu.aiReviews[0]?.result as unknown as Stage1Result | undefined)
      .filter((r): r is Stage1Result => r !== undefined);

    if (stage1Results.length === 0) continue;

    // 평균 코드 품질 점수 계산
    const avgQuality = stage1Results.reduce(
      (sum, r) => sum + r.codeQuality.score, 0
    ) / stage1Results.length;

    // 주요 인사이트 추출
    const keyInsights = extractKeyInsights(stage1Results);

    // 리포 요약 업데이트
    try {
      await db.repoAnalysisSummary.update({
        where: { analysisRunId_repoId: { analysisRunId, repoId } },
        data: {
          avgCodeQuality: avgQuality,
          keyInsights: keyInsights,
        },
      });
    } catch (error) {
      // 리포 요약이 없는 경우 무시 (샘플링 시 생성되지 않았을 수 있음)
      console.warn(`[Stage1] No repo summary found for ${repoId}, skipping update`);
    }
  }
}

/**
 * Stage 1 결과에서 주요 인사이트 추출
 */
function extractKeyInsights(results: Stage1Result[]): string[] {
  const allStrengths = results.flatMap(r => r.strengths);
  const allPatterns = results.flatMap(r => r.codePatterns);
  const allWeaknesses = results.flatMap(r => r.weaknesses);

  // 빈도 기반 상위 인사이트 추출
  const frequency = new Map<string, number>();
  [...allStrengths, ...allPatterns].forEach(s => {
    if (s && s.trim()) {
      frequency.set(s, (frequency.get(s) || 0) + 1);
    }
  });

  // 강점/패턴에서 상위 3개
  const topPositive = [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([insight]) => `✓ ${insight}`);

  // 약점에서 상위 2개 (개선점으로 표시)
  const weaknessFrequency = new Map<string, number>();
  allWeaknesses.forEach(s => {
    if (s && s.trim()) {
      weaknessFrequency.set(s, (weaknessFrequency.get(s) || 0) + 1);
    }
  });

  const topWeaknesses = [...weaknessFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([insight]) => `△ ${insight}`);

  return [...topPositive, ...topWeaknesses].slice(0, 5);
}

