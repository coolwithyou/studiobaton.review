/**
 * Stage 3: AI 성장 포인트 도출
 * 
 * Stage 1, 2 결과를 바탕으로 개발자의 개선 영역과 성장 기회를 도출합니다.
 * - 구체적인 개선 영역
 * - 학습 기회
 * - 강점
 * - 커리어 성장 제안
 */

import { callClaudeWithRetry, PROMPT_VERSION, type TokenUsage } from "../client";
import { db } from "@/lib/db";
import type { Stage1Result, Stage2Result, Stage3Result, DeveloperMetrics } from "@/types";

// ============================================
// 시스템 프롬프트
// ============================================

const STAGE3_SYSTEM_PROMPT = `당신은 개발자 코칭 전문가입니다. 코드 품질 분석과 작업 패턴 분석 결과를 바탕으로 개발자의 성장 포인트를 도출해주세요.

# 분석 관점

## 1. 개선 영역 (Areas for Improvement)
- 코드 품질에서 부족한 부분
- 작업 패턴에서 개선이 필요한 습관
- 우선순위를 명확히 제시

## 2. 학습 기회 (Learning Opportunities)
- 현재 수준에서 다음 단계로 나아갈 수 있는 학습 주제
- 관련 기술이나 도구 추천
- 구체적인 학습 리소스 제안

## 3. 강점 활용 (Strengths)
- 이미 잘하고 있는 부분
- 강점을 더 발휘할 수 있는 방법
- 팀에 기여할 수 있는 포인트

## 4. 커리어 성장 (Career Growth)
- 장기적인 성장 방향 제안
- 다음 레벨로 가기 위한 조언
- 새로운 도전 영역 제안

# 출력 형식
반드시 아래 JSON 형식으로만 응답해주세요:
\`\`\`json
{
  "areasForImprovement": [
    {
      "area": "개선 영역 이름",
      "priority": "high" | "medium" | "low",
      "specificFeedback": "구체적인 피드백",
      "suggestedResources": ["추천 리소스 1", "추천 리소스 2"]
    }
  ],
  "learningOpportunities": [
    "학습 기회 1",
    "학습 기회 2"
  ],
  "strengths": [
    "강점 1",
    "강점 2"
  ],
  "careerGrowthSuggestions": [
    "커리어 성장 제안 1",
    "커리어 성장 제안 2"
  ]
}
\`\`\`

# 피드백 원칙
1. 구체적이고 실행 가능한 조언 제공
2. 비판보다는 건설적인 피드백 중심
3. 현실적이고 달성 가능한 목표 제시
4. 개인의 강점을 인정하고 활용 방안 제시
5. 한국어 개발자 환경을 고려한 리소스 추천`;

// ============================================
// 메인 분석 함수
// ============================================

export async function analyzeGrowthPoints(
  userLogin: string,
  stage1Summary: Stage1Summary,
  stage2Result: Stage2Result,
  metrics: DeveloperMetrics
): Promise<{ result: Stage3Result; tokenUsage: TokenUsage }> {
  const userPrompt = `
# 개발자 정보
- GitHub ID: ${userLogin}

# Stage 1: 코드 품질 분석 결과
- 평균 점수: ${stage1Summary.avgScore}/10
- 가독성: ${stage1Summary.avgReadability}/10
- 유지보수성: ${stage1Summary.avgMaintainability}/10
- 베스트 프랙티스: ${stage1Summary.avgBestPractices}/10

## 공통 강점
${stage1Summary.commonStrengths.map(s => `- ${s}`).join('\n') || '- 데이터 부족'}

## 공통 약점
${stage1Summary.commonWeaknesses.map(w => `- ${w}`).join('\n') || '- 데이터 부족'}

## 발견된 코딩 패턴
${stage1Summary.commonPatterns.map(p => `- ${p}`).join('\n') || '- 데이터 부족'}

# Stage 2: 작업 패턴 분석 결과
- 작업 스타일: ${stage2Result.workStyle.type}
  - ${stage2Result.workStyle.description}
- 협업 패턴: ${stage2Result.collaborationPattern.type}
  - ${stage2Result.collaborationPattern.description}

## 생산성 인사이트
${stage2Result.productivityInsights.map(i => `- ${i}`).join('\n') || '- 데이터 부족'}

## 시간 관리 피드백
${stage2Result.timeManagementFeedback}

# 정량 메트릭 요약
- 연간 커밋: ${metrics.productivity.totalCommits}
- 작업일: ${metrics.productivity.workingDays}일
- 기여 저장소: ${metrics.diversity.repositoryCount}개
- 주력 저장소: ${metrics.diversity.primaryRepository.name} (${metrics.diversity.primaryRepository.percentage}%)
- PR 참여율: ${metrics.prActivity.prParticipationRate}%
- Conventional Commits: ${metrics.commitQuality.conventionalCommitsRate}%
- 테스트 커밋 비율: ${metrics.commitQuality.testCommitRate}%

위 분석 결과를 바탕으로 이 개발자의 성장 포인트를 도출해주세요.
개선 영역은 최대 5개, 학습 기회는 3-5개, 강점은 3-5개, 커리어 성장 제안은 2-3개로 제한해주세요.
`;

  const response = await callClaudeWithRetry<Stage3Result>({
    systemPrompt: STAGE3_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 3000,
  });

  const result = normalizeResult(response.data);

  return {
    result,
    tokenUsage: response.tokenUsage,
  };
}

// ============================================
// Stage 1 요약 타입
// ============================================

interface Stage1Summary {
  avgScore: number;
  avgReadability: number;
  avgMaintainability: number;
  avgBestPractices: number;
  commonStrengths: string[];
  commonWeaknesses: string[];
  commonPatterns: string[];
}

// ============================================
// 결과 정규화
// ============================================

function normalizeResult(data: any): Stage3Result {
  return {
    areasForImprovement: normalizeImprovementAreas(data?.areasForImprovement),
    learningOpportunities: ensureArray(data?.learningOpportunities).slice(0, 5),
    strengths: ensureArray(data?.strengths).slice(0, 5),
    careerGrowthSuggestions: ensureArray(data?.careerGrowthSuggestions).slice(0, 3),
  };
}

function normalizeImprovementAreas(
  areas: any
): Stage3Result['areasForImprovement'] {
  if (!Array.isArray(areas)) return [];

  return areas
    .filter(a => a && typeof a === 'object')
    .map(a => ({
      area: String(a.area || '개선 영역'),
      priority: ['high', 'medium', 'low'].includes(a.priority) ? a.priority : 'medium',
      specificFeedback: String(a.specificFeedback || ''),
      suggestedResources: ensureArray(a.suggestedResources),
    }))
    .slice(0, 5);
}

function ensureArray(value: any): string[] {
  if (Array.isArray(value)) {
    return value.filter(item => typeof item === 'string');
  }
  return [];
}

// ============================================
// 분석 결과 저장
// ============================================

export async function saveStage3Result(
  reportId: string,
  result: Stage3Result,
  tokenUsage: TokenUsage
): Promise<void> {
  await db.aiReview.create({
    data: {
      reportId,
      stage: 3,
      promptVersion: PROMPT_VERSION,
      result: result as any,
      tokenUsage: tokenUsage as any,
    },
  });
}

// ============================================
// 분석 결과 조회
// ============================================

export async function getStage3Result(
  reportId: string
): Promise<Stage3Result | null> {
  const review = await db.aiReview.findFirst({
    where: {
      reportId,
      stage: 3,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return (review?.result as unknown as Stage3Result) || null;
}

