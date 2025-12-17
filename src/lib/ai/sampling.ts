/**
 * AI 기반 샘플링 모듈 (Stage 0)
 * 
 * 모든 기여 리포에서 AI 기반 샘플링을 수행하고,
 * 리포별 분석 컨텍스트를 저장합니다.
 */

import { callClaudeWithRetry, PROMPT_VERSION } from "./client";
import type { WorkUnitData, Stage0Result, SamplingResult, RepoSummary } from "@/types";
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

// 리포별 샘플링 설정 (개선됨)
export interface PerRepoSamplingConfig {
  minSamplesPerRepo: number;      // 리포당 최소 샘플 (기본 1)
  maxSamplesPerRepo: number;      // 리포당 최대 샘플 (기본 5)
  maxTotalSamples: number | null; // null = 제한 없음
  minImpactScore: number;         // 최소 임팩트 점수 (기본 0)
  // 비용 최적화 설정
  heuristicThreshold: number;     // 이 이하 WorkUnit은 휴리스틱 (기본 5)
  batchSize: number;              // AI 배치 호출 시 리포 수 (기본 5)
}

const DEFAULT_PER_REPO_CONFIG: PerRepoSamplingConfig = {
  minSamplesPerRepo: 1,
  maxSamplesPerRepo: 5,           // 리포당 최대 5개
  maxTotalSamples: null,          // 제한 제거
  minImpactScore: 0,
  heuristicThreshold: 5,          // 5개 이하는 AI 없이 전체 선택
  batchSize: 5,                   // 5개 리포씩 배치 처리
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

// 배치 샘플링 프롬프트
const BATCH_SAMPLING_PROMPT = `당신은 개발 팀 리더입니다.
여러 저장소의 작업 단위(WorkUnit) 목록이 주어집니다.
각 저장소에서 개발자 평가에 가장 의미 있는 샘플을 선정해주세요.

# 선정 기준
1. 핵심 비즈니스 로직 구현
2. 복잡한 기술적 도전
3. 중요 버그 수정
4. 코드 품질 개선

# 다양성 확보
- 다양한 작업 유형(feature, bugfix, refactor 등)을 포함
- 다양한 시기의 작업을 포함

# 출력 형식 (각 리포별)
반드시 JSON 형식으로만 응답:
\`\`\`json
{
  "results": [
    {
      "repoFullName": "org/repo1",
      "selectedIds": ["id1", "id2", ...],
      "reason": "선정 이유 요약"
    },
    ...
  ]
}
\`\`\``;

// ============================================
// 메인 샘플링 함수 (기존 호환)
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
// 사용자별 + 리포별 전체 커버리지 샘플링 (개선됨)
// ============================================

/**
 * 한 사용자의 WorkUnit을 모든 리포에서 샘플링합니다.
 * 
 * 개선 사항:
 * - 모든 기여 리포에서 최소 1개 이상 샘플링
 * - WorkUnit 5개 이하 리포는 AI 없이 전체 선택 (비용 최적화)
 * - 6개 이상 리포는 배치 AI 호출로 처리
 * - 리포별 요약 정보 생성
 * 
 * @param workUnits 한 사용자의 전체 WorkUnit 목록
 * @param config 샘플링 설정
 * @returns 선택된 WorkUnit ID, 선정 이유, 리포별 요약
 */
export async function selectSamplesPerUserPerRepo(
  workUnits: WorkUnitData[],
  config: Partial<PerRepoSamplingConfig> = {}
): Promise<SamplingResult> {
  const cfg = { ...DEFAULT_PER_REPO_CONFIG, ...config };

  if (workUnits.length === 0) {
    return {
      selectedWorkUnitIds: [],
      selectionReasons: [],
      repoSummaries: [],
    };
  }

  // 1. 리포별 그룹화
  const byRepo = groupByRepo(workUnits);
  console.log(`[Sampling] ${byRepo.size} repositories to process`);

  // 2. 리포 분류 (휴리스틱 vs AI)
  const { heuristicRepos, aiRepos } = classifyRepos(byRepo, cfg);
  console.log(`[Sampling] Heuristic: ${heuristicRepos.length}, AI: ${aiRepos.length}`);

  // 3. 휴리스틱 처리 (AI 호출 없음 - 전체 선택)
  const heuristicResults = processHeuristicRepos(heuristicRepos, byRepo, cfg);

  // 4. AI 배치 처리
  const aiResults = await processAIReposBatched(aiRepos, byRepo, cfg);

  // 5. 결과 병합
  const allResults = new Map([...heuristicResults, ...aiResults]);

  // 6. 리포별 요약 생성
  const repoSummaries = generateRepoSummaries(allResults, byRepo);

  // 7. 최종 결과 조합
  const allSelectedIds: string[] = [];
  const allReasons: Stage0Result['selectionReasons'] = [];

  for (const result of allResults.values()) {
    allSelectedIds.push(...result.selectedWorkUnitIds);
    allReasons.push(...result.selectionReasons);
  }

  console.log(`[Sampling] Total: ${allSelectedIds.length} samples from ${allResults.size} repos`);

  return {
    selectedWorkUnitIds: allSelectedIds,
    selectionReasons: allReasons,
    repoSummaries,
  };
}

// ============================================
// 헬퍼 함수들
// ============================================

/**
 * WorkUnit을 리포별로 그룹화
 */
function groupByRepo(workUnits: WorkUnitData[]): Map<string, WorkUnitData[]> {
  const byRepo = new Map<string, WorkUnitData[]>();
  workUnits.forEach(wu => {
    if (!byRepo.has(wu.repoId)) {
      byRepo.set(wu.repoId, []);
    }
    byRepo.get(wu.repoId)!.push(wu);
  });
  return byRepo;
}

/**
 * 리포를 휴리스틱/AI 대상으로 분류
 */
function classifyRepos(
  byRepo: Map<string, WorkUnitData[]>,
  config: PerRepoSamplingConfig
): { heuristicRepos: string[]; aiRepos: string[] } {
  const heuristicRepos: string[] = [];
  const aiRepos: string[] = [];

  for (const [repoId, units] of byRepo) {
    if (units.length <= config.heuristicThreshold) {
      heuristicRepos.push(repoId);  // AI 없이 전체 선택
    } else {
      aiRepos.push(repoId);          // AI 샘플링 필요
    }
  }

  return { heuristicRepos, aiRepos };
}

/**
 * 휴리스틱 리포 처리 - WorkUnit 5개 이하는 전체 선택
 */
function processHeuristicRepos(
  repoIds: string[],
  byRepo: Map<string, WorkUnitData[]>,
  config: PerRepoSamplingConfig
): Map<string, Stage0Result> {
  const results = new Map<string, Stage0Result>();

  for (const repoId of repoIds) {
    const units = byRepo.get(repoId) || [];
    if (units.length === 0) continue;

    const repoFullName = units[0].repoFullName;

    // 전체 선택 (최대 maxSamplesPerRepo까지)
    const toSelect = units.slice(0, config.maxSamplesPerRepo);

    results.set(repoId, {
      selectedWorkUnitIds: toSelect.map(u => u.id),
      selectionReasons: toSelect.map(u => ({
        workUnitId: u.id,
        reason: `${repoFullName} 전체 선택 (${units.length}개 중 ${toSelect.length}개)`,
        category: mapWorkTypeToCategory(u.workType),
      })),
    });
  }

  return results;
}

/**
 * AI 배치 처리 - 여러 리포를 하나의 AI 호출로 처리
 */
async function processAIReposBatched(
  repoIds: string[],
  byRepo: Map<string, WorkUnitData[]>,
  config: PerRepoSamplingConfig
): Promise<Map<string, Stage0Result>> {
  const results = new Map<string, Stage0Result>();

  if (repoIds.length === 0) {
    return results;
  }

  // 배치로 나누기
  const batches: string[][] = [];
  for (let i = 0; i < repoIds.length; i += config.batchSize) {
    batches.push(repoIds.slice(i, i + config.batchSize));
  }

  console.log(`[Sampling] Processing ${batches.length} AI batches`);

  for (const batch of batches) {
    const repos = batch.map(repoId => ({
      repoId,
      repoFullName: byRepo.get(repoId)![0].repoFullName,
      workUnits: byRepo.get(repoId)!,
    }));

    try {
      const batchResults = await selectSamplesBatch(repos, config);
      for (const [repoId, result] of batchResults) {
        results.set(repoId, result);
      }
    } catch (error) {
      console.error(`[Sampling] Batch AI failed, using heuristic:`, error);
      // 폴백: 상위 임팩트 선택
      for (const repo of repos) {
        results.set(repo.repoId, selectTopByImpact(repo.workUnits, config.maxSamplesPerRepo, repo.repoFullName));
      }
    }
  }

  return results;
}

/**
 * 배치 AI 샘플링 - 여러 리포를 단일 AI 호출로 처리
 */
async function selectSamplesBatch(
  repos: Array<{ repoId: string; repoFullName: string; workUnits: WorkUnitData[] }>,
  config: PerRepoSamplingConfig
): Promise<Map<string, Stage0Result>> {
  const batchPrompt = repos.map(r => ({
    repoFullName: r.repoFullName,
    targetCount: Math.min(config.maxSamplesPerRepo, r.workUnits.length),
    workUnits: r.workUnits.map(wu => ({
      id: wu.id,
      workType: wu.workType,
      impactScore: wu.impactScore,
      commits: wu.commits.length,
      additions: wu.totalAdditions,
      deletions: wu.totalDeletions,
      paths: wu.primaryPaths.slice(0, 3),
      messages: wu.commits.slice(0, 2).map(c => c.message.split('\n')[0].substring(0, 60)),
    })),
  }));

  const userPrompt = `
# 리포지토리별 작업 단위 목록

${JSON.stringify(batchPrompt, null, 2)}

# 요청
각 리포지토리에서 개발자 평가에 가장 의미 있는 작업을 선정해주세요.
각 리포의 targetCount만큼 선정해주세요.
`;

  const response = await callClaudeWithRetry<{
    results: Array<{
      repoFullName: string;
      selectedIds: string[];
      reason: string;
    }>;
  }>({
    systemPrompt: BATCH_SAMPLING_PROMPT,
    userPrompt,
    maxTokens: 3000,
  });

  // 응답 파싱
  const results = new Map<string, Stage0Result>();

  for (const repo of repos) {
    const aiResult = response.data.results?.find(
      r => r.repoFullName === repo.repoFullName
    );

    if (aiResult && aiResult.selectedIds.length > 0) {
      // AI 결과 유효성 검증
      const validIds = new Set(repo.workUnits.map(wu => wu.id));
      const filteredIds = aiResult.selectedIds.filter(id => validIds.has(id));

      // 부족하면 상위 임팩트로 보충
      if (filteredIds.length < config.maxSamplesPerRepo) {
        const remaining = repo.workUnits
          .filter(wu => !filteredIds.includes(wu.id))
          .sort((a, b) => b.impactScore - a.impactScore);
        const needed = Math.min(config.maxSamplesPerRepo, repo.workUnits.length) - filteredIds.length;
        filteredIds.push(...remaining.slice(0, needed).map(wu => wu.id));
      }

      results.set(repo.repoId, {
        selectedWorkUnitIds: filteredIds.slice(0, config.maxSamplesPerRepo),
        selectionReasons: filteredIds.slice(0, config.maxSamplesPerRepo).map(id => ({
          workUnitId: id,
          reason: aiResult.reason || `${repo.repoFullName} AI 선정`,
          category: mapWorkTypeToCategory(
            repo.workUnits.find(wu => wu.id === id)?.workType || 'feature'
          ),
        })),
      });
    } else {
      // AI 결과 없으면 휴리스틱 폴백
      results.set(repo.repoId, selectTopByImpact(repo.workUnits, config.maxSamplesPerRepo, repo.repoFullName));
    }
  }

  return results;
}

/**
 * 상위 임팩트 기반 선택 (휴리스틱 폴백)
 */
function selectTopByImpact(
  workUnits: WorkUnitData[],
  maxSamples: number,
  repoFullName: string
): Stage0Result {
  const sorted = [...workUnits].sort((a, b) => b.impactScore - a.impactScore);
  const selected = sorted.slice(0, maxSamples);

  return {
    selectedWorkUnitIds: selected.map(wu => wu.id),
    selectionReasons: selected.map(wu => ({
      workUnitId: wu.id,
      reason: `${repoFullName} 상위 임팩트 (${wu.impactScore.toFixed(1)})`,
      category: mapWorkTypeToCategory(wu.workType),
    })),
  };
}

/**
 * 리포별 요약 생성
 */
function generateRepoSummaries(
  results: Map<string, Stage0Result>,
  byRepo: Map<string, WorkUnitData[]>
): RepoSummary[] {
  const summaries: RepoSummary[] = [];

  for (const [repoId, workUnits] of byRepo) {
    if (workUnits.length === 0) continue;

    const result = results.get(repoId);
    const sampledCount = result?.selectedWorkUnitIds.length || 0;

    // 작업 유형 분포 계산
    const workTypeDistribution: Record<string, number> = {};
    workUnits.forEach(wu => {
      workTypeDistribution[wu.workType] = (workTypeDistribution[wu.workType] || 0) + 1;
    });

    // 총 커밋 수 계산
    const totalCommits = workUnits.reduce((sum, wu) => sum + wu.commits.length, 0);

    // 평균 임팩트 점수
    const avgImpactScore = workUnits.reduce((sum, wu) => sum + wu.impactScore, 0) / workUnits.length;

    // 샘플링 이유 (첫 번째 선정 이유 사용)
    const samplingReason = result?.selectionReasons[0]?.reason || null;

    summaries.push({
      repoId,
      repoFullName: workUnits[0].repoFullName,
      totalWorkUnits: workUnits.length,
      sampledWorkUnits: sampledCount,
      totalCommits,
      avgImpactScore,
      workTypeDistribution,
      samplingReason,
    });
  }

  return summaries;
}

// ============================================
// 사용자별 샘플링 결과 저장
// ============================================

export async function saveSamplingResultForUser(
  analysisRunId: string,
  userLogin: string,
  result: SamplingResult | Stage0Result
): Promise<void> {
  // 선정 이유를 ID별로 매핑
  const reasonMap = new Map(
    result.selectionReasons.map(sr => [sr.workUnitId, sr])
  );

  // 각 WorkUnit에 선정 이유와 함께 isSampled 플래그 설정
  for (const workUnitId of result.selectedWorkUnitIds) {
    const reason = reasonMap.get(workUnitId);
    await db.workUnit.update({
      where: { id: workUnitId },
      data: {
        isSampled: true,
        samplingReason: reason?.reason || null,
        samplingCategory: reason?.category || null,
      },
    });
  }

  // AiReview로 샘플링 결과 저장 (사용자별)
  await db.aiReview.create({
    data: {
      stage: 0,
      promptVersion: PROMPT_VERSION,
      result: {
        userLogin,
        selectedWorkUnitIds: result.selectedWorkUnitIds,
        selectionReasons: result.selectionReasons,
      } as any,
    },
  });

  console.log(`[Sampling] Saved ${result.selectedWorkUnitIds.length} samples for ${userLogin} with reasons`);
}

// ============================================
// 리포별 요약 저장
// ============================================

export async function saveRepoSummaries(
  analysisRunId: string,
  summaries: RepoSummary[]
): Promise<void> {
  console.log(`[Sampling] Saving ${summaries.length} repo summaries`);

  for (const summary of summaries) {
    await db.repoAnalysisSummary.upsert({
      where: {
        analysisRunId_repoId: {
          analysisRunId,
          repoId: summary.repoId,
        },
      },
      create: {
        analysisRunId,
        repoId: summary.repoId,
        repoFullName: summary.repoFullName,
        totalWorkUnits: summary.totalWorkUnits,
        sampledWorkUnits: summary.sampledWorkUnits,
        totalCommits: summary.totalCommits,
        avgImpactScore: summary.avgImpactScore,
        workTypeDistribution: summary.workTypeDistribution,
        samplingReason: summary.samplingReason,
      },
      update: {
        sampledWorkUnits: summary.sampledWorkUnits,
        samplingReason: summary.samplingReason,
        totalWorkUnits: summary.totalWorkUnits,
        totalCommits: summary.totalCommits,
        avgImpactScore: summary.avgImpactScore,
        workTypeDistribution: summary.workTypeDistribution,
      },
    });
  }

  console.log(`[Sampling] Saved repo summaries for ${summaries.length} repos`);
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
