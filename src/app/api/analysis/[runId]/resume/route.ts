/**
 * 분석 재개 API
 * POST /api/analysis/[runId]/resume
 * 
 * 일시 정지된 분석을 재개합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

interface RouteContext {
  params: Promise<{
    runId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    // 1. 인증 확인
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId } = await context.params;

    // 2. 분석 Run 조회
    const analysisRun = await db.analysisRun.findUnique({
      where: { id: runId },
      include: {
        org: {
          select: { id: true, login: true },
        },
      },
    });

    if (!analysisRun) {
      return NextResponse.json(
        { error: "Analysis run not found" },
        { status: 404 }
      );
    }

    // 3. 상태 확인 (일시 정지된 경우만 재개 가능)
    if (analysisRun.status !== "PAUSED") {
      return NextResponse.json(
        { 
          error: "Only paused analysis can be resumed",
          currentStatus: analysisRun.status,
        },
        { status: 400 }
      );
    }

    // 4. 진행 중 상태로 업데이트
    await db.analysisRun.update({
      where: { id: runId },
      data: {
        status: "IN_PROGRESS",
        progress: {
          ...(analysisRun.progress as any),
          message: `재개됨 - ${analysisRun.phase} 단계부터 계속`,
        },
      },
    });

    // 5. 중단된 단계부터 분석 재개
    resumeAnalysis(
      runId,
      analysisRun.org.id,
      analysisRun.year,
      analysisRun.userLogin,
      analysisRun.phase
    ).catch(console.error);

    console.log(`[Analysis] Resumed: ${runId} from phase ${analysisRun.phase}`);

    return NextResponse.json({
      success: true,
      analysisRunId: runId,
      status: "IN_PROGRESS",
      phase: analysisRun.phase,
      message: "Analysis resumed",
    });
  } catch (error) {
    console.error("Resume analysis error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================
// 분석 재개 (백그라운드)
// ============================================

async function resumeAnalysis(
  analysisRunId: string,
  orgId: string,
  year: number,
  userLogin: string,
  currentPhase: string | null
): Promise<void> {
  console.log(`[Analysis] Resuming analysis from phase: ${currentPhase}`);

  try {
    // 현재 phase에 따라 다음 단계부터 실행
    const phases = ["METRICS", "CLUSTERING", "SCORING", "SAMPLING", "DIFF_FETCH", "AI_ANALYSIS"];
    const currentIndex = currentPhase ? phases.indexOf(currentPhase) : -1;

    // 각 phase별 실행 함수
    const phaseHandlers: Record<string, () => Promise<void>> = {
      METRICS: async () => {
        await updatePhase(analysisRunId, "METRICS", 1, "메트릭 계산 중...");
        const { calculateDeveloperMetrics } = await import("@/lib/analysis/metrics");
        const metrics = await calculateDeveloperMetrics(orgId, userLogin, year);
        
        await db.yearlyReport.upsert({
          where: { analysisRunId_userLogin: { analysisRunId, userLogin } },
          create: { analysisRunId, userLogin, metrics: metrics as any },
          update: { metrics: metrics as any },
        });
      },
      CLUSTERING: async () => {
        await updatePhase(analysisRunId, "CLUSTERING", 2, "WorkUnit 클러스터링 중...");
        const { clusterCommitsIntoWorkUnits, saveWorkUnitsToDb } = await import("@/lib/analysis/clustering");
        const workUnits = await clusterCommitsIntoWorkUnits(orgId, userLogin, year);
        await saveWorkUnitsToDb(analysisRunId, workUnits);
      },
      SCORING: async () => {
        await updatePhase(analysisRunId, "SCORING", 3, "임팩트 스코어링 중...");
        const { updateWorkUnitScores } = await import("@/lib/analysis/scoring");
        await updateWorkUnitScores(analysisRunId, orgId);
      },
      SAMPLING: async () => {
        await runSamplingPhase(analysisRunId, userLogin);
      },
      DIFF_FETCH: async () => {
        await updatePhase(analysisRunId, "DIFF_FETCH", 5, "Diff 조회 중...");
        const { fetchAndSaveDiffsForAnalysis } = await import("@/lib/analysis/diff");
        await fetchAndSaveDiffsForAnalysis(analysisRunId, orgId);
      },
      AI_ANALYSIS: async () => {
        await runAIAnalysisPhase(analysisRunId, orgId, userLogin, year);
      },
    };

    // 현재 phase부터 끝까지 실행
    for (let i = currentIndex; i < phases.length; i++) {
      // 상태 체크 - PAUSED면 중단
      const run = await db.analysisRun.findUnique({
        where: { id: analysisRunId },
        select: { status: true },
      });

      if (run?.status === "PAUSED") {
        console.log(`[Analysis] Paused at phase: ${phases[i]}`);
        return;
      }

      if (run?.status === "FAILED") {
        console.log(`[Analysis] Failed at phase: ${phases[i]}`);
        return;
      }

      const phase = phases[i];
      if (phaseHandlers[phase]) {
        // AI_ANALYSIS는 ANTHROPIC_API_KEY가 있는 경우만
        if (phase === "DIFF_FETCH" || phase === "AI_ANALYSIS") {
          if (!process.env.ANTHROPIC_API_KEY) {
            console.log("[Analysis] Skipping AI phases (no ANTHROPIC_API_KEY)");
            break;
          }
        }
        await phaseHandlers[phase]();
      }
    }

    // 완료
    await db.analysisRun.update({
      where: { id: analysisRunId },
      data: {
        status: "COMPLETED",
        phase: "DONE",
        finishedAt: new Date(),
        progress: {
          currentStep: 6,
          totalSteps: 6,
          message: "분석 완료",
        },
      },
    });

    console.log(`[Analysis] Completed (resumed) for ${userLogin}: ${analysisRunId}`);
  } catch (error) {
    console.error(`[Analysis] Failed during resume for ${userLogin}: ${analysisRunId}`, error);

    await db.analysisRun.update({
      where: { id: analysisRunId },
      data: {
        status: "FAILED",
        error: String(error),
        finishedAt: new Date(),
      },
    });
  }
}

async function runSamplingPhase(analysisRunId: string, userLogin: string) {
  await updatePhase(analysisRunId, "SAMPLING", 4, "리포별 AI 샘플링 중...");
  const { selectSamplesPerUserPerRepo, saveSamplingResultForUser, saveRepoSummaries } = await import("@/lib/ai/sampling");

  const userWorkUnits = await db.workUnit.findMany({
    where: { analysisRunId, userLogin },
    include: {
      commits: {
        include: {
          commit: { include: { files: true } },
        },
      },
      repo: true,
    },
    orderBy: { impactScore: "desc" },
  });

  if (userWorkUnits.length > 0) {
    const userWorkUnitData = userWorkUnits.map((wu) => ({
      id: wu.id,
      userLogin: wu.userLogin,
      repoId: wu.repoId,
      repoFullName: wu.repo.fullName,
      workType: wu.workType as any,
      impactScore: wu.impactScore,
      impactFactors: wu.impactFactors as any,
      commits: wu.commits.map((wuc) => ({
        sha: wuc.commit.sha,
        message: wuc.commit.message,
        additions: wuc.commit.additions,
        deletions: wuc.commit.deletions,
        filesChanged: wuc.commit.filesChanged,
        committedAt: wuc.commit.committedAt,
        files: wuc.commit.files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          status: f.status,
        })),
      })),
      startDate: wu.startDate,
      endDate: wu.endDate,
      totalAdditions: wu.commits.reduce((sum, c) => sum + c.commit.additions, 0),
      totalDeletions: wu.commits.reduce((sum, c) => sum + c.commit.deletions, 0),
      totalFilesChanged: wu.commits.reduce((sum, c) => sum + c.commit.filesChanged, 0),
      primaryPaths: extractPrimaryPaths(wu.commits.flatMap((wuc) => wuc.commit.files.map((f) => f.path))),
    }));

    const samplingResult = await selectSamplesPerUserPerRepo(userWorkUnitData, {
      minSamplesPerRepo: 1,
      maxSamplesPerRepo: 5,
      maxTotalSamples: null,
      heuristicThreshold: 5,
      batchSize: 5,
    });

    await saveSamplingResultForUser(analysisRunId, userLogin, samplingResult);

    if ('repoSummaries' in samplingResult && samplingResult.repoSummaries.length > 0) {
      await saveRepoSummaries(analysisRunId, samplingResult.repoSummaries);
    }
  }
}

async function runAIAnalysisPhase(
  analysisRunId: string,
  orgId: string,
  userLogin: string,
  year: number
) {
  await updatePhase(analysisRunId, "AI_ANALYSIS", 6, "AI 분석 중...");

  // Stage 1: 코드 품질 분석
  const { runStage1Analysis } = await import("@/lib/ai/stages/stage1-code-quality");
  await runStage1Analysis(analysisRunId);

  // Stage 2-4
  const report = await db.yearlyReport.findUnique({
    where: { analysisRunId_userLogin: { analysisRunId, userLogin } },
  });

  if (!report) return;

  const metrics = report.metrics as any;

  // Stage 1 결과 수집
  const stage1Reviews = await db.aiReview.findMany({
    where: { workUnit: { analysisRunId, userLogin }, stage: 1 },
  });

  const stage1Results = new Map(
    stage1Reviews.map((r) => [r.workUnitId!, r.result as any])
  );

  const stage1Summary = summarizeStage1(stage1Results);

  // Stage 2: 작업 패턴 분석
  try {
    const { analyzeWorkPattern, saveStage2Result } = await import("@/lib/ai/stages/stage2-work-pattern");
    const { result: stage2Result, tokenUsage: stage2Tokens } = await analyzeWorkPattern(
      analysisRunId,
      userLogin,
      stage1Results,
      metrics
    );
    await saveStage2Result(report.id, stage2Result, stage2Tokens);

    // Stage 3: 성장 포인트 도출
    const { analyzeGrowthPoints, saveStage3Result } = await import("@/lib/ai/stages/stage3-growth");
    const { result: stage3Result, tokenUsage: stage3Tokens } = await analyzeGrowthPoints(
      userLogin,
      stage1Summary,
      stage2Result,
      metrics
    );
    await saveStage3Result(report.id, stage3Result, stage3Tokens);

    // Stage 4: 종합 평가
    const { generateFinalSummary, saveStage4Result } = await import("@/lib/ai/stages/stage4-summary");
    const { result: stage4Result, tokenUsage: stage4Tokens } = await generateFinalSummary(
      userLogin,
      year,
      metrics,
      stage1Summary,
      stage2Result,
      stage3Result
    );
    await saveStage4Result(report.id, stage4Result, stage4Tokens);
  } catch (e) {
    console.log("[Analysis] Stage 2-4 failed:", e);
  }
}

function summarizeStage1(results: Map<string, any>) {
  const values = Array.from(results.values());

  if (values.length === 0) {
    return {
      avgScore: 5,
      avgReadability: 5,
      avgMaintainability: 5,
      avgBestPractices: 5,
      commonStrengths: [],
      commonWeaknesses: [],
      commonPatterns: [],
    };
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const getTopItems = (items: string[], limit: number) => {
    const counts = new Map<string, number>();
    items.forEach(item => counts.set(item, (counts.get(item) || 0) + 1));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([item]) => item);
  };

  return {
    avgScore: Math.round(avg(values.map((v) => v?.codeQuality?.score || 5)) * 10) / 10,
    avgReadability: Math.round(avg(values.map((v) => v?.codeQuality?.readability || 5)) * 10) / 10,
    avgMaintainability: Math.round(avg(values.map((v) => v?.codeQuality?.maintainability || 5)) * 10) / 10,
    avgBestPractices: Math.round(avg(values.map((v) => v?.codeQuality?.bestPractices || 5)) * 10) / 10,
    commonStrengths: getTopItems(values.flatMap((v) => v?.strengths || []), 5),
    commonWeaknesses: getTopItems(values.flatMap((v) => v?.weaknesses || []), 5),
    commonPatterns: getTopItems(values.flatMap((v) => v?.codePatterns || []), 5),
  };
}

async function updatePhase(
  analysisRunId: string,
  phase: string,
  step: number,
  message: string
): Promise<void> {
  await db.analysisRun.update({
    where: { id: analysisRunId },
    data: {
      phase,
      progress: {
        currentStep: step,
        totalSteps: 6,
        message,
      },
    },
  });
}

function extractPrimaryPaths(paths: string[]): string[] {
  const dirCounts = new Map<string, number>();
  paths.forEach((p) => {
    const parts = p.split("/");
    if (parts.length > 1) {
      const dir = parts.slice(0, 2).join("/");
      dirCounts.set(dir, (dirCounts.get(dir) || 0) + 1);
    }
  });
  return Array.from(dirCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([dir]) => dir);
}

