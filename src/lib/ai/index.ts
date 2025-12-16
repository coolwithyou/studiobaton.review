/**
 * AI 분석 모듈 인덱스
 */

// 클라이언트
export {
  getAnthropicClient,
  callClaude,
  callClaudeWithRetry,
  AI_MODEL,
  PROMPT_VERSION,
  calculateCost,
  type TokenUsage,
  type AIRequest,
  type AIResponse,
} from "./client";

// 샘플링
export {
  selectSamplesWithAI,
  saveSamplingResult,
  selectCommitsFromWorkUnit,
  type SamplingConfig,
  type CommitSampleResult,
} from "./sampling";

// Stage 1: 코드 품질
export {
  analyzeCodeQuality,
  analyzeCodeQualityBatch,
  saveStage1Result,
  getStage1Result,
  runStage1Analysis,
} from "./stages/stage1-code-quality";

// Stage 2: 작업 패턴
export {
  analyzeWorkPattern,
  saveStage2Result,
  getStage2Result,
} from "./stages/stage2-work-pattern";

// Stage 3: 성장 포인트
export {
  analyzeGrowthPoints,
  saveStage3Result,
  getStage3Result,
} from "./stages/stage3-growth";

// Stage 4: 종합 요약
export {
  generateFinalSummary,
  saveStage4Result,
  getStage4Result,
  calculateOverallScore,
  getGrade,
} from "./stages/stage4-summary";

