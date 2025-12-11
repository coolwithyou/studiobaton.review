import Anthropic from "@anthropic-ai/sdk";
import { LLMProvider, ReviewInput, ReviewResult } from "../types";
import { SYSTEM_PROMPT, buildReviewPrompt, PROMPT_VERSION } from "../prompts";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(model: string = "claude-sonnet-4-5-20250929") {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.model = model;
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

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    // 텍스트 블록 추출
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Anthropic");
    }

    // JSON 파싱 (마크다운 코드 블록 제거)
    let jsonStr = textBlock.text;
    const jsonMatch = jsonStr.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const result = JSON.parse(jsonStr.trim()) as ReviewResult;

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
    const outputTokens = 500;

    // Claude 3.5 Sonnet 가격 (2024년 기준 대략)
    const inputCost = (promptTokens / 1000) * 0.003;
    const outputCost = (outputTokens / 1000) * 0.015;

    return inputCost + outputCost;
  }

  getPromptVersion(): string {
    return PROMPT_VERSION;
  }
}

