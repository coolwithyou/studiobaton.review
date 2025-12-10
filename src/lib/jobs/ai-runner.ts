/**
 * AI Review & Report Generation Runner
 * 
 * Work Unit 샘플링, AI 리뷰 생성, 연간 리포트 생성을 담당합니다.
 */

import { db } from "@/lib/db";
import { generateReview, LLMModelType, ReviewInput, ReviewResult } from "@/lib/llm";
import { buildYearlyReportPrompt, PROMPT_VERSION } from "@/lib/llm/prompts";
import { AnalysisOptions, ImpactFactors, ReportStats, WorkType } from "@/types";
import OpenAI from "openai";

// 진행률 업데이트 헬퍼
async function updateProgress(
  runId: string,
  updates: {
    status?: string;
    phase?: string;
    total?: number;
    completed?: number;
    failed?: number;
    message?: string;
  }
) {
  const run = await db.analysisRun.findUnique({ where: { id: runId } });
  if (!run) return;

  const currentProgress = (run.progress as {
    phase?: string;
    total?: number;
    completed?: number;
    failed?: number;
    message?: string;
  }) || {};

  const newProgress = {
    phase: updates.phase ?? currentProgress.phase ?? "",
    total: updates.total ?? currentProgress.total ?? 0,
    completed: updates.completed ?? currentProgress.completed ?? 0,
    failed: updates.failed ?? currentProgress.failed ?? 0,
    message: updates.message ?? currentProgress.message ?? "",
  };

  await db.analysisRun.update({
    where: { id: runId },
    data: {
      status: (updates.status as any) || run.status,
      progress: JSON.parse(JSON.stringify(newProgress)),
    },
  });
}

// Work Unit 샘플링
async function sampleWorkUnits(runId: string): Promise<number> {
  console.log(`[Job] Sampling work units for run ${runId}`);

  // 임팩트 스코어가 높은 상위 Work Unit 선택
  const workUnits = await db.workUnit.findMany({
    where: { runId },
    orderBy: { impactScore: "desc" },
  });

  if (workUnits.length === 0) return 0;

  // 상위 20개 또는 전체의 30% 중 더 작은 수
  const sampleSize = Math.min(20, Math.ceil(workUnits.length * 0.3));
  const sampledIds = workUnits.slice(0, sampleSize).map((w) => w.id);

  await db.workUnit.updateMany({
    where: { id: { in: sampledIds } },
    data: { isSampled: true },
  });

  console.log(`[Job] Sampled ${sampleSize} work units out of ${workUnits.length}`);
  return sampleSize;
}

// AI 리뷰 생성
async function runAiReviews(runId: string): Promise<{ reviewed: number; failed: number }> {
  console.log(`[Job] Running AI reviews for run ${runId}`);

  const run = await db.analysisRun.findUnique({
    where: { id: runId },
    include: {
      org: { select: { login: true, name: true, settings: true } },
    },
  });

  if (!run) {
    throw new Error("Run not found");
  }

  const options = run.options as AnalysisOptions;
  const llmModel = (options?.llmModel || "gpt-4o") as LLMModelType;
  const orgSettings = run.org.settings as { teamStandards?: string } | null;

  // 샘플링된 Work Unit 조회
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

  let reviewed = 0;
  let failed = 0;
  const totalToReview = sampledWorkUnits.length;

  for (const workUnit of sampledWorkUnits) {
    try {
      // 진행률 업데이트
      await updateProgress(runId, {
        completed: reviewed,
        total: totalToReview,
        message: `Work Unit 리뷰 중: ${workUnit.repo.name}`,
      });

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

      reviewed++;
    } catch (error) {
      console.error(`[Job] Review failed for work unit ${workUnit.id}:`, error);
      failed++;
    }
  }

  // Job 로그 기록
  await db.jobLog.create({
    data: {
      runId,
      jobType: "ai_review",
      jobId: `review-${runId}-${Date.now()}`,
      status: "COMPLETED",
      output: { reviewed, failed },
      startedAt: new Date(),
      endedAt: new Date(),
    },
  });

  return { reviewed, failed };
}

// 연간 리포트 생성
async function generateReports(runId: string): Promise<number> {
  console.log(`[Job] Generating reports for run ${runId}`);

  const run = await db.analysisRun.findUnique({
    where: { id: runId },
    include: {
      org: { select: { login: true, name: true } },
      targetUsers: true,
    },
  });

  if (!run) {
    throw new Error("Run not found");
  }

  let reportCount = 0;

  for (const targetUser of run.targetUsers) {
    const userLogin = targetUser.userLogin;

    await updateProgress(runId, {
      message: `리포트 생성 중: ${userLogin}`,
    });

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

    // 데이터가 없는 경우에도 빈 리포트 생성
    if (workUnits.length === 0) {
      console.warn(`[Job] ⚠️ No Work Units for ${userLogin} - creating empty report`);

      // 커밋 조회 (Work Unit이 없어도 커밋은 있을 수 있음)
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

      // 빈 리포트 생성
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
          stats: JSON.parse(JSON.stringify({
            totalCommits: commitCount,
            totalWorkUnits: 0,
            totalAdditions: 0,
            totalDeletions: 0,
            avgImpactScore: 0,
            topRepos: [],
            workTypeDistribution: {},
            monthlyActivity: Array.from({ length: 12 }, (_, i) => ({
              month: i + 1,
              commits: 0,
              workUnits: 0,
            })),
          })),
          summary: commitCount > 0 
            ? `${run.year}년 동안 ${commitCount}개의 커밋이 수집되었으나 Work Unit 생성에 실패했습니다.`
            : `${run.year}년 동안 활동이 없거나 커밋 데이터 수집에 실패했습니다.`,
          strengths: [],
          improvements: ["데이터 수집 문제 확인 필요"],
          actionItems: ["관리자에게 문의하여 데이터 수집 상태 확인"],
        },
        update: {},
      });

      reportCount++;
      continue;
    }

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

    // 연간 리포트 요약 생성
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
        console.error("[Job] LLM report generation error:", llmError);
        // LLM 실패 시 기본 요약
        summary = `${run.year}년 동안 ${commitCount}개의 커밋과 ${workUnits.length}개의 작업 묶음을 완료했습니다.`;
        strengths = aiReviews.flatMap((r) => r.strengths).slice(0, 3);
        improvements = aiReviews.flatMap((r) => r.risks).slice(0, 2);
        actionItems = aiReviews.flatMap((r) => r.suggestions).slice(0, 3);
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

    reportCount++;
  }

  // 최종 검증: 모든 대상 사용자의 리포트 생성 확인
  const expectedReports = run.targetUsers.length;
  const generatedReports = await db.yearlyReport.findMany({
    where: { runId },
    select: { userLogin: true },
  });

  console.log(
    `[Job] Report generation summary: ${generatedReports.length}/${expectedReports} reports created`
  );

  if (generatedReports.length < expectedReports) {
    const generatedLogins = new Set(generatedReports.map(r => r.userLogin));
    const missingUsers = run.targetUsers.filter(
      u => !generatedLogins.has(u.userLogin)
    );

    console.error(
      `[Job] ⚠️ Missing reports for ${missingUsers.length} users:`,
      missingUsers.map(u => u.userLogin).join(", ")
    );

    // 누락된 사용자에 대해 빈 리포트 생성
    for (const missingUser of missingUsers) {
      console.log(`[Job] Creating empty report for ${missingUser.userLogin}`);

      await db.yearlyReport.create({
        data: {
          runId,
          userLogin: missingUser.userLogin,
          year: run.year,
          stats: JSON.parse(JSON.stringify({
            totalCommits: 0,
            totalWorkUnits: 0,
            totalAdditions: 0,
            totalDeletions: 0,
            avgImpactScore: 0,
            topRepos: [],
            workTypeDistribution: {},
            monthlyActivity: Array.from({ length: 12 }, (_, i) => ({
              month: i + 1,
              commits: 0,
              workUnits: 0,
            })),
          })),
          summary: `${run.year}년 데이터 수집 실패 또는 활동 없음`,
          strengths: [],
          improvements: ["커밋 데이터 수집 실패"],
          actionItems: ["관리자에게 문의하여 GitHub 접근 권한 및 사용자명 확인"],
        },
      });

      reportCount++;
    }
  }

  // Job 로그 기록
  await db.jobLog.create({
    data: {
      runId,
      jobType: "finalize_reports",
      jobId: `finalize-${runId}-${Date.now()}`,
      status: "COMPLETED",
      output: { 
        reportCount,
        expectedReports,
        missingReports: expectedReports - generatedReports.length,
      },
      startedAt: new Date(),
      endedAt: new Date(),
    },
  });

  return reportCount;
}

// AI 리뷰 및 리포트 생성 실행
export async function runAiReviewAndFinalize(
  runId: string,
  skipAiReview: boolean = false
): Promise<void> {
  console.log(`[Job] Starting AI review and finalize for run ${runId}`);

  try {
    // 상태 확인
    const run = await db.analysisRun.findUnique({ where: { id: runId } });
    if (!run || run.status !== "AWAITING_AI_CONFIRMATION") {
      throw new Error("Invalid run status");
    }

    if (!skipAiReview) {
      // Work Unit 샘플링
      await updateProgress(runId, {
        status: "REVIEWING",
        phase: "SAMPLING",
        message: "Work Unit 샘플링 중...",
      });

      const sampleSize = await sampleWorkUnits(runId);

      if (sampleSize > 0) {
        // AI 리뷰 실행
        await updateProgress(runId, {
          phase: "REVIEWING",
          total: sampleSize,
          completed: 0,
          message: "AI 리뷰 진행 중...",
        });

        await runAiReviews(runId);
      }
    } else {
      console.log(`[Job] Skipping AI review for run ${runId}`);
    }

    // 리포트 생성
    await updateProgress(runId, {
      status: "FINALIZING",
      phase: "FINALIZING",
      message: "연간 리포트 생성 중...",
    });

    await generateReports(runId);

    // 완료
    await db.analysisRun.update({
      where: { id: runId },
      data: {
        status: "DONE",
        finishedAt: new Date(),
        progress: {
          phase: "DONE",
          message: "분석이 완료되었습니다.",
        },
      },
    });

    console.log(`[Job] Analysis ${runId} completed successfully`);
  } catch (error) {
    console.error(`[Job] AI review/finalize failed for run ${runId}:`, error);
    await db.analysisRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        error: String(error),
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}

