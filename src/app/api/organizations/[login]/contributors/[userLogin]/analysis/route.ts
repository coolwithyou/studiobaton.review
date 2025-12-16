/**
 * 기여자 연도별 분석 목록 API
 * GET /api/organizations/[login]/contributors/[userLogin]/analysis
 * POST /api/organizations/[login]/contributors/[userLogin]/analysis (분석 시작)
 * 
 * 해당 기여자의 연도별 분석 상태 목록을 반환하고, 분석을 시작합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

interface YearAnalysis {
  year: number;
  syncStatus: string;
  analysisId: string | null;
  analysisStatus: string | null;
  phase: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  hasReport: boolean;
}

// GET: 연도별 분석 상태 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ login: string; userLogin: string }> }
) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { login: orgLogin, userLogin } = await params;

    // 조직 조회
    const org = await db.organization.findUnique({
      where: { login: orgLogin },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // 수집 완료된 연도 목록
    const syncJobs = await db.commitSyncJob.findMany({
      where: {
        orgId: org.id,
        status: "COMPLETED",
      },
      orderBy: { year: "desc" },
    });

    // 해당 사용자의 분석 목록
    const analysisRuns = await db.analysisRun.findMany({
      where: {
        orgId: org.id,
        userLogin,
      },
      include: {
        reports: {
          where: { userLogin },
          select: { id: true },
        },
      },
    });
    const analysisMap = new Map(analysisRuns.map((r) => [r.year, r]));

    // 연도별 분석 상태 구성
    const yearAnalyses: YearAnalysis[] = syncJobs.map((job) => {
      const analysis = analysisMap.get(job.year);
      return {
        year: job.year,
        syncStatus: job.status,
        analysisId: analysis?.id || null,
        analysisStatus: analysis?.status || null,
        phase: analysis?.phase || null,
        startedAt: analysis?.startedAt?.toISOString() || null,
        finishedAt: analysis?.finishedAt?.toISOString() || null,
        hasReport: (analysis?.reports?.length || 0) > 0,
      };
    });

    return NextResponse.json({
      orgLogin,
      userLogin,
      analyses: yearAnalyses,
    });
  } catch (error) {
    console.error("Analysis list error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: 분석 시작
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ login: string; userLogin: string }> }
) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { login: orgLogin, userLogin } = await params;
    const body = await request.json();
    const { year } = body;

    if (!year) {
      return NextResponse.json(
        { error: "Missing required field: year" },
        { status: 400 }
      );
    }

    // 조직 조회
    const org = await db.organization.findUnique({
      where: { login: orgLogin },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // 커밋 동기화 완료 여부 확인
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
        { error: "Commit sync not completed for this year" },
        { status: 400 }
      );
    }

    // 해당 사용자가 해당 연도에 커밋이 있는지 확인
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

    // 기존 분석 확인
    const existingRun = await db.analysisRun.findUnique({
      where: {
        orgId_year_userLogin: {
          orgId: org.id,
          year,
          userLogin,
        },
      },
    });

    if (existingRun && existingRun.status === "IN_PROGRESS") {
      return NextResponse.json(
        {
          error: "Analysis already in progress",
          analysisRunId: existingRun.id,
          status: existingRun.status,
          phase: existingRun.phase,
        },
        { status: 409 }
      );
    }

    // 분석 Run 생성/업데이트
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

    // 백그라운드 분석 시작
    runUserAnalysis(analysisRun.id, org.id, year, userLogin).catch(console.error);

    return NextResponse.json({
      success: true,
      analysisRunId: analysisRun.id,
      orgLogin,
      userLogin,
      year,
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

async function runUserAnalysis(
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

    // 3. Phase 2: WorkUnit 클러스터링
    await updatePhase(analysisRunId, "CLUSTERING", 2, "WorkUnit 클러스터링 중...");
    const { clusterCommitsIntoWorkUnits, saveWorkUnitsToDb } = await import("@/lib/analysis/clustering");

    const workUnits = await clusterCommitsIntoWorkUnits(orgId, userLogin, year);
    await saveWorkUnitsToDb(analysisRunId, workUnits);

    // 4. Phase 3: 임팩트 스코어링
    await updatePhase(analysisRunId, "SCORING", 3, "임팩트 스코어링 중...");
    const { updateWorkUnitScores } = await import("@/lib/analysis/scoring");
    await updateWorkUnitScores(analysisRunId, orgId);

    // 5. Phase 4: 샘플링
    await updatePhase(analysisRunId, "SAMPLING", 4, "AI 샘플링 중...");
    const { selectSamplesPerUserPerRepo, saveSamplingResultForUser } = await import("@/lib/ai/sampling");

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

      const samplingResult = await selectSamplesPerUserPerRepo(userWorkUnitData);
      await saveSamplingResultForUser(analysisRunId, userLogin, samplingResult);
    }

    // AI 분석 (ANTHROPIC_API_KEY가 있는 경우만)
    if (process.env.ANTHROPIC_API_KEY) {
      // 6. Phase 5: Diff 조회
      await updatePhase(analysisRunId, "DIFF_FETCH", 5, "Diff 조회 중...");
      const { fetchAndSaveDiffsForAnalysis } = await import("@/lib/analysis/diff");
      await fetchAndSaveDiffsForAnalysis(analysisRunId, orgId);

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

