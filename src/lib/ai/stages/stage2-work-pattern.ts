/**
 * Stage 2: AI 작업 패턴 인사이트 분석
 * 
 * Stage 1 결과와 정량 메트릭을 종합하여 개발자의 작업 스타일과
 * 협업 패턴을 분석합니다.
 */

import { callClaudeWithRetry, PROMPT_VERSION, type TokenUsage } from "../client";
import { db } from "@/lib/db";
import type { Stage1Result, Stage2Result, DeveloperMetrics } from "@/types";

// ============================================
// 시스템 프롬프트
// ============================================

const STAGE2_SYSTEM_PROMPT = `당신은 개발 팀 문화와 생산성 전문가입니다. 개발자의 코드 품질 분석 결과와 정량 메트릭을 바탕으로 작업 스타일과 협업 패턴을 분석해주세요.

# 작업 스타일 유형

## 1. Deep Diver (깊이 파는 유형)
- 특정 분야에 깊이 집중
- 한 프로젝트에 오래 머무름
- 전문성이 높음
- 멀티태스킹보다 단일 작업 선호

## 2. Multi-tasker (멀티태스커)
- 여러 프로젝트를 오가며 작업
- 다양한 기술 스택 경험
- 빠른 컨텍스트 스위칭
- 넓은 범위의 이해도

## 3. Firefighter (소방관)
- 버그 수정과 긴급 대응 중심
- 문제 해결 능력이 뛰어남
- 레거시 코드 유지보수 경험 많음
- 빠른 판단력

## 4. Architect (설계자)
- 큰 그림을 보는 작업 선호
- 리팩토링과 구조 개선 중심
- 기술 부채 해결에 관심
- 문서화와 설계에 시간 투자

# 협업 패턴 유형

## 1. Solo (독립 작업자)
- 독립적으로 작업 완수
- PR 참여율 낮음
- 자기 주도적

## 2. Collaborative (협업 중심)
- PR 통한 작업 많음
- 코드 리뷰 참여 활발
- 팀 프로젝트 선호

## 3. Mentor (멘토)
- 타인의 코드에 관심
- 문서화와 가이드 작성
- 팀 코드 품질 향상 기여

## 4. Learner (학습자)
- 새로운 기술 시도
- 다양한 저장소 탐색
- 실험적 작업 많음

# 출력 형식
반드시 아래 JSON 형식으로만 응답해주세요:
\`\`\`json
{
  "workStyle": {
    "type": "deep-diver" | "multi-tasker" | "firefighter" | "architect",
    "description": "해당 유형으로 판단한 근거 설명"
  },
  "collaborationPattern": {
    "type": "solo" | "collaborative" | "mentor" | "learner",
    "description": "해당 패턴으로 판단한 근거 설명"
  },
  "productivityInsights": [
    "생산성 관련 인사이트 1",
    "생산성 관련 인사이트 2"
  ],
  "timeManagementFeedback": "시간 관리에 대한 피드백"
}
\`\`\``;

// ============================================
// 메인 분석 함수
// ============================================

export async function analyzeWorkPattern(
  analysisRunId: string,
  userLogin: string,
  stage1Results: Map<string, Stage1Result>,
  metrics: DeveloperMetrics
): Promise<{ result: Stage2Result; tokenUsage: TokenUsage }> {
  // Stage 1 결과 요약
  const stage1Summary = summarizeStage1Results(stage1Results);

  const userPrompt = `
# 개발자 정보
- GitHub ID: ${userLogin}

# 코드 품질 분석 결과 요약 (Stage 1)
${JSON.stringify(stage1Summary, null, 2)}

# 정량 메트릭

## 생산성
- 총 커밋 수: ${metrics.productivity.totalCommits}
- 총 PR 수: ${metrics.productivity.totalPRs}
- 총 추가 라인: ${metrics.productivity.linesAdded.toLocaleString()}
- 총 삭제 라인: ${metrics.productivity.linesDeleted.toLocaleString()}
- 작업일 수: ${metrics.productivity.workingDays}
- 일 평균 커밋: ${metrics.productivity.avgCommitsPerDay}

## 작업 패턴
- 시간대 분포: 오전 ${metrics.workPattern.timeDistribution.morning}%, 오후 ${metrics.workPattern.timeDistribution.afternoon}%, 저녁 ${metrics.workPattern.timeDistribution.evening}%, 야간 ${metrics.workPattern.timeDistribution.night}%
- 최장 연속 작업일: ${metrics.workPattern.longestStreak}일
- 주말 작업 비율: ${metrics.workPattern.weekendWorkRatio}%
- 평균 세션 시간: ${metrics.workPattern.avgSessionDuration}분

## 프로젝트 다양성
- 기여 저장소 수: ${metrics.diversity.repositoryCount}
- 주력 저장소: ${metrics.diversity.primaryRepository.name} (${metrics.diversity.primaryRepository.percentage}%)
- 사용 언어: ${metrics.diversity.languageVariety.join(', ') || '알 수 없음'}
- 기술 스택: 프론트엔드 ${metrics.diversity.techStackCoverage.frontend}%, 백엔드 ${metrics.diversity.techStackCoverage.backend}%, 인프라 ${metrics.diversity.techStackCoverage.infra}%, 테스트 ${metrics.diversity.techStackCoverage.test}%

## PR 활동
- PR 참여율: ${metrics.prActivity.prParticipationRate}%
- 머지 성공률: ${metrics.prActivity.mergeSuccessRate}%
- PR당 평균 커밋: ${metrics.prActivity.avgCommitsPerPR}
- 평균 PR 사이클: ${metrics.prActivity.avgPRCycleTime}시간

## 커밋 품질
- 평균 메시지 길이: ${metrics.commitQuality.avgMessageLength}자
- Conventional Commits 준수율: ${metrics.commitQuality.conventionalCommitsRate}%
- 이슈 참조율: ${metrics.commitQuality.issueReferenceRate}%
- Revert 비율: ${metrics.commitQuality.revertRate}%
- 테스트 커밋 비율: ${metrics.commitQuality.testCommitRate}%

위 데이터를 바탕으로 이 개발자의 작업 스타일과 협업 패턴을 분석해주세요.
`;

  const response = await callClaudeWithRetry<Stage2Result>({
    systemPrompt: STAGE2_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 2048,
  });

  const result = normalizeResult(response.data);

  return {
    result,
    tokenUsage: response.tokenUsage,
  };
}

// ============================================
// Stage 1 결과 요약
// ============================================

function summarizeStage1Results(
  results: Map<string, Stage1Result>
): {
  avgScore: number;
  avgReadability: number;
  avgMaintainability: number;
  avgBestPractices: number;
  commonStrengths: string[];
  commonWeaknesses: string[];
  commonPatterns: string[];
} {
  const values = Array.from(results.values());

  if (values.length === 0) {
    return {
      avgScore: 5,
      avgReadability: 5,
      avgMaintainability: 5,
      avgBestPractices: 5,
      commonStrengths: [],
      commonWeaknesses: [],
      commonPatterns: [],
    };
  }

  // 평균 점수 계산
  const avgScore = avg(values.map(v => v.codeQuality.score));
  const avgReadability = avg(values.map(v => v.codeQuality.readability));
  const avgMaintainability = avg(values.map(v => v.codeQuality.maintainability));
  const avgBestPractices = avg(values.map(v => v.codeQuality.bestPractices));

  // 빈도 기반으로 공통 항목 추출
  const strengthCounts = countItems(values.flatMap(v => v.strengths));
  const weaknessCounts = countItems(values.flatMap(v => v.weaknesses));
  const patternCounts = countItems(values.flatMap(v => v.codePatterns));

  return {
    avgScore: round(avgScore),
    avgReadability: round(avgReadability),
    avgMaintainability: round(avgMaintainability),
    avgBestPractices: round(avgBestPractices),
    commonStrengths: getTopItems(strengthCounts, 5),
    commonWeaknesses: getTopItems(weaknessCounts, 5),
    commonPatterns: getTopItems(patternCounts, 5),
  };
}

function avg(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function countItems(items: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  items.forEach(item => {
    counts.set(item, (counts.get(item) || 0) + 1);
  });
  return counts;
}

function getTopItems(counts: Map<string, number>, limit: number): string[] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([item]) => item);
}

// ============================================
// 결과 정규화
// ============================================

function normalizeResult(data: any): Stage2Result {
  const validWorkStyles = ['deep-diver', 'multi-tasker', 'firefighter', 'architect'];
  const validCollabPatterns = ['solo', 'collaborative', 'mentor', 'learner'];

  return {
    workStyle: {
      type: validWorkStyles.includes(data?.workStyle?.type) 
        ? data.workStyle.type 
        : 'multi-tasker',
      description: data?.workStyle?.description || '분석 데이터 부족',
    },
    collaborationPattern: {
      type: validCollabPatterns.includes(data?.collaborationPattern?.type)
        ? data.collaborationPattern.type
        : 'solo',
      description: data?.collaborationPattern?.description || '분석 데이터 부족',
    },
    productivityInsights: ensureArray(data?.productivityInsights),
    timeManagementFeedback: data?.timeManagementFeedback || '추가 분석 필요',
  };
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

export async function saveStage2Result(
  reportId: string,
  result: Stage2Result,
  tokenUsage: TokenUsage
): Promise<void> {
  await db.aiReview.create({
    data: {
      reportId,
      stage: 2,
      promptVersion: PROMPT_VERSION,
      result: result as any,
      tokenUsage: tokenUsage as any,
    },
  });
}

// ============================================
// 분석 결과 조회
// ============================================

export async function getStage2Result(
  reportId: string
): Promise<Stage2Result | null> {
  const review = await db.aiReview.findFirst({
    where: {
      reportId,
      stage: 2,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return (review?.result as unknown as Stage2Result) || null;
}

