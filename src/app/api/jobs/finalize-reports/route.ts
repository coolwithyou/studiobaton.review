import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateReview, LLMModelType, ReviewResult } from "@/lib/llm";
import { buildYearlyReportPrompt, PROMPT_VERSION } from "@/lib/llm/prompts";
import { AnalysisOptions, ReportStats, WorkType } from "@/types";
import OpenAI from "openai";

interface FinalizeReportsPayload {
  runId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: FinalizeReportsPayload = await request.json();
    const { runId } = body;

    // 1. 분석 실행 조회
    const run = await db.analysisRun.findUnique({
      where: { id: runId },
      include: {
        org: { select: { login: true, name: true } },
        targetUsers: true,
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const options = run.options as AnalysisOptions;
    const llmModel = (options?.llmModel || "gpt-4o") as LLMModelType;

    // 2. 각 사용자별 연간 리포트 생성
    for (const targetUser of run.targetUsers) {
      const userLogin = targetUser.userLogin;

      // Work Unit 통계 조회
      const workUnits = await db.workUnit.findMany({
        where: {
          runId,
          userLogin,
        },
        include: {
          repo: { select: { fullName: true, name: true } },
          aiReview: true,
        },
      });

      if (workUnits.length === 0) continue;

      // 커밋 통계
      const commitCount = await db.commit.count({
        where: {
          authorLogin: userLogin,
          repo: { orgId: run.orgId },
          committedAt: {
            gte: new Date(`${run.year}-01-01`),
            lte: new Date(`${run.year}-12-31T23:59:59`),
          },
        },
      });

      // 통계 집계
      const totalAdditions = workUnits.reduce((sum, w) => sum + w.additions, 0);
      const totalDeletions = workUnits.reduce((sum, w) => sum + w.deletions, 0);
      const avgImpactScore =
        workUnits.reduce((sum, w) => sum + w.impactScore, 0) / workUnits.length;

      // 저장소별 기여도
      const repoContributions = new Map<string, number>();
      for (const wu of workUnits) {
        const count = repoContributions.get(wu.repo.name) || 0;
        repoContributions.set(wu.repo.name, count + wu.commitCount);
      }

      const topRepos = [...repoContributions.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, commits]) => ({
          name,
          commits,
          percentage: Math.round((commits / commitCount) * 100),
        }));

      // 작업 유형 분포
      const workTypeDistribution: Record<WorkType, number> = {
        feature: 0,
        bugfix: 0,
        refactor: 0,
        chore: 0,
        docs: 0,
        test: 0,
      };

      for (const wu of workUnits) {
        if (wu.aiReview) {
          const result = wu.aiReview.result as unknown as ReviewResult;
          const workType = result.workType || "feature";
          workTypeDistribution[workType] =
            (workTypeDistribution[workType] || 0) + 1;
        }
      }

      // 월별 활동
      const monthlyActivity = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        commits: 0,
        workUnits: 0,
      }));

      for (const wu of workUnits) {
        const month = wu.startAt.getMonth();
        monthlyActivity[month].workUnits++;
        monthlyActivity[month].commits += wu.commitCount;
      }

      // AI 리뷰 집계
      const aiReviews = workUnits
        .filter((wu) => wu.aiReview)
        .map((wu) => wu.aiReview!.result as unknown as ReviewResult);

      // 연간 리포트 요약 생성 (LLM)
      let summary = "";
      let strengths: string[] = [];
      let improvements: string[] = [];
      let actionItems: string[] = [];

      if (aiReviews.length > 0) {
        try {
          const reportPrompt = buildYearlyReportPrompt({
            userName: userLogin,
            year: run.year,
            totalCommits: commitCount,
            totalWorkUnits: workUnits.length,
            avgImpactScore,
            topRepos: topRepos.map((r) => r.name),
            workTypeDistribution,
            aiReviews: aiReviews.map((r) => ({
              summary: r.summary,
              strengths: r.strengths,
              risks: r.risks,
              suggestions: r.suggestions,
            })),
          });

          // OpenAI로 요약 생성
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content:
                  "당신은 연간 코드 리뷰 리포트를 작성하는 전문가입니다. 객관적이고 건설적인 피드백을 제공합니다.",
              },
              { role: "user", content: reportPrompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.3,
          });

          const content = response.choices[0]?.message?.content;
          if (content) {
            const reportResult = JSON.parse(content);
            summary = reportResult.summary || "";
            strengths = reportResult.strengths || [];
            improvements = reportResult.improvements || [];
            actionItems = reportResult.actionItems || [];
          }
        } catch (llmError) {
          console.error("LLM report generation error:", llmError);
          // LLM 실패 시 기본 요약
          summary = `${run.year}년 동안 ${commitCount}개의 커밋과 ${workUnits.length}개의 작업 묶음을 완료했습니다.`;
          strengths = aiReviews
            .flatMap((r) => r.strengths)
            .slice(0, 3);
          improvements = aiReviews
            .flatMap((r) => r.risks)
            .slice(0, 2);
          actionItems = aiReviews
            .flatMap((r) => r.suggestions)
            .slice(0, 3);
        }
      } else {
        summary = `${run.year}년 동안 ${commitCount}개의 커밋과 ${workUnits.length}개의 작업 묶음을 완료했습니다.`;
      }

      // 리포트 통계
      const stats: ReportStats = {
        totalCommits: commitCount,
        totalWorkUnits: workUnits.length,
        totalAdditions,
        totalDeletions,
        avgImpactScore: Math.round(avgImpactScore * 10) / 10,
        topRepos,
        workTypeDistribution,
        monthlyActivity,
      };

      // 연간 리포트 저장
      await db.yearlyReport.upsert({
        where: {
          runId_userLogin: {
            runId,
            userLogin,
          },
        },
        create: {
          runId,
          userLogin,
          year: run.year,
          stats: JSON.parse(JSON.stringify(stats)),
          summary,
          strengths,
          improvements,
          actionItems,
        },
        update: {
          stats: JSON.parse(JSON.stringify(stats)),
          summary,
          strengths,
          improvements,
          actionItems,
        },
      });
    }

    // 3. 분석 완료 처리
    await db.analysisRun.update({
      where: { id: runId },
      data: {
        status: "DONE",
        finishedAt: new Date(),
      },
    });

    // Job 로그 기록
    await db.jobLog.create({
      data: {
        runId,
        jobType: "finalize_reports",
        jobId: `finalize-${runId}-${Date.now()}`,
        status: "COMPLETED",
        output: { reportCount: run.targetUsers.length },
        startedAt: new Date(),
        endedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      reportCount: run.targetUsers.length,
    });
  } catch (error) {
    console.error("Finalize reports error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

