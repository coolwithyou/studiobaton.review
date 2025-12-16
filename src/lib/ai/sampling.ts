/**
 * AI 기반 샘플링 모듈 (Stage 0)
 * 
 * Claude Sonnet 4.5를 활용하여 개발자 평가에 가장 의미 있는
 * WorkUnit을 지능적으로 선별합니다.
 */

import { callClaudeWithRetry, PROMPT_VERSION } from "./client";
import type { WorkUnitData, Stage0Result } from "@/types";
import { db } from "@/lib/db";

// ============================================
// 샘플링 설정
// ============================================

export interface SamplingConfig {
  totalSamples: number;      // 총 샘플 수 (기본 12)
  minPerCategory: number;    // 카테고리별 최소 샘플 (기본 2)
  includeRandom: number;     // 랜덤 샘플 수 (기본 3)
}

const DEFAULT_CONFIG: SamplingConfig = {
  totalSamples: 12,
  minPerCategory: 2,
  includeRandom: 3,
};

// ============================================
// 시스템 프롬프트
// ============================================

const SAMPLING_SYSTEM_PROMPT = `당신은 개발 팀 리더로서 팀원의 연간 업무를 평가하고 있습니다.

# 역할
주어진 작업 단위(WorkUnit) 목록에서 개발자 평가에 가장 의미 있고 대표적인 샘플을 선정해주세요.

# 선정 기준
1. **핵심 비즈니스 로직**: 서비스의 핵심 기능을 구현/수정한 작업
2. **아키텍처 변경**: 시스템 구조나 설계를 개선한 작업
3. **버그 수정**: 복잡하거나 중요한 버그를 해결한 작업
4. **새로운 기능**: 창의적이거나 영향력 있는 신규 기능 구현
5. **코드 품질**: 리팩토링, 테스트 추가 등 품질 향상 작업

# 다양성 확보
- 여러 저장소의 작업을 골고루 포함
- 다양한 작업 유형(feature, bugfix, refactor 등)을 포함
- 다양한 시기(연초, 중반, 연말)의 작업을 포함

# 출력 형식
반드시 JSON 형식으로만 응답해주세요:
\`\`\`json
{
  "selectedWorkUnitIds": ["id1", "id2", ...],
  "selectionReasons": [
    {
      "workUnitId": "id1",
      "reason": "선정 이유 설명",
      "category": "business_logic" | "architecture" | "bug_fix" | "feature" | "quality"
    },
    ...
  ]
}
\`\`\``;

// ============================================
// 메인 샘플링 함수
// ============================================

export async function selectSamplesWithAI(
  workUnits: WorkUnitData[],
  config: Partial<SamplingConfig> = {}
): Promise<Stage0Result> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (workUnits.length === 0) {
    return {
      selectedWorkUnitIds: [],
      selectionReasons: [],
    };
  }

  // WorkUnit이 적은 경우 전체 선택
  if (workUnits.length <= finalConfig.totalSamples) {
    return {
      selectedWorkUnitIds: workUnits.map(wu => wu.id),
      selectionReasons: workUnits.map(wu => ({
        workUnitId: wu.id,
        reason: "전체 작업 수가 적어 모두 선택",
        category: "feature" as const,
      })),
    };
  }

  // WorkUnit 요약 정보 생성
  const workUnitSummaries = workUnits.map(wu => ({
    id: wu.id,
    repoFullName: wu.repoFullName,
    workType: wu.workType,
    impactScore: wu.impactScore,
    startDate: wu.startDate.toISOString().split('T')[0],
    endDate: wu.endDate.toISOString().split('T')[0],
    totalCommits: wu.commits.length,
    totalAdditions: wu.totalAdditions,
    totalDeletions: wu.totalDeletions,
    primaryPaths: wu.primaryPaths.slice(0, 3),
    commitMessages: wu.commits.slice(0, 3).map(c => c.message.split('\n')[0].substring(0, 80)),
  }));

  const userPrompt = `
# 작업 단위 목록 (총 ${workUnits.length}개)

${JSON.stringify(workUnitSummaries, null, 2)}

# 요청
위 작업 단위 중에서 개발자 평가에 가장 의미 있는 ${finalConfig.totalSamples}개를 선정해주세요.
각 카테고리(business_logic, architecture, bug_fix, feature, quality)에서 최소 ${finalConfig.minPerCategory}개씩 포함하고,
다양한 저장소와 시기의 작업을 골고루 선택해주세요.
`;

  try {
    const response = await callClaudeWithRetry<Stage0Result>({
      systemPrompt: SAMPLING_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 2048,
    });

    // 유효성 검증
    const validIds = new Set(workUnits.map(wu => wu.id));
    const filteredIds = response.data.selectedWorkUnitIds.filter(id => validIds.has(id));

    // 선택된 ID가 부족하면 상위 점수 WorkUnit으로 보충
    if (filteredIds.length < finalConfig.totalSamples) {
      const sortedByScore = [...workUnits]
        .sort((a, b) => b.impactScore - a.impactScore)
        .filter(wu => !filteredIds.includes(wu.id));

      const needed = finalConfig.totalSamples - filteredIds.length;
      filteredIds.push(...sortedByScore.slice(0, needed).map(wu => wu.id));
    }

    return {
      selectedWorkUnitIds: filteredIds.slice(0, finalConfig.totalSamples),
      selectionReasons: response.data.selectionReasons?.filter(
        sr => filteredIds.includes(sr.workUnitId)
      ) || [],
    };
  } catch (error) {
    console.error("AI 샘플링 실패, 휴리스틱 폴백 사용:", error);
    return selectSamplesWithHeuristic(workUnits, finalConfig);
  }
}

// ============================================
// 휴리스틱 폴백 (AI 실패 시)
// ============================================

function selectSamplesWithHeuristic(
  workUnits: WorkUnitData[],
  config: SamplingConfig
): Stage0Result {
  const selected: WorkUnitData[] = [];
  const reasons: Stage0Result['selectionReasons'] = [];

  // 1. 상위 점수 WorkUnit (7개)
  const sortedByScore = [...workUnits].sort((a, b) => b.impactScore - a.impactScore);
  const topScored = sortedByScore.slice(0, 7);
  
  topScored.forEach(wu => {
    selected.push(wu);
    reasons.push({
      workUnitId: wu.id,
      reason: `높은 임팩트 점수 (${wu.impactScore})`,
      category: 'feature',
    });
  });

  // 2. 작업 유형별 대표 (각 유형에서 1개씩)
  const byType = new Map<string, WorkUnitData[]>();
  workUnits.forEach(wu => {
    if (!byType.has(wu.workType)) {
      byType.set(wu.workType, []);
    }
    byType.get(wu.workType)!.push(wu);
  });

  byType.forEach((typeUnits, type) => {
    if (selected.length >= config.totalSamples) return;

    const notSelected = typeUnits.filter(wu => !selected.includes(wu));
    if (notSelected.length > 0) {
      const top = notSelected.sort((a, b) => b.impactScore - a.impactScore)[0];
      selected.push(top);
      reasons.push({
        workUnitId: top.id,
        reason: `${type} 유형의 대표 작업`,
        category: mapWorkTypeToCategory(type),
      });
    }
  });

  // 3. 랜덤 샘플 (다양성)
  const remaining = workUnits.filter(wu => !selected.includes(wu));
  const shuffled = [...remaining].sort(() => Math.random() - 0.5);
  const randomPicks = shuffled.slice(0, config.includeRandom);

  randomPicks.forEach(wu => {
    if (selected.length >= config.totalSamples) return;
    selected.push(wu);
    reasons.push({
      workUnitId: wu.id,
      reason: '다양성 확보를 위한 랜덤 선택',
      category: 'feature',
    });
  });

  return {
    selectedWorkUnitIds: selected.slice(0, config.totalSamples).map(wu => wu.id),
    selectionReasons: reasons.slice(0, config.totalSamples),
  };
}

function mapWorkTypeToCategory(
  workType: string
): Stage0Result['selectionReasons'][0]['category'] {
  switch (workType) {
    case 'bugfix':
      return 'bug_fix';
    case 'refactor':
      return 'quality';
    case 'feature':
      return 'feature';
    case 'docs':
    case 'test':
      return 'quality';
    default:
      return 'feature';
  }
}

// ============================================
// 샘플링 결과 저장
// ============================================

export async function saveSamplingResult(
  analysisRunId: string,
  result: Stage0Result
): Promise<void> {
  // 선택된 WorkUnit에 isSampled 플래그 설정
  await db.workUnit.updateMany({
    where: {
      analysisRunId,
      id: { in: result.selectedWorkUnitIds },
    },
    data: {
      isSampled: true,
    },
  });

  // AiReview로 샘플링 결과 저장
  await db.aiReview.create({
    data: {
      stage: 0,
      promptVersion: PROMPT_VERSION,
      result: result as any,
    },
  });
}

// ============================================
// 분석 대상 커밋 선택 (각 WorkUnit에서)
// ============================================

export interface CommitSampleResult {
  workUnitId: string;
  selectedCommitShas: string[];
  reason: string;
}

const COMMIT_SELECTION_SYSTEM_PROMPT = `당신은 코드 리뷰어입니다.

# 역할
주어진 커밋 목록에서 코드 품질 분석에 가장 적합한 커밋을 선택해주세요.

# 선택 기준
1. 의미 있는 코드 변경이 있는 커밋
2. 단순 설정 변경이나 포맷팅이 아닌 커밋
3. 충분한 양의 코드 변경이 있는 커밋 (최소 10줄 이상)
4. 커밋 메시지가 명확한 커밋

# 출력 형식
JSON 형식으로만 응답:
\`\`\`json
{
  "selectedShas": ["sha1", "sha2"],
  "reason": "선택 이유"
}
\`\`\``;

export async function selectCommitsFromWorkUnit(
  workUnit: WorkUnitData,
  maxCommits: number = 3
): Promise<CommitSampleResult> {
  // 커밋이 적으면 전체 선택
  if (workUnit.commits.length <= maxCommits) {
    return {
      workUnitId: workUnit.id,
      selectedCommitShas: workUnit.commits.map(c => c.sha),
      reason: "전체 커밋 수가 적어 모두 선택",
    };
  }

  const commitSummaries = workUnit.commits.map(c => ({
    sha: c.sha.substring(0, 7),
    fullSha: c.sha,
    message: c.message.split('\n')[0].substring(0, 100),
    additions: c.additions,
    deletions: c.deletions,
    filesChanged: c.filesChanged,
    date: c.committedAt.toISOString().split('T')[0],
  }));

  const userPrompt = `
# 작업 단위 정보
- 저장소: ${workUnit.repoFullName}
- 작업 유형: ${workUnit.workType}
- 주요 경로: ${workUnit.primaryPaths.join(', ')}

# 커밋 목록 (${workUnit.commits.length}개)
${JSON.stringify(commitSummaries, null, 2)}

# 요청
위 커밋 중에서 코드 품질 분석에 가장 적합한 ${maxCommits}개를 선택해주세요.
`;

  try {
    const response = await callClaudeWithRetry<{ selectedShas: string[]; reason: string }>({
      systemPrompt: COMMIT_SELECTION_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 1024,
    });

    // 전체 SHA로 복원
    const shaMap = new Map(commitSummaries.map(c => [c.sha, c.fullSha]));
    const fullShas = response.data.selectedShas
      .map(sha => shaMap.get(sha) || workUnit.commits.find(c => c.sha.startsWith(sha))?.sha)
      .filter((sha): sha is string => sha !== undefined);

    return {
      workUnitId: workUnit.id,
      selectedCommitShas: fullShas.slice(0, maxCommits),
      reason: response.data.reason,
    };
  } catch (error) {
    console.error("커밋 선택 AI 실패, 상위 커밋 선택:", error);
    
    // 폴백: 변경량이 큰 커밋 선택
    const sorted = [...workUnit.commits]
      .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions));
    
    return {
      workUnitId: workUnit.id,
      selectedCommitShas: sorted.slice(0, maxCommits).map(c => c.sha),
      reason: "변경량 기준 상위 커밋 선택",
    };
  }
}

