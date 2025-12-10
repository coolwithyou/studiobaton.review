import { LLMProvider, ReviewInput, ReviewResult } from "./types";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { PROMPT_VERSION } from "./prompts";

export * from "./types";
export * from "./prompts";

// ============================================
// LLM Provider 팩토리
// ============================================

export type LLMModelType = "gpt-4o" | "claude-sonnet-4-5";

export function createLLMProvider(model: LLMModelType): LLMProvider {
  switch (model) {
    case "gpt-4o":
      return new OpenAIProvider("gpt-4o");
    case "claude-sonnet-4-5":
      return new AnthropicProvider("claude-sonnet-4-5-20241022");
    default:
      return new AnthropicProvider("claude-sonnet-4-5-20241022");
  }
}

// ============================================
// 리뷰 생성 헬퍼
// ============================================

export async function generateReview(
  model: LLMModelType,
  input: ReviewInput
): Promise<{
  result: ReviewResult;
  model: string;
  promptVersion: string;
  inputTokens?: number;
  outputTokens?: number;
}> {
  const provider = createLLMProvider(model);
  const result = await provider.generateReview(input);

  return {
    result,
    model,
    promptVersion: PROMPT_VERSION,
    // 실제 토큰 수는 API 응답에서 가져올 수 있음
  };
}

// ============================================
// 비용 추정
// ============================================

export function estimateReviewCost(
  model: LLMModelType,
  input: ReviewInput
): number {
  const provider = createLLMProvider(model);
  return provider.estimateCost(input);
}

// ============================================
// 토큰 수 추정 (대략)
// ============================================

export function estimateTokens(text: string): number {
  // 영어 기준 대략 4자당 1토큰, 한국어는 더 많음
  return Math.ceil(text.length / 3);
}

