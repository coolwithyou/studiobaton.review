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
// 전체 분석 실행 (분석 Run 단위)
// ============================================

export async function runStage1Analysis(
  analysisRunId: string
): Promise<{ processed: number; failed: number; totalCost: number }> {
  // 샘플링된 WorkUnit 조회
  const sampledWorkUnits = await db.workUnit.findMany({
    where: {
      analysisRunId,
      isSampled: true,
    },
    select: { id: true },
  });

  let processed = 0;
  let failed = 0;
  let totalCost = 0;

  for (const workUnit of sampledWorkUnits) {
    try {
      // 이미 분석된 경우 스킵
      const existing = await db.aiReview.findFirst({
        where: {
          workUnitId: workUnit.id,
          stage: 1,
        },
      });

      if (existing) {
        processed++;
        continue;
      }

      const { result, tokenUsage } = await analyzeCodeQuality(workUnit.id);
      await saveStage1Result(workUnit.id, result, tokenUsage);

      processed++;
      totalCost += tokenUsage.totalCost;

      // Rate limit 방지
      await sleep(1000);
    } catch (error) {
      console.error(`Stage 1 분석 실패:`, error);
      failed++;
    }
  }

  return { processed, failed, totalCost };
}

