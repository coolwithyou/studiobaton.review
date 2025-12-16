/**
 * Anthropic Claude API 클라이언트
 * 
 * Claude Sonnet 4.5를 사용하여 개발자 평가 분석을 수행합니다.
 */

import Anthropic from "@anthropic-ai/sdk";

// ============================================
// 클라이언트 초기화
// ============================================

let anthropicClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");
    }

    anthropicClient = new Anthropic({
      apiKey,
    });
  }

  return anthropicClient;
}

// ============================================
// 모델 설정
// ============================================

export const AI_MODEL = "claude-sonnet-4-20250514";

export const MODEL_CONFIG = {
  maxTokens: 4096,
  temperature: 0.3, // 분석 작업에는 낮은 temperature가 적합
};

// ============================================
// 프롬프트 버전 관리
// ============================================

export const PROMPT_VERSION = "v1.0.0";

// ============================================
// 토큰 사용량 추적
// ============================================

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
}

// Claude Sonnet 4.5 가격 (2024년 기준, USD)
const PRICING = {
  inputPer1M: 3.0,  // $3 per 1M input tokens
  outputPer1M: 15.0, // $15 per 1M output tokens
};

export function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * PRICING.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * PRICING.outputPer1M;
  return Math.round((inputCost + outputCost) * 10000) / 10000; // 소수점 4자리
}

// ============================================
// API 호출 래퍼
// ============================================

export interface AIRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIResponse<T> {
  data: T;
  tokenUsage: TokenUsage;
  raw?: string;
}

export async function callClaude<T>(
  request: AIRequest
): Promise<AIResponse<T>> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: request.maxTokens || MODEL_CONFIG.maxTokens,
    temperature: request.temperature ?? MODEL_CONFIG.temperature,
    system: request.systemPrompt,
    messages: [
      {
        role: "user",
        content: request.userPrompt,
      },
    ],
  });

  // 응답 텍스트 추출
  const textContent = response.content.find(c => c.type === "text");
  const rawText = textContent?.type === "text" ? textContent.text : "";

  // JSON 파싱 시도
  let parsedData: T;
  try {
    // JSON 블록 추출
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) ||
                      rawText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      parsedData = JSON.parse(jsonStr);
    } else {
      // JSON이 아닌 경우 텍스트 그대로 반환
      parsedData = rawText as unknown as T;
    }
  } catch {
    console.warn("JSON 파싱 실패, 원본 텍스트 반환");
    parsedData = rawText as unknown as T;
  }

  // 토큰 사용량 계산
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const totalCost = calculateCost(inputTokens, outputTokens);

  return {
    data: parsedData,
    tokenUsage: {
      inputTokens,
      outputTokens,
      totalCost,
    },
    raw: rawText,
  };
}

// ============================================
// 재시도 로직
// ============================================

export async function callClaudeWithRetry<T>(
  request: AIRequest,
  maxRetries: number = 3
): Promise<AIResponse<T>> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await callClaude<T>(request);
    } catch (error: any) {
      lastError = error;
      
      // Rate limit 에러인 경우 대기 후 재시도
      if (error?.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000; // 지수 백오프
        console.log(`Rate limited. Waiting ${waitTime}ms before retry ${attempt}/${maxRetries}`);
        await sleep(waitTime);
        continue;
      }

      // 서버 에러인 경우 재시도
      if (error?.status >= 500) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`Server error. Waiting ${waitTime}ms before retry ${attempt}/${maxRetries}`);
        await sleep(waitTime);
        continue;
      }

      // 다른 에러는 즉시 throw
      throw error;
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

