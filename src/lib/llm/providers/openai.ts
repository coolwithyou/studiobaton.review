import OpenAI from "openai";
import { LLMProvider, ReviewInput, ReviewResult } from "../types";
import { SYSTEM_PROMPT, buildReviewPrompt, PROMPT_VERSION } from "../prompts";

export class OpenAIProvider implements LLMProvider {
  name = "openai";
  private client: OpenAI;
  private model: string;

  constructor(model: string = "gpt-4o") {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.model = model;
  }

  // o1/o3 시리즈 모델인지 확인 (system role, temperature 미지원)
  private isReasoningModel(): boolean {
    return this.model.startsWith("o1") || this.model.startsWith("o3");
  }

  async generateReview(input: ReviewInput): Promise<ReviewResult> {
    const prompt = buildReviewPrompt({
      orgName: input.context.orgName,
      repoName: input.context.repoName,
      userName: input.context.userName,
      startAt: input.workUnit.startAt,
      endAt: input.workUnit.endAt,
      commitCount: input.workUnit.stats.commitCount,
      additions: input.workUnit.stats.additions,
      deletions: input.workUnit.stats.deletions,
      filesChanged: input.workUnit.stats.filesChanged,
      impactScore: input.workUnit.impactScore,
      commits: input.workUnit.commits,
      primaryPaths: input.workUnit.primaryPaths,
      diffSamples: input.diffSamples,
      teamStandards: input.context.teamStandards,
    });

    // reasoning 모델은 system role, temperature 미지원
    const isReasoning = this.isReasoningModel();

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: isReasoning
        ? [{ role: "user", content: `${SYSTEM_PROMPT}\n\n${prompt}` }]
        : [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      response_format: { type: "json_object" },
      // 최신 OpenAI API는 max_completion_tokens 사용 (max_tokens는 deprecated)
      max_completion_tokens: 1000,
      ...(isReasoning ? {} : { temperature: 0.3 }),
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const result = JSON.parse(content) as ReviewResult;

    // 유효성 검증 및 기본값
    return {
      summary: result.summary || "요약을 생성할 수 없습니다.",
      workType: result.workType || "feature",
      complexity: result.complexity || "medium",
      strengths: result.strengths || [],
      risks: result.risks || [],
      suggestions: result.suggestions || [],
      learningPoints: result.learningPoints || [],
      confidence: result.confidence || 0.5,
    };
  }

  estimateCost(input: ReviewInput): number {
    // 대략적인 토큰 수 추정
    const promptTokens = JSON.stringify(input).length / 4;
    const outputTokens = 500; // 예상 출력

    // GPT-4o 가격 (2024년 기준 대략)
    const inputCost = (promptTokens / 1000) * 0.005;
    const outputCost = (outputTokens / 1000) * 0.015;

    return inputCost + outputCost;
  }

  getPromptVersion(): string {
    return PROMPT_VERSION;
  }
}

