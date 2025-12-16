/**
 * Stage 4: AI 종합 평가 요약
 * 
 * 모든 이전 단계의 결과를 종합하여 최종 평가 리포트를 생성합니다.
 * - 경영진 요약
 * - 종합 평가 점수
 * - 주요 성과
 * - 핵심 개선점
 * - 액션 아이템
 */

import { callClaudeWithRetry, PROMPT_VERSION, type TokenUsage } from "../client";
import { db } from "@/lib/db";
import type {
  Stage1Result,
  Stage2Result,
  Stage3Result,
  Stage4Result,
  DeveloperMetrics,
} from "@/types";

// ============================================
// 시스템 프롬프트
// ============================================

const STAGE4_SYSTEM_PROMPT = `당신은 테크 회사의 Engineering Manager입니다. 개발자의 연간 업무 평가를 위한 종합 리포트를 작성해주세요.

# 평가 관점

## 1. 경영진 요약 (Executive Summary)
- 2-3문장으로 핵심을 요약
- 이 개발자의 가장 큰 기여와 특징
- 전체적인 평가 톤 (긍정적이되 객관적으로)

## 2. 종합 평가 점수 (1-10)
각 영역별로 점수와 간략한 피드백 제공:
- **생산성**: 작업량, 커밋 빈도, 프로젝트 기여도
- **코드 품질**: 가독성, 유지보수성, 베스트 프랙티스
- **다양성**: 프로젝트 범위, 기술 스택, 유연성
- **협업**: PR 참여, 팀 기여, 커뮤니케이션
- **성장**: 개선 노력, 학습 의지, 새로운 시도

## 3. 주요 성과 (Top Achievements)
- 연간 가장 인상적인 성과 3개
- 구체적인 기여 내용 명시

## 4. 핵심 개선점 (Key Improvements)
- 가장 중요한 개선 필요 사항 3개
- 건설적이고 실행 가능한 피드백

## 5. 액션 아이템 (Action Items)
- 다음 분기/연도에 집중해야 할 구체적인 목표
- 우선순위와 목표 시점 제시

# 출력 형식
반드시 아래 JSON 형식으로만 응답해주세요:
\`\`\`json
{
  "executiveSummary": "경영진 요약 (2-3문장)",
  "overallAssessment": {
    "productivity": { "score": 7, "feedback": "피드백" },
    "codeQuality": { "score": 8, "feedback": "피드백" },
    "diversity": { "score": 6, "feedback": "피드백" },
    "collaboration": { "score": 7, "feedback": "피드백" },
    "growth": { "score": 8, "feedback": "피드백" }
  },
  "topAchievements": [
    "성과 1",
    "성과 2",
    "성과 3"
  ],
  "keyImprovements": [
    "개선점 1",
    "개선점 2",
    "개선점 3"
  ],
  "actionItems": [
    {
      "item": "액션 아이템 내용",
      "deadline": "Q1 2025",
      "priority": "high" | "medium" | "low"
    }
  ]
}
\`\`\`

# 평가 원칙
1. 데이터에 기반한 객관적 평가
2. 강점을 먼저 인정하고, 개선점은 건설적으로
3. 구체적이고 측정 가능한 피드백
4. 개발자의 성장을 독려하는 톤
5. 한국 개발 문화를 고려한 현실적인 조언`;

// ============================================
// 메인 분석 함수
// ============================================

export async function generateFinalSummary(
  userLogin: string,
  year: number,
  metrics: DeveloperMetrics,
  stage1Summary: Stage1Summary,
  stage2Result: Stage2Result,
  stage3Result: Stage3Result,
  previousYearSummary?: string
): Promise<{ result: Stage4Result; tokenUsage: TokenUsage }> {
  const userPrompt = `
# 개발자 정보
- GitHub ID: ${userLogin}
- 평가 연도: ${year}년

# 정량 메트릭 요약

## 생산성
- 총 커밋: ${metrics.productivity.totalCommits}
- 총 PR: ${metrics.productivity.totalPRs}
- 코드 추가: +${metrics.productivity.linesAdded.toLocaleString()} 라인
- 코드 삭제: -${metrics.productivity.linesDeleted.toLocaleString()} 라인
- 순증가: ${metrics.productivity.netLines > 0 ? '+' : ''}${metrics.productivity.netLines.toLocaleString()} 라인
- 작업일: ${metrics.productivity.workingDays}일
- 일 평균 커밋: ${metrics.productivity.avgCommitsPerDay}

## 작업 패턴
- 주요 작업 시간대: ${getMainWorkTime(metrics.workPattern.timeDistribution)}
- 최장 연속 작업: ${metrics.workPattern.longestStreak}일
- 주말 작업 비율: ${metrics.workPattern.weekendWorkRatio}%

## 프로젝트 다양성
- 기여 저장소: ${metrics.diversity.repositoryCount}개
- 주력 프로젝트: ${metrics.diversity.primaryRepository.name} (${metrics.diversity.primaryRepository.percentage}%)
- 기술 스택: 프론트엔드 ${metrics.diversity.techStackCoverage.frontend}%, 백엔드 ${metrics.diversity.techStackCoverage.backend}%

## 커밋 품질
- Conventional Commits: ${metrics.commitQuality.conventionalCommitsRate}%
- 이슈 참조율: ${metrics.commitQuality.issueReferenceRate}%
- 테스트 커밋: ${metrics.commitQuality.testCommitRate}%
- Revert 비율: ${metrics.commitQuality.revertRate}%

# AI 분석 결과

## Stage 1: 코드 품질
- 평균 점수: ${stage1Summary.avgScore}/10
- 가독성: ${stage1Summary.avgReadability}/10
- 유지보수성: ${stage1Summary.avgMaintainability}/10
- 베스트 프랙티스: ${stage1Summary.avgBestPractices}/10

주요 강점:
${stage1Summary.commonStrengths.map(s => `- ${s}`).join('\n') || '- 데이터 부족'}

주요 약점:
${stage1Summary.commonWeaknesses.map(w => `- ${w}`).join('\n') || '- 데이터 부족'}

## Stage 2: 작업 패턴
- 작업 스타일: ${stage2Result.workStyle.type} - ${stage2Result.workStyle.description}
- 협업 패턴: ${stage2Result.collaborationPattern.type} - ${stage2Result.collaborationPattern.description}

생산성 인사이트:
${stage2Result.productivityInsights.map(i => `- ${i}`).join('\n') || '- 데이터 부족'}

## Stage 3: 성장 포인트

개선 영역:
${stage3Result.areasForImprovement.map(a => 
  `- [${a.priority}] ${a.area}: ${a.specificFeedback}`
).join('\n') || '- 데이터 부족'}

강점:
${stage3Result.strengths.map(s => `- ${s}`).join('\n') || '- 데이터 부족'}

학습 기회:
${stage3Result.learningOpportunities.map(l => `- ${l}`).join('\n') || '- 데이터 부족'}

커리어 성장 제안:
${stage3Result.careerGrowthSuggestions.map(c => `- ${c}`).join('\n') || '- 데이터 부족'}

${previousYearSummary ? `
# 전년도 대비 (참고)
${previousYearSummary}
` : ''}

위 모든 데이터를 종합하여 이 개발자의 ${year}년 연간 평가 종합 리포트를 작성해주세요.
`;

  const response = await callClaudeWithRetry<Stage4Result>({
    systemPrompt: STAGE4_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 4000,
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
// 유틸리티
// ============================================

function getMainWorkTime(distribution: { morning: number; afternoon: number; evening: number; night: number }): string {
  const times = [
    { name: '오전 (06-12시)', value: distribution.morning },
    { name: '오후 (12-18시)', value: distribution.afternoon },
    { name: '저녁 (18-22시)', value: distribution.evening },
    { name: '야간 (22-06시)', value: distribution.night },
  ];

  const sorted = times.sort((a, b) => b.value - a.value);
  return `${sorted[0].name} ${sorted[0].value}%`;
}

// ============================================
// 결과 정규화
// ============================================

function normalizeResult(data: any): Stage4Result {
  return {
    executiveSummary: String(data?.executiveSummary || '분석 데이터 부족'),
    overallAssessment: {
      productivity: normalizeAssessment(data?.overallAssessment?.productivity),
      codeQuality: normalizeAssessment(data?.overallAssessment?.codeQuality),
      diversity: normalizeAssessment(data?.overallAssessment?.diversity),
      collaboration: normalizeAssessment(data?.overallAssessment?.collaboration),
      growth: normalizeAssessment(data?.overallAssessment?.growth),
    },
    topAchievements: ensureArray(data?.topAchievements).slice(0, 5),
    keyImprovements: ensureArray(data?.keyImprovements).slice(0, 5),
    actionItems: normalizeActionItems(data?.actionItems),
    yearOverYearComparison: data?.yearOverYearComparison,
  };
}

function normalizeAssessment(assessment: any): { score: number; feedback: string } {
  return {
    score: clamp(assessment?.score || 5, 1, 10),
    feedback: String(assessment?.feedback || ''),
  };
}

function normalizeActionItems(items: any): Stage4Result['actionItems'] {
  if (!Array.isArray(items)) return [];

  return items
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      item: String(item.item || ''),
      deadline: String(item.deadline || 'Q1'),
      priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
    }))
    .slice(0, 5);
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

// ============================================
// 분석 결과 저장
// ============================================

export async function saveStage4Result(
  reportId: string,
  result: Stage4Result,
  tokenUsage: TokenUsage
): Promise<void> {
  await db.aiReview.create({
    data: {
      reportId,
      stage: 4,
      promptVersion: PROMPT_VERSION,
      result: result as any,
      tokenUsage: tokenUsage as any,
    },
  });

  // YearlyReport에 aiInsights와 overallScore 업데이트
  await db.yearlyReport.update({
    where: { id: reportId },
    data: {
      aiInsights: result as any,
      overallScore: result.overallAssessment as any,
    },
  });
}

// ============================================
// 분석 결과 조회
// ============================================

export async function getStage4Result(
  reportId: string
): Promise<Stage4Result | null> {
  const review = await db.aiReview.findFirst({
    where: {
      reportId,
      stage: 4,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return (review?.result as unknown as Stage4Result) || null;
}

// ============================================
// 전체 점수 계산
// ============================================

export function calculateOverallScore(assessment: Stage4Result['overallAssessment']): number {
  const weights = {
    productivity: 0.25,
    codeQuality: 0.30,
    diversity: 0.15,
    collaboration: 0.15,
    growth: 0.15,
  };

  const weightedSum = 
    assessment.productivity.score * weights.productivity +
    assessment.codeQuality.score * weights.codeQuality +
    assessment.diversity.score * weights.diversity +
    assessment.collaboration.score * weights.collaboration +
    assessment.growth.score * weights.growth;

  return Math.round(weightedSum * 10) / 10;
}

// ============================================
// 등급 산정
// ============================================

export function getGrade(score: number): { grade: string; label: string; color: string } {
  if (score >= 9) return { grade: 'S', label: '탁월함', color: 'text-purple-600' };
  if (score >= 8) return { grade: 'A', label: '우수함', color: 'text-blue-600' };
  if (score >= 7) return { grade: 'B', label: '양호', color: 'text-green-600' };
  if (score >= 6) return { grade: 'C', label: '보통', color: 'text-yellow-600' };
  if (score >= 5) return { grade: 'D', label: '미흡', color: 'text-orange-600' };
  return { grade: 'F', label: '개선 필요', color: 'text-red-600' };
}

