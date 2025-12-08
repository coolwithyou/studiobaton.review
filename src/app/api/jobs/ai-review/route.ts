import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateReview, LLMModelType, ReviewInput } from "@/lib/llm";
import { AnalysisOptions, ImpactFactors } from "@/types";
import { PROMPT_VERSION } from "@/lib/llm/prompts";

interface AiReviewPayload {
  runId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: AiReviewPayload = await request.json();
    const { runId } = body;

    // 1. 분석 실행 조회
    const run = await db.analysisRun.findUnique({
      where: { id: runId },
      include: {
        org: { select: { login: true, name: true, settings: true } },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const options = run.options as AnalysisOptions;
    const llmModel = (options?.llmModel || "gpt-4o") as LLMModelType;
    const orgSettings = run.org.settings as { teamStandards?: string } | null;

    // 2. 샘플링된 Work Unit 조회
    const sampledWorkUnits = await db.workUnit.findMany({
      where: {
        runId,
        isSampled: true,
        aiReview: null, // 아직 리뷰가 없는 것만
      },
      include: {
        commits: {
          include: {
            commit: {
              include: {
                files: true,
              },
            },
          },
          orderBy: { order: "asc" },
        },
        repo: { select: { fullName: true, name: true } },
        user: { select: { login: true, name: true } },
      },
    });

    if (sampledWorkUnits.length === 0) {
      // 모든 리뷰 완료 → 최종 리포트 생성 단계로
      await db.analysisRun.update({
        where: { id: runId },
        data: { status: "FINALIZING" },
      });

      // Finalize Job 트리거
      /*
      await qstash.publishJSON({
        url: `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/finalize-reports`,
        body: { runId },
      });
      */

      return NextResponse.json({
        success: true,
        message: "All reviews completed",
      });
    }

    let reviewedCount = 0;
    let failedCount = 0;

    // 3. 각 Work Unit에 대해 리뷰 생성
    for (const workUnit of sampledWorkUnits) {
      try {
        // 리뷰 입력 데이터 구성
        const reviewInput: ReviewInput = {
          workUnit: {
            summary: workUnit.summary || "",
            commits: workUnit.commits.map((wuc) => ({
              sha: wuc.commit.sha,
              message: wuc.commit.message,
            })),
            primaryPaths: workUnit.primaryPaths,
            stats: {
              additions: workUnit.additions,
              deletions: workUnit.deletions,
              filesChanged: workUnit.filesChanged,
              commitCount: workUnit.commitCount,
            },
            impactScore: workUnit.impactScore,
            impactFactors: workUnit.impactFactors as unknown as ImpactFactors,
            startAt: workUnit.startAt.toISOString(),
            endAt: workUnit.endAt.toISOString(),
          },
          diffSamples: [], // TODO: Diff 샘플링 구현
          context: {
            orgName: run.org.login,
            repoName: workUnit.repo.name,
            userName: workUnit.user.login,
            year: run.year,
            teamStandards: orgSettings?.teamStandards,
          },
        };

        // LLM 리뷰 생성
        const { result, model, promptVersion } = await generateReview(
          llmModel,
          reviewInput
        );

        // 리뷰 저장
        await db.aiReview.create({
          data: {
            workUnitId: workUnit.id,
            model,
            promptVersion,
            result: JSON.parse(JSON.stringify(result)),
            rawResponse: JSON.stringify(result),
          },
        });

        reviewedCount++;
      } catch (error) {
        console.error(`Review failed for work unit ${workUnit.id}:`, error);
        failedCount++;
      }
    }

    // 4. 진행률 업데이트
    const totalSampled = await db.workUnit.count({
      where: { runId, isSampled: true },
    });
    const reviewed = await db.aiReview.count({
      where: { workUnit: { runId } },
    });

    await db.analysisRun.update({
      where: { id: runId },
      data: {
        progress: {
          total: totalSampled,
          completed: reviewed,
          failed: failedCount,
          phase: "REVIEWING",
        },
      },
    });

    // 5. 모든 리뷰 완료 확인
    if (reviewed >= totalSampled) {
      await db.analysisRun.update({
        where: { id: runId },
        data: { status: "FINALIZING" },
      });
    }

    // Job 로그 기록
    await db.jobLog.create({
      data: {
        runId,
        jobType: "ai_review",
        jobId: `review-${runId}-${Date.now()}`,
        status: failedCount > 0 ? "COMPLETED" : "COMPLETED",
        output: { reviewedCount, failedCount },
        startedAt: new Date(),
        endedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      reviewedCount,
      failedCount,
    });
  } catch (error) {
    console.error("AI review error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

