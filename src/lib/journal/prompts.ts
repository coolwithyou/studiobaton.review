import { KeyCommitInfo, CommitReview, WeeklyAnalysisResult } from "@/types";

interface CommitForStage1 {
  sha: string;
  message: string;
  repoName: string;
  additions: number;
  deletions: number;
}

interface CommitFileWithDiff {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface CommitWithDiff {
  sha: string;
  message: string;
  repoFullName: string;
  additions: number;
  deletions: number;
  files: CommitFileWithDiff[];
}

// ============================================
// Stage 1: 주요 커밋 선별 프롬프트
// ============================================

export function buildStage1Prompt(
  commits: CommitForStage1[],
  periodType: "week" | "month"
): string {
  return `다음은 개발자의 ${periodType === "week" ? "주간" : "월간"} 커밋 목록입니다.
총 ${commits.length}개의 커밋 중에서 가장 중요한 5개의 커밋을 선별해주세요.

선별 기준:
1. 기능 추가/개선의 중요도
2. 코드 변경 규모 (additions + deletions)
3. 핵심 모듈/파일 변경 여부
4. 버그 수정의 중요도

커밋 목록:
${commits
      .map(
        (c, i) =>
          `${i + 1}. [${c.repoName}] ${c.message} (+${c.additions}/-${c.deletions}) - SHA:${c.sha}`
      )
      .join("\n")}

JSON 형식으로 응답:
{
  "keyCommits": [
    {
      "sha": "커밋의 전체 SHA 값 (위 목록에서 SHA: 뒤의 값 그대로 복사)",
      "reason": "선별 이유 (1-2문장)",
      "score": 0-100 중요도 점수
    }
  ]
}

반드시 유효한 JSON 형식으로만 응답하세요.`;
}

// ============================================
// Stage 2: 코드 리뷰 프롬프트
// ============================================

export function buildStage2Prompt(commit: CommitWithDiff): string {
  return `다음 커밋의 코드 변경사항을 리뷰해주세요.

커밋: ${commit.message}
리포지터리: ${commit.repoFullName}
변경 통계: +${commit.additions}/-${commit.deletions}

변경된 파일들과 diff:
${commit.files
      .map(
        (f) => `
파일: ${f.path}
상태: ${f.status}
변경: +${f.additions}/-${f.deletions}

\`\`\`diff
${f.patch || "(diff too large)"}
\`\`\`
`
      )
      .join("\n")}

다음 관점에서 분석해주세요:
1. 기술적 품질 (high/medium/low)
2. 복잡도 (high/medium/low)
3. 비즈니스/기술적 임팩트
4. 잠재적 리스크
5. 배운 점/인사이트

JSON 형식으로 응답:
{
  "summary": "커밋 요약 (2-3문장)",
  "technicalQuality": "high" | "medium" | "low",
  "complexity": "high" | "medium" | "low",
  "impact": ["임팩트 1", "임팩트 2"],
  "risks": ["리스크 1", "리스크 2"],
  "learnings": ["배운점 1", "배운점 2"],
  "filesAnalyzed": [
    {
      "path": "파일 경로",
      "changes": 변경 라인 수,
      "insight": "파일별 인사이트"
    }
  ]
}

반드시 유효한 JSON 형식으로만 응답하세요.`;
}

// ============================================
// Stage 3: 주간 종합 프롬프트
// ============================================

export function buildStage3WeeklyPrompt(
  keyCommits: KeyCommitInfo[],
  commitReviews: CommitReview[]
): string {
  return `다음은 이번 주의 주요 커밋 분석 결과입니다.

선별된 주요 커밋 (${keyCommits.length}개):
${keyCommits.map((c) => `- ${c.message} (${c.reason})`).join("\n")}

코드 리뷰 결과:
${commitReviews
      .map(
        (r) => `
커밋: ${r.message}
요약: ${r.summary}
기술 품질: ${r.technicalQuality}
임팩트: ${r.impact.join(", ")}
`
      )
      .join("\n")}

위 정보를 바탕으로 주간 업무를 종합 분석해주세요:
1. 전체 요약 (3-4문장)
2. 주요 활동 목록 (3-5개)
3. 작업 패턴 (집중형/분산형/유지보수형 등)
4. 기술적 하이라이트 (2-3개)
5. 인사이트/개선점 (2-3개)

JSON 형식으로 응답:
{
  "summary": "주간 업무 종합 요약",
  "keyActivities": ["활동 1", "활동 2", "활동 3"],
  "workPattern": "작업 패턴 설명",
  "technicalHighlights": ["하이라이트 1", "하이라이트 2"],
  "insights": ["인사이트 1", "인사이트 2"],
  "metrics": {
    "totalCommits": 전체 커밋 수,
    "keyCommitsAnalyzed": 분석된 주요 커밋 수,
    "reposWorked": 작업한 리포 수,
    "linesChanged": 변경된 라인 수
  }
}

반드시 유효한 JSON 형식으로만 응답하세요.`;
}

// ============================================
// Stage 3: 월간 종합 프롬프트
// ============================================

export function buildStage3MonthlyPrompt(
  weeklyResults: WeeklyAnalysisResult[]
): string {
  return `다음은 이번 달의 주차별 분석 결과입니다.

${weeklyResults
      .map(
        (w, i) => `
=== ${i + 1}주차 ===
요약: ${w.summary}
주요 활동: ${w.keyActivities.join(", ")}
패턴: ${w.workPattern}
`
      )
      .join("\n")}

위 주차별 분석을 바탕으로 월간 업무를 종합 분석해주세요:
1. 월간 전체 요약 (4-5문장)
2. 주차별 요약 (각 주차 1-2문장)
3. 전체 작업 패턴
4. 주요 성과 (3-5개)
5. 기술적 성장 (2-3개)
6. 다음 달 권장 사항 (2-3개)

JSON 형식으로 응답:
{
  "summary": "월간 전체 요약",
  "weeklyBreakdown": [
    {
      "week": 주차 번호,
      "summary": "주차 요약",
      "keyActivity": "핵심 활동"
    }
  ],
  "overallPattern": "전체 작업 패턴",
  "achievements": ["성과 1", "성과 2"],
  "technicalGrowth": ["성장 1", "성장 2"],
  "recommendations": ["권장사항 1", "권장사항 2"],
  "metrics": {
    "totalCommits": 총 커밋 수,
    "weeksActive": 활동한 주차 수,
    "reposWorked": 작업한 리포 수,
    "averageCommitsPerWeek": 주당 평균 커밋 수
  }
}

반드시 유효한 JSON 형식으로만 응답하세요.`;
}
