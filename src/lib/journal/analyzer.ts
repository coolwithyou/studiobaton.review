import { Octokit } from "octokit";
import OpenAI from "openai";
import {
  KeyCommitInfo,
  CommitReview,
  WeeklyAnalysisResult,
  MonthlyAnalysisResult,
} from "@/types";
import { getCommitDetails } from "@/lib/github";
import {
  buildStage1Prompt,
  buildStage2Prompt,
  buildStage3WeeklyPrompt,
  buildStage3MonthlyPrompt,
} from "./prompts";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface CommitForAnalysis {
  sha: string;
  message: string;
  repoName: string;
  repoFullName: string;
  additions: number;
  deletions: number;
  committedAt: Date;
}

export class JournalAnalyzer {
  constructor(
    private octokit: Octokit,
    private llmModel: string = "gpt-4o"
  ) { }

  // ============================================
  // Stage 1: 주요 커밋 선별
  // ============================================

  async selectKeyCommits(
    commits: CommitForAnalysis[],
    topN: number = 5
  ): Promise<KeyCommitInfo[]> {
    // 커밋이 없으면 빈 배열 반환
    if (commits.length === 0) {
      return [];
    }

    // 커밋 수가 topN보다 적으면 전부 선택
    if (commits.length <= topN) {
      return commits.map((c) => ({
        sha: c.sha,
        message: c.message,
        repoFullName: c.repoFullName,
        additions: c.additions,
        deletions: c.deletions,
        committedAt: c.committedAt.toISOString(),
        reason: "주요 커밋으로 자동 선정",
        score: 80,
      }));
    }

    // 커밋 수가 50개를 초과하면 변경량 기준 상위 50개만 선택
    let commitsForLLM = commits;
    if (commits.length > 50) {
      commitsForLLM = [...commits]
        .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
        .slice(0, 50);
    }

    const prompt = buildStage1Prompt(commitsForLLM, "week");

    try {
      const response = await openai.chat.completions.create({
        model: this.llmModel,
        messages: [
          {
            role: "system",
            content:
              "당신은 소프트웨어 개발 활동을 분석하는 전문가입니다. 커밋 내역을 바탕으로 중요한 커밋을 선별합니다.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1000,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from LLM");
      }

      const result = JSON.parse(content);
      const llmKeyCommits = result.keyCommits || [];

      console.log(`[selectKeyCommits] LLM returned ${llmKeyCommits.length} key commits`);

      // SHA 매칭 함수 - LLM이 짧은 SHA를 반환해도 매칭되도록
      const findMatchingCommit = (sha: string) => {
        // 정확한 매칭 시도
        let match = commits.find((c) => c.sha === sha);
        if (match) return match;

        // 짧은 SHA로 시작하는 커밋 찾기 (LLM이 축약된 SHA 반환 시)
        match = commits.find((c) => c.sha.startsWith(sha) || sha.startsWith(c.sha.slice(0, 7)));
        return match;
      };

      // 선별된 커밋의 전체 정보를 반환
      const selectedCommits = llmKeyCommits
        .map((kc: { sha: string; reason?: string; score?: number }) => {
          const commit = findMatchingCommit(kc.sha);
          if (!commit) {
            console.log(`[selectKeyCommits] SHA not found: ${kc.sha}`);
            return null;
          }
          return {
            sha: commit.sha,
            message: commit.message,
            repoFullName: commit.repoFullName,
            additions: commit.additions,
            deletions: commit.deletions,
            committedAt: commit.committedAt.toISOString(),
            reason: kc.reason || "주요 커밋으로 선정",
            score: kc.score || 50,
          };
        })
        .filter((c: KeyCommitInfo | null): c is KeyCommitInfo => c !== null)
        .sort((a: KeyCommitInfo, b: KeyCommitInfo) => b.score - a.score)
        .slice(0, topN);

      console.log(`[selectKeyCommits] Matched ${selectedCommits.length} commits`);

      // LLM 결과가 비어있거나 매칭된 커밋이 없으면 fallback
      if (selectedCommits.length === 0) {
        console.log(`[selectKeyCommits] No matches, falling back to change-based selection`);
        return [...commits]
          .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
          .slice(0, topN)
          .map((c) => ({
            sha: c.sha,
            message: c.message,
            repoFullName: c.repoFullName,
            additions: c.additions,
            deletions: c.deletions,
            committedAt: c.committedAt.toISOString(),
            reason: "변경량 기준 선정 (LLM 매칭 실패)",
            score: 50,
          }));
      }

      return selectedCommits;
    } catch (error) {
      console.error("Stage 1 LLM error:", error);
      // LLM 실패 시 변경량 기준 상위 topN개 반환
      return [...commits]
        .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
        .slice(0, topN)
        .map((c) => ({
          sha: c.sha,
          message: c.message,
          repoFullName: c.repoFullName,
          additions: c.additions,
          deletions: c.deletions,
          committedAt: c.committedAt.toISOString(),
          reason: "변경량 기준 선정 (LLM 분석 실패)",
          score: 50,
        }));
    }
  }

  // ============================================
  // Stage 2: 커밋 코드 리뷰
  // ============================================

  async reviewCommit(
    commit: KeyCommitInfo,
    repoOwner: string,
    repoName: string
  ): Promise<CommitReview> {
    try {
      // GitHub에서 커밋 diff 가져오기
      const commitDetails = await getCommitDetails(
        this.octokit,
        repoOwner,
        repoName,
        commit.sha
      );

      // 파일이 너무 많으면 주요 파일만 선택 (최대 10개)
      const selectedFiles = this.selectImportantFiles(
        commitDetails.files,
        10
      );

      // 각 파일의 patch를 최대 500줄로 제한
      const filesWithLimitedPatch = selectedFiles.map((f) => ({
        ...f,
        patch: f.patch
          ? f.patch.split("\n").slice(0, 500).join("\n")
          : undefined,
      }));

      const prompt = buildStage2Prompt({
        sha: commit.sha,
        message: commit.message,
        repoFullName: commit.repoFullName,
        additions: commit.additions,
        deletions: commit.deletions,
        files: filesWithLimitedPatch,
      });

      const response = await openai.chat.completions.create({
        model: this.llmModel,
        messages: [
          {
            role: "system",
            content:
              "당신은 코드 리뷰 전문가입니다. 커밋의 변경사항을 분석하여 기술적 품질, 임팩트, 리스크를 평가합니다.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1500,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from LLM");
      }

      const result = JSON.parse(content);

      return {
        sha: commit.sha,
        message: commit.message,
        repoFullName: commit.repoFullName,
        summary: result.summary || "코드 리뷰 생성 실패",
        technicalQuality: result.technicalQuality || "medium",
        complexity: result.complexity || "medium",
        impact: result.impact || [],
        risks: result.risks || [],
        learnings: result.learnings || [],
        filesAnalyzed: result.filesAnalyzed || [],
      };
    } catch (error) {
      console.error("Stage 2 review error:", error);
      // 에러 발생 시 기본 리뷰 반환
      return {
        sha: commit.sha,
        message: commit.message,
        repoFullName: commit.repoFullName,
        summary: `커밋 분석 실패: ${error instanceof Error ? error.message : "Unknown error"}`,
        technicalQuality: "medium",
        complexity: "medium",
        impact: ["분석 실패"],
        risks: ["리뷰 불가"],
        learnings: [],
        filesAnalyzed: [],
      };
    }
  }

  // ============================================
  // Stage 3: 주간 종합 분석
  // ============================================

  async synthesizeWeekly(
    keyCommits: KeyCommitInfo[],
    commitReviews: CommitReview[],
    allCommits: CommitForAnalysis[]
  ): Promise<WeeklyAnalysisResult> {
    if (keyCommits.length === 0) {
      return {
        summary: "이 기간에는 활동이 없었습니다.",
        keyActivities: [],
        workPattern: "활동 없음",
        technicalHighlights: [],
        insights: [],
        metrics: {
          totalCommits: 0,
          keyCommitsAnalyzed: 0,
          reposWorked: 0,
          linesChanged: 0,
        },
      };
    }

    const prompt = buildStage3WeeklyPrompt(keyCommits, commitReviews);

    try {
      const response = await openai.chat.completions.create({
        model: this.llmModel,
        messages: [
          {
            role: "system",
            content:
              "당신은 개발 활동 분석 전문가입니다. 주간 업무를 종합하여 명확하고 통찰력 있는 분석을 제공합니다.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1500,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from LLM");
      }

      const result = JSON.parse(content);

      // 메트릭 계산
      const reposWorked = new Set(allCommits.map((c) => c.repoFullName)).size;
      const linesChanged = allCommits.reduce(
        (sum, c) => sum + c.additions + c.deletions,
        0
      );

      return {
        summary: result.summary || "주간 분석 생성 실패",
        keyActivities: result.keyActivities || [],
        workPattern: result.workPattern || "분석 불가",
        technicalHighlights: result.technicalHighlights || [],
        insights: result.insights || [],
        metrics: {
          totalCommits: allCommits.length,
          keyCommitsAnalyzed: keyCommits.length,
          reposWorked,
          linesChanged,
        },
      };
    } catch (error) {
      console.error("Stage 3 weekly synthesis error:", error);
      // 에러 발생 시 기본 분석 반환
      const reposWorked = new Set(allCommits.map((c) => c.repoFullName)).size;
      const linesChanged = allCommits.reduce(
        (sum, c) => sum + c.additions + c.deletions,
        0
      );

      return {
        summary: `주간 분석 실패: ${error instanceof Error ? error.message : "Unknown error"}`,
        keyActivities: keyCommits.map((c) => c.message.split("\n")[0]),
        workPattern: "분석 실패",
        technicalHighlights: [],
        insights: [],
        metrics: {
          totalCommits: allCommits.length,
          keyCommitsAnalyzed: keyCommits.length,
          reposWorked,
          linesChanged,
        },
      };
    }
  }

  // ============================================
  // Stage 3: 월간 종합 분석
  // ============================================

  async synthesizeMonthly(
    weeklyResults: WeeklyAnalysisResult[],
    allCommits: CommitForAnalysis[]
  ): Promise<MonthlyAnalysisResult> {
    if (weeklyResults.length === 0) {
      return {
        summary: "이 달에는 활동이 없었습니다.",
        weeklyBreakdown: [],
        overallPattern: "활동 없음",
        achievements: [],
        technicalGrowth: [],
        recommendations: [],
        metrics: {
          totalCommits: 0,
          weeksActive: 0,
          reposWorked: 0,
          averageCommitsPerWeek: 0,
        },
      };
    }

    const prompt = buildStage3MonthlyPrompt(weeklyResults);

    try {
      const response = await openai.chat.completions.create({
        model: this.llmModel,
        messages: [
          {
            role: "system",
            content:
              "당신은 개발 활동 분석 전문가입니다. 월간 업무를 종합하여 성과와 성장을 분석하고 권장사항을 제공합니다.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2000,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from LLM");
      }

      const result = JSON.parse(content);

      // 메트릭 계산
      const reposWorked = new Set(allCommits.map((c) => c.repoFullName)).size;
      const weeksActive = weeklyResults.length;
      const averageCommitsPerWeek =
        weeksActive > 0 ? allCommits.length / weeksActive : 0;

      return {
        summary: result.summary || "월간 분석 생성 실패",
        weeklyBreakdown: result.weeklyBreakdown || [],
        overallPattern: result.overallPattern || "분석 불가",
        achievements: result.achievements || [],
        technicalGrowth: result.technicalGrowth || [],
        recommendations: result.recommendations || [],
        metrics: {
          totalCommits: allCommits.length,
          weeksActive,
          reposWorked,
          averageCommitsPerWeek: Math.round(averageCommitsPerWeek * 10) / 10,
        },
      };
    } catch (error) {
      console.error("Stage 3 monthly synthesis error:", error);
      // 에러 발생 시 기본 분석 반환
      const reposWorked = new Set(allCommits.map((c) => c.repoFullName)).size;
      const weeksActive = weeklyResults.length;
      const averageCommitsPerWeek =
        weeksActive > 0 ? allCommits.length / weeksActive : 0;

      return {
        summary: `월간 분석 실패: ${error instanceof Error ? error.message : "Unknown error"}`,
        weeklyBreakdown: weeklyResults.map((w, i) => ({
          week: i + 1,
          summary: w.summary,
          keyActivity: w.keyActivities[0] || "활동 없음",
        })),
        overallPattern: "분석 실패",
        achievements: [],
        technicalGrowth: [],
        recommendations: [],
        metrics: {
          totalCommits: allCommits.length,
          weeksActive,
          reposWorked,
          averageCommitsPerWeek: Math.round(averageCommitsPerWeek * 10) / 10,
        },
      };
    }
  }

  // ============================================
  // 헬퍼: 중요한 파일 선택
  // ============================================

  private selectImportantFiles(
    files: Array<{
      path: string;
      status: string;
      additions: number;
      deletions: number;
      changes: number;
      patch?: string;
    }>,
    maxCount: number
  ): Array<{
    path: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }> {
    // 중요하지 않은 파일 패턴
    const excludePatterns = [
      /^test\//,
      /\.test\./,
      /\.spec\./,
      /^docs\//,
      /^\.github\//,
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
    ];

    // 핵심 파일 패턴 (높은 우선순위)
    const corePatterns = [
      /^src\//,
      /^lib\//,
      /^core\//,
      /^app\//,
      /^api\//,
      /\.ts$/,
      /\.tsx$/,
      /\.js$/,
      /\.jsx$/,
    ];

    // 파일 필터링 및 우선순위 점수 계산
    const scoredFiles = files
      .filter((f) => !excludePatterns.some((pattern) => pattern.test(f.path)))
      .map((f) => {
        let score = f.changes; // 기본 점수: 변경량

        // 핵심 파일이면 점수 2배
        if (corePatterns.some((pattern) => pattern.test(f.path))) {
          score *= 2;
        }

        return { ...f, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxCount);

    return scoredFiles.map(({ path, status, additions, deletions, patch }) => ({
      path,
      status,
      additions,
      deletions,
      patch,
    }));
  }
}
