/**
 * 분석 모듈 인덱스
 */

// 메트릭 계산
export {
  calculateDeveloperMetrics,
  calculateMonthlyActivity,
  calculateTimeHeatmap,
  calculateWorkTypeDistribution,
  detectWorkType,
} from "./metrics";

// 클러스터링
export {
  clusterCommitsIntoWorkUnits,
  saveWorkUnitsToDb,
  calculateClusteringStats,
  type ClusteringConfig,
  type ClusteringStats,
} from "./clustering";

// 임팩트 스코어링
export {
  calculateImpactScore,
  scoreAllWorkUnits,
  updateWorkUnitScores,
  analyzeScoreDistribution,
  selectTopWorkUnits,
  selectRepresentativeWorkUnits,
  type ScoreDistribution,
} from "./scoring";

// Diff 조회
export {
  fetchCommitDiff,
  fetchMultipleCommitDiffs,
  saveCommitDiff,
  saveMultipleCommitDiffs,
  fetchAndSaveDiffsForSamples,
  fetchAndSaveDiffsForAnalysis,
  getCommitDiffById,
  getCommitDiffBySha,
  getWorkUnitDiffs,
  summarizeDiff,
  type CommitDiffData,
} from "./diff";

