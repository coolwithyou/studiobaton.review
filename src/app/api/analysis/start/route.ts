/**
 * 분석 시작 API
 * POST /api/analysis/start
 * 
 * 연간 분석을 시작합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

interface StartAnalysisRequest {
  orgLogin: string;
  year: number;
  userLogins?: string[]; // 특정 사용자만 분석 (선택)
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
    const { orgLogin, year, userLogins } = body;

    // 3. 유효성 검사
    if (!orgLogin || !year) {
      return NextResponse.json(
        { error: "Missing required fields: orgLogin, year" },
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

    // 6. 기존 분석 확인
    const existingRun = await db.analysisRun.findUnique({
      where: {
        orgId_year: {
          orgId: org.id,
          year,
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

    // 7. 분석 Run 생성/업데이트
    let analysisRun;
    if (existingRun) {
      // 기존 분석 재시작
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
      // 새 분석 생성
      analysisRun = await db.analysisRun.create({
        data: {
          orgId: org.id,
          year,
          status: "PENDING",
          progress: {
            currentStep: 0,
            totalSteps: 6,
            message: "분석 준비 중...",
          },
        },
      });
    }

    // 8. 분석 대상 사용자 확인
    const targetUsers = userLogins || await getActiveUsers(org.id, year);

    if (targetUsers.length === 0) {
      await db.analysisRun.update({
        where: { id: analysisRun.id },
        data: {
          status: "FAILED",
          error: "No users found with commits in the specified year",
        },
      });

      return NextResponse.json(
        { error: "No users found with commits" },
        { status: 400 }
      );
    }

    // 9. 백그라운드 분석 시작 (개발 환경에서는 직접 실행)
    const isDevelopment = process.env.NODE_ENV === "development";

    if (isDevelopment) {
      // 로컬: 직접 실행 (비동기)
      runAnalysis(analysisRun.id, org.id, year, targetUsers).catch(console.error);
    } else {
      // 프로덕션: QStash를 통해 실행 (추후 구현)
      // await queueAnalysisJob(analysisRun.id);
      runAnalysis(analysisRun.id, org.id, year, targetUsers).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      analysisRunId: analysisRun.id,
      orgLogin,
      year,
      targetUsers,
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
// 분석 대상 사용자 조회
// ============================================

async function getActiveUsers(orgId: string, year: number): Promise<string[]> {
  const startDate = new Date(`${year}-01-01T00:00:00Z`);
  const endDate = new Date(`${year}-12-31T23:59:59Z`);

  const users = await db.commit.groupBy({
    by: ['authorLogin'],
    where: {
      committedAt: {
        gte: startDate,
        lte: endDate,
      },
      repo: { orgId },
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  return users.map(u => u.authorLogin);
}

// ============================================
// 분석 실행 (백그라운드)
// ============================================

async function runAnalysis(
  analysisRunId: string,
  orgId: string,
  year: number,
  targetUsers: string[]
): Promise<void> {
  console.log(`[Analysis] Starting analysis: ${analysisRunId}`);

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

    for (const userLogin of targetUsers) {
      try {
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
      } catch (error) {
        console.error(`[Analysis] Metrics failed for ${userLogin}:`, error);
      }
    }

    // 3. Phase 2: WorkUnit 클러스터링
    await updatePhase(analysisRunId, "CLUSTERING", 2, "WorkUnit 클러스터링 중...");
    const { clusterCommitsIntoWorkUnits, saveWorkUnitsToDb } = await import("@/lib/analysis/clustering");

    for (const userLogin of targetUsers) {
      try {
        const workUnits = await clusterCommitsIntoWorkUnits(orgId, userLogin, year);
        await saveWorkUnitsToDb(analysisRunId, workUnits);
      } catch (error) {
        console.error(`[Analysis] Clustering failed for ${userLogin}:`, error);
      }
    }

    // 4. Phase 3: 임팩트 스코어링
    await updatePhase(analysisRunId, "SCORING", 3, "임팩트 스코어링 중...");
    const { updateWorkUnitScores } = await import("@/lib/analysis/scoring");
    await updateWorkUnitScores(analysisRunId, orgId);

    // 5. Phase 4: AI 샘플링
    await updatePhase(analysisRunId, "SAMPLING", 4, "AI 샘플링 중...");
    
    // WorkUnit 조회
    const workUnits = await db.workUnit.findMany({
      where: { analysisRunId },
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
      orderBy: { impactScore: 'desc' },
    });

    // WorkUnitData 형식으로 변환
    const workUnitData = workUnits.map(wu => ({
      id: wu.id,
      userLogin: wu.userLogin,
      repoId: wu.repoId,
      repoFullName: wu.repo.fullName,
      workType: wu.workType as any,
      impactScore: wu.impactScore,
      impactFactors: wu.impactFactors as any,
      commits: wu.commits.map(wuc => ({
        sha: wuc.commit.sha,
        message: wuc.commit.message,
        additions: wuc.commit.additions,
        deletions: wuc.commit.deletions,
        filesChanged: wuc.commit.filesChanged,
        committedAt: wuc.commit.committedAt,
        files: wuc.commit.files.map(f => ({
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
      primaryPaths: [],
    }));

    // AI 샘플링 (옵션: ANTHROPIC_API_KEY가 있는 경우만)
    if (process.env.ANTHROPIC_API_KEY) {
      const { selectSamplesWithAI, saveSamplingResult } = await import("@/lib/ai/sampling");
      const samplingResult = await selectSamplesWithAI(workUnitData);
      await saveSamplingResult(analysisRunId, samplingResult);

      // 6. Phase 5: Diff 조회 및 저장
      await updatePhase(analysisRunId, "DIFF_FETCH", 5, "Diff 조회 중...");
      const { fetchAndSaveDiffsForAnalysis } = await import("@/lib/analysis/diff");
      await fetchAndSaveDiffsForAnalysis(analysisRunId, orgId);

      // 7. Phase 6: AI 분석 (각 Stage)
      await updatePhase(analysisRunId, "AI_ANALYSIS", 6, "AI 분석 중...");
      
      // Stage 1: 코드 품질 분석
      const { runStage1Analysis } = await import("@/lib/ai/stages/stage1-code-quality");
      await runStage1Analysis(analysisRunId);

      // Stage 2-4는 사용자별로 실행
      for (const userLogin of targetUsers) {
        await runUserAnalysis(analysisRunId, orgId, userLogin, year);
      }
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

    console.log(`[Analysis] Completed: ${analysisRunId}`);
  } catch (error) {
    console.error(`[Analysis] Failed: ${analysisRunId}`, error);
    
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

async function runUserAnalysis(
  analysisRunId: string,
  orgId: string,
  userLogin: string,
  year: number
): Promise<void> {
  try {
    // 리포트 조회
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
        workUnit: {
          analysisRunId,
          userLogin,
        },
        stage: 1,
      },
    });

    const stage1Results = new Map(
      stage1Reviews.map(r => [r.workUnitId!, r.result as any])
    );

    // Stage 1 요약
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

    console.log(`[Analysis] User analysis completed: ${userLogin}`);
  } catch (error) {
    console.error(`[Analysis] User analysis failed for ${userLogin}:`, error);
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

  return {
    avgScore: Math.round(avg(values.map(v => v?.codeQuality?.score || 5)) * 10) / 10,
    avgReadability: Math.round(avg(values.map(v => v?.codeQuality?.readability || 5)) * 10) / 10,
    avgMaintainability: Math.round(avg(values.map(v => v?.codeQuality?.maintainability || 5)) * 10) / 10,
    avgBestPractices: Math.round(avg(values.map(v => v?.codeQuality?.bestPractices || 5)) * 10) / 10,
    commonStrengths: getTopItems(values.flatMap(v => v?.strengths || []), 5),
    commonWeaknesses: getTopItems(values.flatMap(v => v?.weaknesses || []), 5),
    commonPatterns: getTopItems(values.flatMap(v => v?.codePatterns || []), 5),
  };
}

function getTopItems(items: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  items.forEach(item => {
    counts.set(item, (counts.get(item) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([item]) => item);
}
