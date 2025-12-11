import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { runAnalysis } from "@/lib/jobs/runner-optimized";
import { RestartMode, analyzeResumeState } from "@/lib/jobs/resume-handler";
import { AnalysisOptions } from "@/types";
import type { AnalysisRun } from "@prisma/client";
import { qstash } from "@/lib/qstash";

interface StartAnalysisRequest {
  orgLogin: string;
  year: number;
  userLogins: string[];
  options?: AnalysisOptions;
}

// 백그라운드에서 분석 실행 (QStash 또는 직접 실행)
async function startAnalysisJob(
  runId: string,
  mode: RestartMode,
  request: NextRequest
): Promise<void> {
  const isDevelopment = process.env.NODE_ENV === "development";

  if (isDevelopment) {
    // 로컬 개발 환경: 직접 실행
    console.log(`[Analysis] Running analysis locally for ${runId}`);
    runAnalysis(runId, mode).catch((error) => {
      console.error(`[Analysis] Background job failed for ${runId}:`, error);
    });
  } else {
    // 프로덕션 환경: QStash를 통해 실행
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
      const jobUrl = `${baseUrl}/api/jobs/run-analysis`;

      console.log(`[Analysis] Enqueuing analysis job via QStash: ${runId}`);

      await qstash.publishJSON({
        url: jobUrl,
        body: {
          runId,
          mode,
        },
        // 최대 30분 타임아웃 (분석은 시간이 오래 걸릴 수 있음)
        timeout: "30m",
        // 실패 시 1번만 재시도
        retries: 1,
      });

      console.log(`[Analysis] Analysis job enqueued successfully: ${runId}`);
    } catch (qstashError) {
      console.error(`[Analysis] Failed to enqueue job via QStash:`, qstashError);
      // QStash 실패 시 fallback으로 직접 실행
      console.log(`[Analysis] Falling back to direct execution for ${runId}`);
      runAnalysis(runId, mode).catch((error) => {
        console.error(`[Analysis] Background job failed for ${runId}:`, error);
      });
    }
  }
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
    const { orgLogin, year, userLogins, options = {} } = body;

    // 3. 유효성 검사
    if (!orgLogin || !year || !userLogins?.length) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 4. 조직 조회 (GitHub App 설치 확인)
    const org = await db.organization.findUnique({
      where: { login: orgLogin },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found. Please install GitHub App first." },
        { status: 404 }
      );
    }

    if (!org.installationId) {
      return NextResponse.json(
        { error: "GitHub App not installed for this organization." },
        { status: 400 }
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

    // 동기화가 완료되지 않았으면 차단
    if (!syncJob || syncJob.status !== "COMPLETED") {
      return NextResponse.json(
        {
          error: "해당 연도의 커밋 동기화가 필요합니다.",
          syncRequired: true,
          syncStatus: syncJob?.status || null,
          orgLogin,
          year,
        },
        { status: 400 }
      );
    }

    // 6. GitHubUser 레코드 확인/생성
    for (const login of userLogins) {
      await db.gitHubUser.upsert({
        where: { login },
        create: { login },
        update: {},
      });
    }

    // 7. 각 사용자별로 독립적인 AnalysisRun 생성
    const createdRuns: { runId: string; userLogin: string; status: string }[] = [];
    const errors: { userLogin: string; error: string }[] = [];

    for (const userLogin of userLogins) {
      try {
        // 기존 분석 확인 (조직 + 사용자 + 연도)
        const existingRun = await db.analysisRun.findUnique({
          where: {
            orgId_userLogin_year: {
              orgId: org.id,
              userLogin,
              year,
            },
          },
        });

        // 재시작 가능한 상태: FAILED, DONE, AWAITING_AI_CONFIRMATION
        const canRestart = ["FAILED", "DONE", "AWAITING_AI_CONFIRMATION"].includes(
          existingRun?.status || ""
        );

        if (existingRun && !canRestart) {
          errors.push({
            userLogin,
            error: `분석이 진행 중입니다 (상태: ${existingRun.status})`,
          });
          continue;
        }

        let analysisRun: AnalysisRun;

        if (existingRun && ["FAILED", "AWAITING_AI_CONFIRMATION"].includes(existingRun.status)) {
          // 실패하거나 AI 대기 중인 분석 재시작
          const resumeState = await analyzeResumeState(existingRun.id);

          console.log(
            `[Start] Restarting ${existingRun.status} analysis for ${userLogin} - ${resumeState.stats.totalCommits} commits`
          );

          analysisRun = await db.analysisRun.update({
            where: { id: existingRun.id },
            data: {
              status: "QUEUED",
              error: null,
              startedAt: null,
              finishedAt: null,
              options: {
                llmModel: options.llmModel || "gpt-4o",
                includeArchived: options.includeArchived || false,
                excludeRepos: options.excludeRepos || [],
                clusteringConfig: options.clusteringConfig || {},
                impactConfig: options.impactConfig || {},
              },
            },
          });

          // Work Unit과 Report만 정리 (커밋 데이터는 유지)
          await db.workUnitCommit.deleteMany({
            where: { workUnit: { runId: existingRun.id } },
          });
          await db.aiReview.deleteMany({
            where: { workUnit: { runId: existingRun.id } },
          });
          await db.workUnit.deleteMany({
            where: { runId: existingRun.id },
          });
          await db.yearlyReport.deleteMany({
            where: { runId: existingRun.id },
          });

          // 재시작 모드로 분석 실행
          await startAnalysisJob(analysisRun.id, RestartMode.RESUME, request);

          createdRuns.push({
            runId: analysisRun.id,
            userLogin,
            status: "resumed",
          });
        } else if (existingRun && existingRun.status === "DONE") {
          // 완료된 분석 재실행 (새로 시작)
          await db.workUnitCommit.deleteMany({
            where: { workUnit: { runId: existingRun.id } },
          });
          await db.aiReview.deleteMany({
            where: { workUnit: { runId: existingRun.id } },
          });
          await db.workUnit.deleteMany({
            where: { runId: existingRun.id },
          });
          await db.yearlyReport.deleteMany({
            where: { runId: existingRun.id },
          });
          await db.jobLog.deleteMany({
            where: { runId: existingRun.id },
          });

          analysisRun = await db.analysisRun.update({
            where: { id: existingRun.id },
            data: {
              status: "QUEUED",
              error: null,
              startedAt: null,
              finishedAt: null,
              options: {
                llmModel: options.llmModel || "gpt-4o",
                includeArchived: options.includeArchived || false,
                excludeRepos: options.excludeRepos || [],
                clusteringConfig: options.clusteringConfig || {},
                impactConfig: options.impactConfig || {},
              },
              progress: {
                total: 0,
                completed: 0,
                failed: 0,
                phase: "QUEUED",
                repoProgress: [],
              },
              createdById: session.user.id,
            },
          });

          await startAnalysisJob(analysisRun.id, RestartMode.FULL_RESTART, request);

          createdRuns.push({
            runId: analysisRun.id,
            userLogin,
            status: "restarted",
          });
        } else {
          // 새 분석 생성
          analysisRun = await db.analysisRun.create({
            data: {
              orgId: org.id,
              userLogin,
              year,
              status: "QUEUED",
              options: {
                llmModel: options.llmModel || "gpt-4o",
                includeArchived: options.includeArchived || false,
                excludeRepos: options.excludeRepos || [],
                clusteringConfig: options.clusteringConfig || {},
                impactConfig: options.impactConfig || {},
              },
              createdById: session.user.id,
              progress: {
                total: 0,
                completed: 0,
                failed: 0,
                phase: "QUEUED",
                repoProgress: [],
              },
            },
          });

          await startAnalysisJob(analysisRun.id, RestartMode.FULL_RESTART, request);

          createdRuns.push({
            runId: analysisRun.id,
            userLogin,
            status: "created",
          });
        }
      } catch (error) {
        console.error(`[Start] Error creating analysis for ${userLogin}:`, error);
        errors.push({
          userLogin,
          error: String(error),
        });
      }
    }

    // 8. 응답 반환
    if (createdRuns.length === 0) {
      return NextResponse.json(
        {
          error: "모든 분석 생성에 실패했습니다.",
          details: errors,
        },
        { status: 400 }
      );
    }

    // 단일 사용자 분석인 경우 첫 번째 runId를 직접 반환 (기존 호환성 유지)
    const firstRun = createdRuns[0];

    return NextResponse.json({
      success: true,
      runId: firstRun.runId, // 기존 호환성을 위해 첫 번째 runId 반환
      runs: createdRuns,
      message: `${createdRuns.length}개의 분석이 시작되었습니다.`,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Analysis start error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
