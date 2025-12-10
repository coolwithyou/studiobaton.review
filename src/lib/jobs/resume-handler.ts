/**
 * Resume Handler for Analysis Jobs
 * 
 * 중단된 분석을 이어서 진행하거나 재시도하는 로직
 */

import { db } from "@/lib/db";

export enum RestartMode {
  RESUME = "resume",       // 중단된 지점부터 이어서 진행 (기본)
  RETRY = "retry",         // 실패한 저장소만 재시도
  FULL_RESTART = "full",   // 전체 데이터 삭제 후 처음부터
}

interface ResumeAnalysis {
  mode: RestartMode;
  completedRepos: string[];
  failedRepos: string[];
  pendingRepos: string[];
  totalRepos: string[];
  canResume: boolean;
  currentPhase: string;
  stats: {
    totalCommits: number;
    totalWorkUnits: number;
    scannedRepos: number;
  };
}

/**
 * 분석 재개 가능 여부 및 상태 확인
 */
export async function analyzeResumeState(runId: string): Promise<ResumeAnalysis> {
  const run = await db.analysisRun.findUnique({
    where: { id: runId },
    include: { org: true },
  });

  if (!run) {
    throw new Error("Run not found");
  }

  const progress = (run.progress as {
    repoProgress?: Array<{
      repoName: string;
      status: "pending" | "scanning" | "done" | "failed";
      commitCount?: number;
    }>;
  }) || {};

  const repoProgress = progress.repoProgress || [];

  // 완료된 저장소
  const completedRepos = repoProgress
    .filter((r) => r.status === "done")
    .map((r) => r.repoName);

  // 실패한 저장소
  const failedRepos = repoProgress
    .filter((r) => r.status === "failed")
    .map((r) => r.repoName);

  // 대기 중인 저장소
  const pendingRepos = repoProgress
    .filter((r) => r.status === "pending" || r.status === "scanning")
    .map((r) => r.repoName);

  const totalRepos = repoProgress.map((r) => r.repoName);

  // 기존 수집 데이터 통계 (단일 사용자)
  const totalCommits = await db.commit.count({
    where: {
      repo: { orgId: run.orgId },
      authorLogin: run.userLogin,
      committedAt: {
        gte: new Date(`${run.year}-01-01`),
        lte: new Date(`${run.year}-12-31T23:59:59`),
      },
    },
  });

  const totalWorkUnits = await db.workUnit.count({
    where: { runId },
  });

  // Resume 가능 여부 판단
  const canResume =
    totalRepos.length > 0 &&
    (completedRepos.length > 0 || totalCommits > 0) &&
    run.status !== "DONE";

  return {
    mode: RestartMode.RESUME, // 기본값
    completedRepos,
    failedRepos,
    pendingRepos,
    totalRepos,
    canResume,
    currentPhase: run.status,
    stats: {
      totalCommits,
      totalWorkUnits,
      scannedRepos: completedRepos.length,
    },
  };
}

/**
 * 분석 재개를 위한 저장소 목록 필터링
 */
export async function getReposToScan(
  runId: string,
  allRepos: string[],
  mode: RestartMode
): Promise<{
  toScan: string[];
  alreadyCompleted: string[];
  stats: {
    total: number;
    completed: number;
    pending: number;
    failed: number;
  };
}> {
  const resumeState = await analyzeResumeState(runId);

  let toScan: string[] = [];
  let alreadyCompleted: string[] = [];

  switch (mode) {
    case RestartMode.RESUME:
      // 완료되지 않은 저장소만 스캔
      toScan = allRepos.filter(
        (repo) => !resumeState.completedRepos.includes(repo)
      );
      alreadyCompleted = resumeState.completedRepos;
      break;

    case RestartMode.RETRY:
      // 실패한 저장소만 재시도
      toScan = resumeState.failedRepos;
      alreadyCompleted = resumeState.completedRepos;
      break;

    case RestartMode.FULL_RESTART:
      // 모든 저장소 스캔
      toScan = allRepos;
      alreadyCompleted = [];
      break;

    default:
      toScan = allRepos;
      alreadyCompleted = [];
  }

  return {
    toScan,
    alreadyCompleted,
    stats: {
      total: allRepos.length,
      completed: alreadyCompleted.length,
      pending: toScan.length,
      failed: resumeState.failedRepos.length,
    },
  };
}

/**
 * 저장소의 커밋 수집 여부 확인
 */
export async function isRepoAlreadyScanned(
  runId: string,
  repoFullName: string,
  year: number
): Promise<{ scanned: boolean; commitCount: number }> {
  const repo = await db.repository.findUnique({
    where: { fullName: repoFullName },
  });

  if (!repo) {
    return { scanned: false, commitCount: 0 };
  }

  // 해당 연도의 커밋이 이미 있는지 확인
  const commitCount = await db.commit.count({
    where: {
      repoId: repo.id,
      committedAt: {
        gte: new Date(`${year}-01-01`),
        lte: new Date(`${year}-12-31T23:59:59`),
      },
    },
  });

  return {
    scanned: commitCount > 0,
    commitCount,
  };
}

/**
 * 중단/재시작 전 데이터 정리
 */
export async function cleanupBeforeRestart(
  runId: string,
  mode: RestartMode
): Promise<void> {
  console.log(`[Resume] Cleanup mode: ${mode}`);

  switch (mode) {
    case RestartMode.FULL_RESTART:
      // 모든 데이터 삭제
      console.log(`[Resume] Full restart: deleting all data for run ${runId}`);
      await db.workUnitCommit.deleteMany({
        where: { workUnit: { runId } },
      });
      await db.aiReview.deleteMany({
        where: { workUnit: { runId } },
      });
      await db.workUnit.deleteMany({
        where: { runId },
      });
      await db.yearlyReport.deleteMany({
        where: { runId },
      });
      await db.jobLog.deleteMany({
        where: { runId },
      });
      // Commit과 CommitFile도 삭제 (cascade)
      await db.commit.deleteMany({
        where: {
          repo: {
            orgId: (
              await db.analysisRun.findUnique({
                where: { id: runId },
                select: { orgId: true },
              })
            )?.orgId,
          },
          authorLogin: (
            await db.analysisRun.findUnique({
              where: { id: runId },
              select: { userLogin: true },
            })
          )?.userLogin || "",
        },
      });
      break;

    case RestartMode.RETRY:
      // 실패한 저장소의 데이터만 삭제
      console.log(`[Resume] Retry mode: keeping existing data`);
      const resumeState = await analyzeResumeState(runId);

      // 실패한 저장소의 커밋만 삭제
      for (const repoFullName of resumeState.failedRepos) {
        const repo = await db.repository.findUnique({
          where: { fullName: repoFullName },
        });
        if (repo) {
          await db.commit.deleteMany({
            where: { repoId: repo.id },
          });
        }
      }
      break;

    case RestartMode.RESUME:
      // 데이터 유지, 정리 없음
      console.log(`[Resume] Resume mode: keeping all existing data`);
      break;
  }

  // Work Unit과 Report는 항상 재생성
  if (mode !== RestartMode.RESUME) {
    await db.workUnitCommit.deleteMany({
      where: { workUnit: { runId } },
    });
    await db.aiReview.deleteMany({
      where: { workUnit: { runId } },
    });
    await db.workUnit.deleteMany({
      where: { runId },
    });
    await db.yearlyReport.deleteMany({
      where: { runId },
    });
  }
}

/**
 * Progress 복원 (중단된 지점 파악)
 */
export async function restoreProgress(
  runId: string,
  allRepos: string[]
): Promise<{
  repoProgress: Array<{
    repoName: string;
    status: "pending" | "scanning" | "done" | "failed";
    commitCount?: number;
  }>;
  completed: number;
  failed: number;
}> {
  const run = await db.analysisRun.findUnique({
    where: { id: runId },
  });

  if (!run) {
    throw new Error("Run not found");
  }

  const existingProgress = (run.progress as {
    repoProgress?: Array<{
      repoName: string;
      status: "pending" | "scanning" | "done" | "failed";
      commitCount?: number;
    }>;
  }) || {};

  const existingRepoProgress = existingProgress.repoProgress || [];

  // 각 저장소의 실제 상태 확인
  const repoProgress = await Promise.all(
    allRepos.map(async (repoFullName) => {
      const existing = existingRepoProgress.find(
        (r) => r.repoName === repoFullName
      );

      // 기존 progress가 있고 완료 상태면 유지
      if (existing && existing.status === "done") {
        return existing;
      }

      // 실제 DB에서 커밋 수 확인
      const { scanned, commitCount } = await isRepoAlreadyScanned(
        runId,
        repoFullName,
        run.year
      );

      if (scanned) {
        return {
          repoName: repoFullName,
          status: "done" as const,
          commitCount,
        };
      }

      // 실패 상태였으면 pending으로 초기화
      if (existing && existing.status === "failed") {
        return {
          repoName: repoFullName,
          status: "pending" as const,
        };
      }

      // 스캔 중이었으면 pending으로 초기화
      if (existing && existing.status === "scanning") {
        return {
          repoName: repoFullName,
          status: "pending" as const,
        };
      }

      return {
        repoName: repoFullName,
        status: "pending" as const,
      };
    })
  );

  const completed = repoProgress.filter((r) => r.status === "done").length;
  const failed = repoProgress.filter((r) => r.status === "failed").length;

  return {
    repoProgress,
    completed,
    failed,
  };
}

