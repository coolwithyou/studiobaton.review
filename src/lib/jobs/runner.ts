/**
 * Analysis Job Runner
 * 
 * 개발 환경에서는 동기적으로 Job을 실행하고,
 * QStash가 설정된 경우 비동기 큐를 사용합니다.
 */

import { db } from "@/lib/db";
import { getInstallationOctokit, getOrganizationRepos, getCommits, getCommitDetails } from "@/lib/github";
import { clusterCommits } from "@/lib/analysis/clustering";
import { calculateImpactScore } from "@/lib/analysis/scoring";
import { AnalysisOptions } from "@/types";

// 리포별 커밋 수집 타임아웃 (5분)
const REPO_SCAN_TIMEOUT_MS = 5 * 60 * 1000;

interface RepoProgress {
  repoName: string;
  status: "pending" | "scanning" | "done" | "failed";
  commitCount?: number;
  error?: string;
}

interface ProgressState {
  phase?: string;
  total?: number;
  completed?: number;
  failed?: number;
  currentRepo?: string;
  repoProgress?: RepoProgress[];
  message?: string;
}

// 진행률 업데이트 헬퍼
async function updateProgress(
  runId: string,
  updates: {
    status?: string;
    phase?: string;
    total?: number;
    completed?: number;
    failed?: number;
    currentRepo?: string;
    repoProgress?: RepoProgress[];
    error?: string;
  }
) {
  const run = await db.analysisRun.findUnique({ where: { id: runId } });
  if (!run) return;

  const currentProgress = (run.progress as ProgressState) || {};

  const newProgress = {
    phase: updates.phase ?? currentProgress.phase ?? "",
    total: updates.total ?? currentProgress.total ?? 0,
    completed: updates.completed ?? currentProgress.completed ?? 0,
    failed: updates.failed ?? currentProgress.failed ?? 0,
    currentRepo: updates.currentRepo ?? currentProgress.currentRepo ?? "",
    repoProgress: updates.repoProgress ?? currentProgress.repoProgress ?? [],
  };

  await db.analysisRun.update({
    where: { id: runId },
    data: {
      status: (updates.status as any) || run.status,
      error: updates.error,
      progress: JSON.parse(JSON.stringify(newProgress)),
    },
  });
}

// 1단계: 저장소 스캔
export async function scanRepos(runId: string): Promise<string[]> {
  console.log(`[Job] ===== 1단계: 저장소 스캔 시작 =====`);
  console.log(`[Job] Run ID: ${runId}`);

  const run = await db.analysisRun.findUnique({
    where: { id: runId },
    include: { org: true },
  });

  if (!run || !run.org.installationId) {
    throw new Error("Run or installation not found");
  }

  await updateProgress(runId, {
    status: "SCANNING_REPOS",
    phase: "SCANNING_REPOS",
  });

  const octokit = await getInstallationOctokit(run.org.installationId);
  const options = run.options as AnalysisOptions;

  const repos = await getOrganizationRepos(octokit, run.org.login, {
    includeArchived: options?.includeArchived,
  });

  // 제외할 저장소 필터링
  const excludeRepos = options?.excludeRepos || [];
  const filteredRepos = repos.filter(
    (repo) => !excludeRepos.includes(repo.fullName)
  );

  // Repository 레코드 저장
  for (const repo of filteredRepos) {
    await db.repository.upsert({
      where: { fullName: repo.fullName },
      create: {
        orgId: run.orgId,
        githubId: repo.id,
        fullName: repo.fullName,
        name: repo.name,
        defaultBranch: repo.defaultBranch,
        isArchived: repo.isArchived,
        isPrivate: repo.isPrivate,
        language: repo.language,
        description: repo.description,
      },
      update: {
        defaultBranch: repo.defaultBranch,
        isArchived: repo.isArchived,
        isPrivate: repo.isPrivate,
        language: repo.language,
        description: repo.description,
      },
    });
  }

  // 진행률 초기화
  const repoProgress: RepoProgress[] = filteredRepos.map((r) => ({
    repoName: r.fullName,
    status: "pending" as const,
  }));

  await updateProgress(runId, {
    status: "SCANNING_COMMITS",
    phase: "SCANNING_COMMITS",
    total: filteredRepos.length,
    completed: 0,
    failed: 0,
    repoProgress,
  });

  console.log(`[Job] ===== 1단계 완료: ${filteredRepos.length}개 저장소 발견 =====`);
  return filteredRepos.map((r) => r.fullName);
}

// 2단계: 커밋 수집 (타임아웃 포함)
export async function scanCommitsForRepo(
  runId: string,
  repoFullName: string
): Promise<{ totalCommits: number; savedCommits: number }> {
  console.log(`[Job] [커밋 수집] 시작: ${repoFullName}`);

  const run = await db.analysisRun.findUnique({
    where: { id: runId },
    include: { org: true },
  });

  if (!run || !run.org.installationId) {
    throw new Error("Run or installation not found");
  }

  const repo = await db.repository.findUnique({
    where: { fullName: repoFullName },
  });

  if (!repo) {
    throw new Error(`Repository ${repoFullName} not found`);
  }

  // 현재 repo 진행 상태 업데이트
  const currentProgress = (run.progress as Record<string, unknown>) || {};
  const repoProgress = ((currentProgress.repoProgress as RepoProgress[]) || []).map((rp) =>
    rp.repoName === repoFullName ? { ...rp, status: "scanning" as const } : rp
  );

  await updateProgress(runId, {
    currentRepo: repoFullName,
    repoProgress,
  });

  const octokit = await getInstallationOctokit(run.org.installationId);
  const [owner, repoName] = repoFullName.split("/");
  const since = `${run.year}-01-01T00:00:00Z`;
  const until = `${run.year}-12-31T23:59:59Z`;
  const authorLogin = run.userLogin; // 단일 사용자

  let totalCommits = 0;
  let savedCommits = 0;

  try {
    // GitHubUser 확인/생성
    await db.gitHubUser.upsert({
      where: { login: authorLogin },
      create: { login: authorLogin },
      update: {},
    });

    console.log(`[Job] Fetching commits for ${authorLogin} in ${repoFullName}...`);
    const commits = await getCommits(octokit, {
      owner,
      repo: repoName,
      since,
      until,
      author: authorLogin,
    });

    totalCommits = commits.length;
    console.log(`[Job] Found ${totalCommits} commits for ${authorLogin} in ${repoFullName}`);

    for (const commit of commits) {
      try {
        const details = await getCommitDetails(octokit, owner, repoName, commit.sha);

        const savedCommit = await db.commit.upsert({
          where: {
            repoId_sha: {
              repoId: repo.id,
              sha: commit.sha,
            },
          },
          create: {
            repoId: repo.id,
            sha: commit.sha,
            authorLogin,
            authorEmail: commit.authorEmail,
            message: commit.message,
            committedAt: new Date(commit.committedAt || Date.now()),
            additions: details.stats.additions,
            deletions: details.stats.deletions,
            filesChanged: details.files.length,
          },
          update: {
            additions: details.stats.additions,
            deletions: details.stats.deletions,
            filesChanged: details.files.length,
          },
        });

        // 파일 변경 정보 저장
        for (const file of details.files) {
          await db.commitFile.upsert({
            where: {
              id: `${savedCommit.id}-${file.path}`.slice(0, 255),
            },
            create: {
              id: `${savedCommit.id}-${file.path}`.slice(0, 255),
              commitId: savedCommit.id,
              path: file.path,
              status: file.status || "modified",
              additions: file.additions,
              deletions: file.deletions,
            },
            update: {
              status: file.status || "modified",
              additions: file.additions,
              deletions: file.deletions,
            },
          });
        }

        savedCommits++;
      } catch (commitError) {
        console.error(`[Job] Error processing commit ${commit.sha}:`, commitError);
      }
    }
  } catch (error) {
    console.error(`[Job] Error fetching commits for ${authorLogin} in ${repoFullName}:`, error);
    throw error;
  }

  // 완료 상태 업데이트
  const updatedProgress = ((run.progress as Record<string, unknown>)?.repoProgress as RepoProgress[]) || [];
  const finalRepoProgress = updatedProgress.map((rp) =>
    rp.repoName === repoFullName
      ? { ...rp, status: "done" as const, commitCount: savedCommits }
      : rp
  );

  const completedCount = finalRepoProgress.filter((r) => r.status === "done").length;

  await updateProgress(runId, {
    completed: completedCount,
    repoProgress: finalRepoProgress,
  });

  console.log(`[Job] [커밋 수집] 완료: ${repoFullName} - ${savedCommits}/${totalCommits} commits 저장됨`);
  return { totalCommits, savedCommits };
}

// 커밋 수집 완료 검증 함수
async function verifyCommitCollection(runId: string): Promise<{
  success: boolean;
  totalRepos: number;
  completedRepos: number;
  failedRepos: number;
  collectedCommits: number;
}> {
  console.log(`[Job] ===== 커밋 수집 검증 시작 =====`);

  const run = await db.analysisRun.findUnique({
    where: { id: runId },
    select: { progress: true, userLogin: true, orgId: true, year: true },
  });

  if (!run) {
    throw new Error("Run not found during verification");
  }

  const progress = (run.progress as Record<string, unknown>) || {};
  const repoProgress = (progress.repoProgress as RepoProgress[]) || [];

  const completedRepos = repoProgress.filter((r) => r.status === "done").length;
  const failedRepos = repoProgress.filter((r) => r.status === "failed").length;
  const totalRepos = repoProgress.length;

  // 실제 저장된 커밋 수 조회
  const collectedCommits = await db.commit.count({
    where: {
      authorLogin: run.userLogin,
      repo: { orgId: run.orgId },
      committedAt: {
        gte: new Date(`${run.year}-01-01`),
        lte: new Date(`${run.year}-12-31T23:59:59`),
      },
    },
  });

  const allReposProcessed = completedRepos + failedRepos === totalRepos;

  console.log(`[Job] 검증 결과:`);
  console.log(`[Job]   - 전체 리포: ${totalRepos}개`);
  console.log(`[Job]   - 완료: ${completedRepos}개`);
  console.log(`[Job]   - 실패: ${failedRepos}개`);
  console.log(`[Job]   - 수집된 커밋: ${collectedCommits}개`);
  console.log(`[Job]   - 모든 리포 처리 완료: ${allReposProcessed ? "예" : "아니오"}`);

  if (!allReposProcessed) {
    console.warn(`[Job] ⚠️ 일부 리포의 커밋 수집이 완료되지 않았습니다.`);
  }

  if (failedRepos > 0) {
    const failedRepoNames = repoProgress
      .filter((r) => r.status === "failed")
      .map((r) => r.repoName);
    console.warn(`[Job] ⚠️ 실패한 리포: ${failedRepoNames.join(", ")}`);
  }

  return {
    success: allReposProcessed && collectedCommits > 0,
    totalRepos,
    completedRepos,
    failedRepos,
    collectedCommits,
  };
}

// 3단계: Work Unit 생성
export async function buildWorkUnits(runId: string): Promise<number> {
  console.log(`[Job] ===== 3단계: Work Unit 생성 시작 =====`);

  await updateProgress(runId, {
    status: "BUILDING_UNITS",
    phase: "BUILDING_UNITS",
  });

  const run = await db.analysisRun.findUnique({
    where: { id: runId },
    include: {
      org: true,
    },
  });

  if (!run) {
    throw new Error("Run not found");
  }

  const options = run.options as AnalysisOptions;
  const orgSettings = (run.org.settings as Record<string, unknown>) || {};
  let totalWorkUnits = 0;

  // 단일 사용자에 대해 Work Unit 생성
  const userLogin = run.userLogin;
  console.log(`[Job] Work Unit 생성 대상 사용자: ${userLogin}`);

  // 해당 사용자의 커밋 조회
  const commits = await db.commit.findMany({
    where: {
      authorLogin: userLogin,
      repo: { orgId: run.orgId },
      committedAt: {
        gte: new Date(`${run.year}-01-01`),
        lte: new Date(`${run.year}-12-31T23:59:59`),
      },
    },
    include: {
      repo: true,
      files: true,
    },
    orderBy: { committedAt: "asc" },
  });

  console.log(`[Job] ${userLogin}의 커밋 ${commits.length}개 발견`);

  if (commits.length === 0) {
    console.warn(`[Job] ⚠️ ${userLogin}의 커밋이 없습니다. Work Unit을 생성하지 않습니다.`);
  } else {

    // 저장소별로 그룹화
    const commitsByRepo = new Map<string, typeof commits>();
    for (const commit of commits) {
      const repoId = commit.repoId;
      if (!commitsByRepo.has(repoId)) {
        commitsByRepo.set(repoId, []);
      }
      commitsByRepo.get(repoId)!.push(commit);
    }

    console.log(`[Job] ${commitsByRepo.size}개 저장소에서 커밋 발견`);

    // 각 저장소별로 Work Unit 클러스터링
    for (const [repoId, repoCommits] of commitsByRepo) {
      const repoName = repoCommits[0]?.repo.fullName || repoId;
      console.log(`[Job] [${repoName}] ${repoCommits.length}개 커밋 클러스터링 중...`);
      // clusterCommits는 CommitWithFiles[]를 받아서 WorkUnitData[]를 반환
      const workUnitDatas = clusterCommits(
        repoCommits,
        options?.clusteringConfig
      );

      console.log(`[Job] [${repoName}] ${workUnitDatas.length}개 Work Unit 생성됨`);

      for (const workUnitData of workUnitDatas) {
        const clusterCommitsList = workUnitData.commits;

        if (clusterCommitsList.length === 0) continue;

        const firstCommit = clusterCommitsList[0];
        const lastCommit = clusterCommitsList[clusterCommitsList.length - 1];

        // workUnitData에서 통계 활용
        const totalAdditions = workUnitData.additions;
        const totalDeletions = workUnitData.deletions;
        const allPaths = new Set<string>();
        clusterCommitsList.forEach((c) => c.files.forEach((f) => allPaths.add(f.path)));

        // 주요 경로는 workUnitData에서 가져옴
        const primaryPaths = workUnitData.primaryPaths;

        // isHotfix와 hasRevert 확인
        const isHotfix = clusterCommitsList.some((c) =>
          c.message.toLowerCase().includes("hotfix") ||
          c.message.toLowerCase().includes("fix:")
        );
        const hasRevert = clusterCommitsList.some((c) =>
          c.message.toLowerCase().includes("revert")
        );

        // 임팩트 스코어 계산
        const { score, factors } = calculateImpactScore(
          {
            additions: totalAdditions,
            deletions: totalDeletions,
            primaryPaths,
            isHotfix,
            hasRevert,
          },
          {
            criticalPaths: (orgSettings.criticalPaths as Array<{ pattern: string; weight: number }>) || [],
            ...options?.impactConfig,
          }
        );

        // Work Unit 저장
        const workUnit = await db.workUnit.create({
          data: {
            runId,
            repoId,
            userLogin,
            startAt: firstCommit.committedAt,
            endAt: lastCommit.committedAt,
            commitCount: clusterCommitsList.length,
            filesChanged: allPaths.size,
            additions: totalAdditions,
            deletions: totalDeletions,
            primaryPaths,
            impactScore: score,
            impactFactors: JSON.parse(JSON.stringify(factors)),
            isHotfix,
            hasRevert,
          },
        });

        // WorkUnitCommit 연결
        for (let i = 0; i < clusterCommitsList.length; i++) {
          await db.workUnitCommit.create({
            data: {
              workUnitId: workUnit.id,
              commitId: clusterCommitsList[i].id,
              order: i,
            },
          });
        }

        totalWorkUnits++;
      }
    }
  }

  console.log(`[Job] ===== 3단계 완료: ${totalWorkUnits}개 Work Unit 생성됨 =====`);

  // AI 리뷰 대기 상태로 변경
  await updateProgress(runId, {
    status: "AWAITING_AI_CONFIRMATION",
    phase: "AWAITING_AI_CONFIRMATION",
  });

  return totalWorkUnits;
}

// 전체 분석 실행 (개발용 동기 실행)
export async function runAnalysis(runId: string): Promise<void> {
  console.log(`[Job] =============================================`);
  console.log(`[Job] 분석 시작: Run ID ${runId}`);
  console.log(`[Job] =============================================`);

  try {
    // 분석 시작 시간 기록
    await db.analysisRun.update({
      where: { id: runId },
      data: { startedAt: new Date() },
    });

    // 1단계: 저장소 스캔
    const repos = await scanRepos(runId);

    if (repos.length === 0) {
      throw new Error("분석할 저장소가 없습니다.");
    }

    // 분석 취소 확인
    const checkCancelled = async () => {
      const run = await db.analysisRun.findUnique({ where: { id: runId } });
      return run?.status === "FAILED" && run?.error === "Cancelled by user";
    };

    if (await checkCancelled()) {
      console.log(`[Job] Analysis ${runId} was cancelled`);
      return;
    }

    // 2단계: 각 저장소별 커밋 스캔
    console.log(`[Job] ===== 2단계: 커밋 수집 시작 (${repos.length}개 리포) =====`);
    let successfulScans = 0;
    let failedScans = 0;

    for (let i = 0; i < repos.length; i++) {
      const repoFullName = repos[i];
      if (await checkCancelled()) {
        console.log(`[Job] Analysis ${runId} was cancelled`);
        return;
      }

      console.log(`[Job] [2-${i + 1}/${repos.length}] ${repoFullName} 커밋 수집 중...`);

      try {
        // 타임아웃과 함께 커밋 스캔 실행
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Timeout")), REPO_SCAN_TIMEOUT_MS);
        });

        const scanPromise = scanCommitsForRepo(runId, repoFullName);

        await Promise.race([scanPromise, timeoutPromise]);
        successfulScans++;
      } catch (error) {
        failedScans++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Job] ❌ [2-${i + 1}/${repos.length}] ${repoFullName} 실패:`, errorMessage);
        // 개별 저장소 실패 시 진행률 업데이트
        const run = await db.analysisRun.findUnique({ where: { id: runId } });
        const progress = (run?.progress as Record<string, unknown>) || {};
        const repoProgress = ((progress.repoProgress as RepoProgress[]) || []).map((rp) =>
          rp.repoName === repoFullName
            ? { ...rp, status: "failed" as const, error: errorMessage }
            : rp
        );
        const failedCount = repoProgress.filter((r) => r.status === "failed").length;
        await updateProgress(runId, {
          failed: failedCount,
          repoProgress,
        });
      }
    }

    console.log(`[Job] ===== 2단계 완료: 커밋 수집 결과 =====`);
    console.log(`[Job]   - 성공: ${successfulScans}/${repos.length}`);
    console.log(`[Job]   - 실패: ${failedScans}/${repos.length}`);

    if (await checkCancelled()) {
      console.log(`[Job] Analysis ${runId} was cancelled`);
      return;
    }

    // 커밋 수집 완료 검증
    console.log(`[Job] ===== 2단계 검증: 커밋 수집 완료 확인 =====`);
    const verification = await verifyCommitCollection(runId);

    if (!verification.success) {
      if (verification.collectedCommits === 0) {
        throw new Error(
          `커밋이 수집되지 않았습니다. (완료: ${verification.completedRepos}/${verification.totalRepos})`
        );
      } else {
        console.warn(
          `[Job] ⚠️ 일부 리포 처리 실패했지만 ${verification.collectedCommits}개 커밋이 수집되어 진행합니다.`
        );
      }
    } else {
      console.log(`[Job] ✅ 커밋 수집 검증 완료: ${verification.collectedCommits}개 커밋 수집됨`);
    }

    // 3단계: Work Unit 생성
    await buildWorkUnits(runId);

    console.log(`[Job] =============================================`);
    console.log(`[Job] ✅ 분석 완료 (AI 리뷰 대기 중): ${runId}`);
    console.log(`[Job] =============================================`);
  } catch (error) {
    console.error(`[Job] Analysis ${runId} failed:`, error);
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

