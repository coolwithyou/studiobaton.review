// ============================================
// 프롬프트 버전 관리
// ============================================

export const PROMPT_VERSION = "v1.0.0";

// ============================================
// 시스템 프롬프트
// ============================================

export const SYSTEM_PROMPT = `당신은 시니어 소프트웨어 엔지니어로서 코드 리뷰를 수행합니다.

## 역할
- 개발자의 작업을 객관적으로 분석합니다.
- 코드 품질, 구조, 패턴 관점에서 피드백을 제공합니다.
- 구체적이고 실행 가능한 개선안을 제시합니다.

## 금지 사항
- 개인의 성향이나 태도에 대한 추측/평가
- 근거 없는 비판
- 모호하거나 일반적인 피드백

## 응답 형식
반드시 유효한 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.`;

// ============================================
// 리뷰 프롬프트 템플릿
// ============================================

export function buildReviewPrompt(input: {
  orgName: string;
  repoName: string;
  userName: string;
  startAt: string;
  endAt: string;
  commitCount: number;
  additions: number;
  deletions: number;
  filesChanged: number;
  impactScore: number;
  commits: { sha: string; message: string }[];
  primaryPaths: string[];
  diffSamples: { path: string; diff: string }[];
  teamStandards?: string;
}): string {
  const {
    orgName,
    repoName,
    userName,
    startAt,
    endAt,
    commitCount,
    additions,
    deletions,
    filesChanged,
    impactScore,
    commits,
    primaryPaths,
    diffSamples,
    teamStandards,
  } = input;

  let prompt = `## 작업 정보
- 조직: ${orgName}
- 저장소: ${repoName}
- 작업자: ${userName}
- 작업 기간: ${startAt} ~ ${endAt}
- 커밋 수: ${commitCount}
- 변경 규모: +${additions} / -${deletions} (${filesChanged} files)
- 임팩트 점수: ${impactScore}

## 커밋 메시지 목록
${commits.map((c) => `- ${c.sha.slice(0, 7)}: ${c.message.split("\n")[0]}`).join("\n")}

## 주요 변경 경로
${primaryPaths.map((p) => `- ${p}`).join("\n")}
`;

  if (diffSamples.length > 0) {
    prompt += `\n## 핵심 코드 변경 샘플\n`;
    for (const sample of diffSamples) {
      prompt += `### ${sample.path}\n\`\`\`diff\n${sample.diff}\n\`\`\`\n\n`;
    }
  }

  if (teamStandards) {
    prompt += `\n## 팀 코딩 기준\n${teamStandards}\n`;
  }

  prompt += `
## 분석 요청
위 작업 묶음(Work Unit)을 분석하고 다음 JSON 형식으로 응답하세요:

{
  "summary": "1-2문장 작업 요약 (한국어)",
  "workType": "feature|bugfix|refactor|chore|docs|test 중 하나",
  "complexity": "low|medium|high 중 하나",
  "strengths": ["잘한 점 1", "잘한 점 2", "잘한 점 3"],
  "risks": ["리스크/주의점 1", "리스크/주의점 2"],
  "suggestions": ["개선 제안 1", "개선 제안 2"],
  "learningPoints": ["학습 포인트 1"],
  "confidence": 0.0부터 1.0 사이의 신뢰도 점수
}

중요: JSON 외의 다른 텍스트는 포함하지 마세요.`;

  return prompt;
}

// ============================================
// 연간 리포트 요약 프롬프트
// ============================================

export function buildYearlyReportPrompt(input: {
  userName: string;
  year: number;
  totalCommits: number;
  totalWorkUnits: number;
  avgImpactScore: number;
  topRepos: string[];
  workTypeDistribution: Record<string, number>;
  aiReviews: {
    summary: string;
    strengths: string[];
    risks: string[];
    suggestions: string[];
  }[];
}): string {
  const {
    userName,
    year,
    totalCommits,
    totalWorkUnits,
    avgImpactScore,
    topRepos,
    workTypeDistribution,
    aiReviews,
  } = input;

  // 강점/위험/제안 집계
  const allStrengths = aiReviews.flatMap((r) => r.strengths);
  const allRisks = aiReviews.flatMap((r) => r.risks);
  const allSuggestions = aiReviews.flatMap((r) => r.suggestions);

  return `## ${userName}의 ${year}년 연간 코드 기여 분석

### 통계
- 총 커밋: ${totalCommits}개
- 작업 묶음: ${totalWorkUnits}개
- 평균 임팩트 점수: ${avgImpactScore.toFixed(1)}
- 주요 기여 저장소: ${topRepos.join(", ")}
- 작업 유형 분포: ${Object.entries(workTypeDistribution)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ")}

### AI 리뷰 요약
강점:
${allStrengths.slice(0, 10).map((s) => `- ${s}`).join("\n")}

주의점:
${allRisks.slice(0, 5).map((r) => `- ${r}`).join("\n")}

개선 제안:
${allSuggestions.slice(0, 5).map((s) => `- ${s}`).join("\n")}

### 요청
위 정보를 바탕으로 연간 리포트를 작성하세요. 다음 JSON 형식으로 응답:

{
  "summary": "3-4문장의 연간 활동 요약 (한국어)",
  "strengths": ["핵심 강점 1", "핵심 강점 2", "핵심 강점 3"],
  "improvements": ["개선이 필요한 영역 1", "개선이 필요한 영역 2"],
  "actionItems": ["구체적인 액션 아이템 1", "구체적인 액션 아이템 2", "구체적인 액션 아이템 3"]
}

중요: JSON 외의 다른 텍스트는 포함하지 마세요.`;
}

