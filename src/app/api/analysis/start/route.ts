/**
 * 분석 시작 API
 * POST /api/analysis/start
 * 
 * 단일 기여자에 대한 연간 분석을 시작합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

interface StartAnalysisRequest {
  orgLogin: string;
  year: number;
  userLogin: string; // 분석 대상 기여자 (단일)
}

export async function POST(request: NextRequest) {
  try {
    // 1. 인증 확인
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. 요청 파싱
    const body: StartAnalysisRequest = await request.json();
    const { orgLogin, year, userLogin } = body;

    // 3. 유효성 검사
    if (!orgLogin || !year || !userLogin) {
      return NextResponse.json(
        { error: "Missing required fields: orgLogin, year, userLogin" },
        { status: 400 }
      );
    }

    const currentYear = new Date().getFullYear();
    if (year < 2000 || year > currentYear) {
      return NextResponse.json(
        { error: `Invalid year. Must be between 2000 and ${currentYear}` },
        { status: 400 }
      );
    }

    // 4. 조직 조회
    const org = await db.organization.findUnique({
      where: { login: orgLogin },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // 5. 커밋 동기화 상태 확인
    const syncJob = await db.commitSyncJob.findUnique({
      where: {
        orgId_year: {
          orgId: org.id,
          year,
        },
      },
    });

    if (!syncJob || syncJob.status !== "COMPLETED") {
      return NextResponse.json(
        { 
          error: "Commit sync not completed. Please sync commits first.",
          syncStatus: syncJob?.status || "NOT_STARTED",
        },
        { status: 400 }
      );
    }

    // 6. 대상자가 해당 연도에 커밋이 있는지 검증
    const startDate = new Date(`${year}-01-01T00:00:00Z`);
    const endDate = new Date(`${year}-12-31T23:59:59Z`);

    const commitCount = await db.commit.count({
      where: {
        authorLogin: userLogin,
        committedAt: { gte: startDate, lte: endDate },
        repo: { orgId: org.id },
      },
    });

    if (commitCount === 0) {
      return NextResponse.json(
        { error: "User has no commits in the selected year" },
        { status: 400 }
      );
    }

    // 7. 기존 분석 확인
    const existingRun = await db.analysisRun.findUnique({
      where: {
        orgId_year_userLogin: {
          orgId: org.id,
          year,
          userLogin,
        },
      },
    });

    if (existingRun && (existingRun.status === "IN_PROGRESS" || existingRun.status === "PAUSED")) {
      return NextResponse.json(
        {
          error: existingRun.status === "PAUSED" 
            ? "Analysis is paused. Please resume or restart it."
            : "Analysis already in progress",
          analysisRunId: existingRun.id,
          status: existingRun.status,
          phase: existingRun.phase,
        },
        { status: 409 }
      );
    }

    // 8. 분석 Run 생성/업데이트
    let analysisRun;
    if (existingRun) {
      analysisRun = await db.analysisRun.update({
        where: { id: existingRun.id },
        data: {
          status: "PENDING",
          phase: null,
          error: null,
          startedAt: null,
          finishedAt: null,
          progress: {
            currentStep: 0,
            totalSteps: 6,
            message: "분석 준비 중...",
          },
        },
      });
    } else {
      analysisRun = await db.analysisRun.create({
        data: {
          orgId: org.id,
          year,
          userLogin,
          status: "PENDING",
          progress: {
            currentStep: 0,
            totalSteps: 6,
            message: "분석 준비 중...",
          },
        },
      });
    }

    // 9. 백그라운드 분석 시작
    runAnalysis(analysisRun.id, org.id, year, userLogin).catch(console.error);

    return NextResponse.json({
      success: true,
      analysisRunId: analysisRun.id,
      orgLogin,
      year,
      userLogin,
      message: "Analysis started",
    });
  } catch (error) {
    console.error("Start analysis error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================
// 분석 실행 (백그라운드)
// ============================================

// 상태 체크 함수 - PAUSED면 true 반환
async function checkIfPaused(analysisRunId: string): Promise<boolean> {
  const run = await db.analysisRun.findUnique({
    where: { id: analysisRunId },
    select: { status: true },
  });
  return run?.status === "PAUSED";
}

async function runAnalysis(
  analysisRunId: string,
  orgId: string,
  year: number,
  userLogin: string
): Promise<void> {
  console.log(`[Analysis] Starting analysis for ${userLogin}: ${analysisRunId}`);

  try {
    // 1. 상태 업데이트: 진행 중
    await db.analysisRun.update({
      where: { id: analysisRunId },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });

    // 상태 체크
    if (await checkIfPaused(analysisRunId)) {
      console.log(`[Analysis] Paused before METRICS: ${analysisRunId}`);
      return;
    }

    // 2. Phase 1: 메트릭 계산
    await updatePhase(analysisRunId, "METRICS", 1, "메트릭 계산 중...");
    const { calculateDeveloperMetrics } = await import("@/lib/analysis/metrics");

    const metrics = await calculateDeveloperMetrics(orgId, userLogin, year);

    // YearlyReport 생성/업데이트
    await db.yearlyReport.upsert({
      where: {
        analysisRunId_userLogin: {
          analysisRunId,
          userLogin,
        },
      },
      create: {
        analysisRunId,
        userLogin,
        metrics: metrics as any,
      },
      update: {
        metrics: metrics as any,
      },
    });

    // 상태 체크
    if (await checkIfPaused(analysisRunId)) {
      console.log(`[Analysis] Paused before CLUSTERING: ${analysisRunId}`);
      return;
    }

    // 3. Phase 2: WorkUnit 클러스터링
    // 예측값 계산
    const { predictWorkUnitCount } = await import("@/lib/analysis/prediction");
    const workUnitPrediction = predictWorkUnitCount(
      metrics.productivity.totalCommits,
      metrics.diversity.repositoryCount
    );

    await updatePhaseWithPrediction(analysisRunId, "CLUSTERING", 2, "WorkUnit 클러스터링 중...", workUnitPrediction);
    const { clusterCommitsIntoWorkUnits, saveWorkUnitsToDb } = await import("@/lib/analysis/clustering");

    const workUnits = await clusterCommitsIntoWorkUnits(orgId, userLogin, year);
    await saveWorkUnitsToDb(analysisRunId, workUnits);

    // 상태 체크
    if (await checkIfPaused(analysisRunId)) {
      console.log(`[Analysis] Paused before SCORING: ${analysisRunId}`);
      return;
    }

    // 4. Phase 3: 임팩트 스코어링
    await updatePhase(analysisRunId, "SCORING", 3, "임팩트 스코어링 중...");
    const { updateWorkUnitScores } = await import("@/lib/analysis/scoring");
    await updateWorkUnitScores(analysisRunId, orgId);

    // 상태 체크
    if (await checkIfPaused(analysisRunId)) {
      console.log(`[Analysis] Paused before SAMPLING: ${analysisRunId}`);
      return;
    }

    // 5. Phase 4: AI 샘플링 (리포별 전체 커버리지)
    await updatePhase(analysisRunId, "SAMPLING", 4, "리포별 AI 샘플링 중...");
    const { selectSamplesPerUserPerRepo, saveSamplingResultForUser, saveRepoSummaries } = await import("@/lib/ai/sampling");

    // 해당 사용자의 WorkUnit 조회
    const userWorkUnits = await db.workUnit.findMany({
      where: { analysisRunId, userLogin },
      include: {
        commits: {
          include: {
            commit: {
              include: { files: true },
            },
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

      // 개선된 샘플링: 모든 리포 커버리지, 리포당 최대 5개
      const samplingResult = await selectSamplesPerUserPerRepo(userWorkUnitData, {
        minSamplesPerRepo: 1,
        maxSamplesPerRepo: 5,      // 리포당 최대 5개
        maxTotalSamples: null,     // 제한 없음
        heuristicThreshold: 5,     // 5개 이하는 전체 선택
        batchSize: 5,              // 5개 리포씩 배치 처리
      });

      // 샘플링 결과 저장
      await saveSamplingResultForUser(analysisRunId, userLogin, samplingResult);

      // 리포별 요약 저장
      if ('repoSummaries' in samplingResult && samplingResult.repoSummaries.length > 0) {
        await saveRepoSummaries(analysisRunId, samplingResult.repoSummaries);
      }

      console.log(`[Analysis] Sampled ${samplingResult.selectedWorkUnitIds.length} WorkUnits from ${'repoSummaries' in samplingResult ? samplingResult.repoSummaries.length : 0} repos for ${userLogin}`);
    }

    // AI 분석 (ANTHROPIC_API_KEY가 있는 경우만)
    if (process.env.ANTHROPIC_API_KEY) {
      // 상태 체크
      if (await checkIfPaused(analysisRunId)) {
        console.log(`[Analysis] Paused before DIFF_FETCH: ${analysisRunId}`);
        return;
      }

      // 6. Phase 5: Diff 조회
      await updatePhase(analysisRunId, "DIFF_FETCH", 5, "Diff 조회 중...");
      const { fetchAndSaveDiffsForAnalysis } = await import("@/lib/analysis/diff");
      await fetchAndSaveDiffsForAnalysis(analysisRunId, orgId);

      // 상태 체크
      if (await checkIfPaused(analysisRunId)) {
        console.log(`[Analysis] Paused before AI_ANALYSIS: ${analysisRunId}`);
        return;
      }

      // 7. Phase 6: AI 분석
      await updatePhase(analysisRunId, "AI_ANALYSIS", 6, "AI 분석 중...");

      // Stage 1: 코드 품질 분석
      const { runStage1Analysis } = await import("@/lib/ai/stages/stage1-code-quality");
      await runStage1Analysis(analysisRunId);

      // Stage 2-4
      await runDetailedUserAnalysis(analysisRunId, orgId, userLogin, year);
    } else {
      console.log("[Analysis] Skipping AI analysis (no ANTHROPIC_API_KEY)");
    }

    // 8. 완료
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

    console.log(`[Analysis] Completed for ${userLogin}: ${analysisRunId}`);
  } catch (error) {
    console.error(`[Analysis] Failed for ${userLogin}: ${analysisRunId}`, error);

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

async function updatePhaseWithPrediction(
  analysisRunId: string,
  phase: string,
  step: number,
  message: string,
  workUnitPrediction: { min: number; expected: number; max: number }
): Promise<void> {
  await db.analysisRun.update({
    where: { id: analysisRunId },
    data: {
      phase,
      progress: {
        currentStep: step,
        totalSteps: 6,
        message,
        workUnitPrediction,
      },
    },
  });
}

async function runDetailedUserAnalysis(
  analysisRunId: string,
  orgId: string,
  userLogin: string,
  year: number
): Promise<void> {
  const report = await db.yearlyReport.findUnique({
    where: {
      analysisRunId_userLogin: { analysisRunId, userLogin },
    },
  });

  if (!report) return;

  const metrics = report.metrics as any;

  // Stage 1 결과 수집
  const stage1Reviews = await db.aiReview.findMany({
    where: {
      workUnit: { analysisRunId, userLogin },
      stage: 1,
    },
  });

  const stage1Results = new Map(
    stage1Reviews.map((r) => [r.workUnitId!, r.result as any])
  );

  const stage1Summary = summarizeStage1(stage1Results);

  // Stage 2: 작업 패턴 분석
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

  console.log(`[Analysis] Detailed analysis completed for ${userLogin}`);
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

function getTopItems(items: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    counts.set(item, (counts.get(item) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([item]) => item);
}

function extractPrimaryPaths(paths: string[]): string[] {
  const dirCounts = new Map<string, number>();

  paths.forEach((path) => {
    const parts = path.split("/");
    const dir = parts.slice(0, Math.min(2, parts.length - 1)).join("/");
    if (dir) {
      dirCounts.set(dir, (dirCounts.get(dir) || 0) + 1);
    }
  });

  return Array.from(dirCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([dir]) => dir);
}
