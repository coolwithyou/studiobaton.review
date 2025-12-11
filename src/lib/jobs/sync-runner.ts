/**
 * Commit Sync Runner
 * 
 * 조직+연도 단위로 모든 커밋을 동기화하는 전용 러너
 * - author 필터 없이 모든 커밋 수집
 * - 기존 커밋 유지 (upsert 방식)
 * - PR 정보도 함께 수집
 */

import pLimit from "p-limit";
import { db } from "@/lib/db";
import { getInstallationOctokit, getOrganizationRepos, getCommits, getCommitDetails } from "@/lib/github";

const CONCURRENT_REPOS = 5;
const CONCURRENT_COMMITS = 10;
const DB_BATCH_SIZE = 100;

interface SyncProgress {
  totalRepos: number;
  completedRepos: number;
  failedRepos: number;
  totalCommits: number;
  currentRepo?: string;
  repoProgress?: Array<{
    repoName: string;
    status: "pending" | "syncing" | "done" | "failed";
    commits?: number;
    error?: string;
  }>;
}

// 진행률 업데이트
async function updateSyncProgress(
  syncJobId: string,
  updates: Partial<SyncProgress> & { status?: string; error?: string }
) {
  const syncJob = await db.commitSyncJob.findUnique({
    where: { id: syncJobId },
  });

  if (!syncJob) return;

  const currentProgress = (syncJob.progress as unknown as SyncProgress) || {
    totalRepos: 0,
    completedRepos: 0,
    failedRepos: 0,
    totalCommits: 0,
  };

  const newProgress = {
    ...currentProgress,
    ...updates,
  };

  // status와 error는 progress가 아닌 별도 필드
  const { status, error, ...progressUpdates } = updates;

  await db.commitSyncJob.update({
    where: { id: syncJobId },
    data: {
      ...(status && { status: status as any }),
      ...(error !== undefined && { error }),
      progress: JSON.parse(JSON.stringify({ ...currentProgress, ...progressUpdates })),
    },
  });
}

// PR 연결 정보 수집
async function syncPullRequestsForRepo(
  octokit: any,
  repoFullName: string,
  repoId: string,
  year: number
): Promise<number> {
  console.log(`[Sync] Syncing PRs for ${repoFullName}`);

  const [owner, repo] = repoFullName.split("/");
  const since = `${year}-01-01T00:00:00Z`;
  const until = `${year}-12-31T23:59:59Z`;

  try {
    // 해당 연도에 생성된 PR 조회
    const { data: prs } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: "all",
      sort: "created",
      direction: "desc",
      per_page: 100,
    });

    const yearPRs = prs.filter((pr: any) => {
      const createdAt = new Date(pr.created_at);
      return (
        createdAt >= new Date(since) &&
        createdAt <= new Date(until)
      );
    });

    console.log(`[Sync] Found ${yearPRs.length} PRs for ${repoFullName} in ${year}`);

    let syncedPRs = 0;

    for (const pr of yearPRs) {
      try {
        // GitHubUser 생성
        await db.gitHubUser.upsert({
          where: { login: pr.user.login },
          create: { login: pr.user.login },
          update: {},
        });

        // PR 저장
        const savedPR = await db.pullRequest.upsert({
          where: {
            repoId_number: {
              repoId,
              number: pr.number,
            },
          },
          create: {
            repoId,
            githubId: pr.id,
            number: pr.number,
            title: pr.title,
            body: pr.body,
            state: pr.state,
            authorLogin: pr.user.login,
            baseBranch: pr.base.ref,
            headBranch: pr.head.ref,
            mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
            closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
            createdAt: new Date(pr.created_at),
            updatedAt: new Date(pr.updated_at),
          },
          update: {
            title: pr.title,
            body: pr.body,
            state: pr.state,
            mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
            closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
            updatedAt: new Date(pr.updated_at),
          },
        });

        // PR의 커밋 조회 및 연결
        const { data: prCommits } = await octokit.rest.pulls.listCommits({
          owner,
          repo,
          pull_number: pr.number,
          per_page: 100,
        });

        for (const prCommit of prCommits) {
          const commit = await db.commit.findUnique({
            where: {
              repoId_sha: {
                repoId,
                sha: prCommit.sha,
              },
            },
          });

          if (commit) {
            // PR-Commit 연결
            await db.pullRequestCommit.upsert({
              where: {
                prId_commitId: {
                  prId: savedPR.id,
                  commitId: commit.id,
                },
              },
              create: {
                prId: savedPR.id,
                commitId: commit.id,
              },
              update: {},
            });
          }
        }

        syncedPRs++;
      } catch (prError) {
        console.error(`[Sync] Error syncing PR #${pr.number}:`, prError);
      }
    }

    return syncedPRs;
  } catch (error: any) {
    // 403 에러 (권한 없음)는 조용히 처리
    if (error?.status === 403) {
      console.log(`[Sync] PR permission not granted for ${repoFullName}, skipping PR sync`);
      return 0;
    }

    console.error(`[Sync] Error syncing PRs for ${repoFullName}:`, error);
    return 0;
  }
}

// 저장소별 커밋 동기화
async function syncCommitsForRepo(
  syncJobId: string,
  repoFullName: string,
  installationId: number,
  year: number
): Promise<{ totalCommits: number; savedCommits: number; prs: number }> {
  console.log(`[Sync] Syncing commits for ${repoFullName}`);

  const syncJob = await db.commitSyncJob.findUnique({
    where: { id: syncJobId },
  });

  if (!syncJob) {
    throw new Error("Sync job not found");
  }

  const repo = await db.repository.findUnique({
    where: { fullName: repoFullName },
  });

  if (!repo) {
    throw new Error(`Repository ${repoFullName} not found`);
  }

  const octokit = await getInstallationOctokit(installationId);
  const [owner, repoName] = repoFullName.split("/");
  const since = `${year}-01-01T00:00:00Z`;
  const until = `${year}-12-31T23:59:59Z`;

  // 진행 상태 업데이트
  const currentProgress = (syncJob.progress as unknown as SyncProgress) || {};
  const repoProgress = (currentProgress.repoProgress || []).map((rp) =>
    rp.repoName === repoFullName ? { ...rp, status: "syncing" as const } : rp
  );

  await updateSyncProgress(syncJobId, {
    currentRepo: repoFullName,
    repoProgress,
  });

  try {
    // 모든 커밋 조회 (author 필터 없음!)
    console.log(`[Sync] Fetching all commits for ${repoFullName} in ${year}...`);
    const commits = await getCommits(octokit, {
      owner,
      repo: repoName,
      since,
      until,
      // author 필터 제거 - 모든 커밋 수집
    });

    const totalCommits = commits.length;
    console.log(`[Sync] Found ${totalCommits} commits for ${repoFullName}`);

    if (totalCommits === 0) {
      // 완료 상태로 업데이트
      const updatedProgress = (currentProgress.repoProgress || []).map((rp) =>
        rp.repoName === repoFullName
          ? { ...rp, status: "done" as const, commits: 0 }
          : rp
      );

      await updateSyncProgress(syncJobId, {
        repoProgress: updatedProgress,
        completedRepos: (currentProgress.completedRepos || 0) + 1,
      });

      return { totalCommits: 0, savedCommits: 0, prs: 0 };
    }

    // 병렬로 커밋 상세 조회
    const limit = pLimit(CONCURRENT_COMMITS);
    const detailsPromises = commits.map((commit) =>
      limit(() => getCommitDetails(octokit, owner, repoName, commit.sha))
    );

    const allDetails = await Promise.all(detailsPromises);

    // 커밋 저장 (upsert - 기존 커밋 유지)
    let savedCommits = 0;
    const commitIdMap = new Map<string, string>();

    for (const details of allDetails) {
      try {
        // GitHubUser 생성
        await db.gitHubUser.upsert({
          where: { login: details.authorLogin },
          create: { login: details.authorLogin },
          update: {},
        });

        // 커밋 upsert
        const savedCommit = await db.commit.upsert({
          where: {
            repoId_sha: {
              repoId: repo.id,
              sha: details.sha,
            },
          },
          create: {
            repoId: repo.id,
            sha: details.sha,
            authorLogin: details.authorLogin,
            authorEmail: details.authorEmail || null,
            message: details.message,
            committedAt: new Date(details.committedAt || Date.now()),
            additions: details.stats.additions,
            deletions: details.stats.deletions,
            filesChanged: details.files.length,
          },
          update: {
            // 기존 커밋이 있어도 통계 업데이트
            additions: details.stats.additions,
            deletions: details.stats.deletions,
            filesChanged: details.files.length,
            message: details.message,
          },
        });

        commitIdMap.set(details.sha, savedCommit.id);

        // 파일 정보 저장
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
        console.error(`[Sync] Error saving commit ${details.sha}:`, commitError);
      }
    }

    console.log(`[Sync] Saved ${savedCommits}/${totalCommits} commits for ${repoFullName}`);

    // PR 정보 동기화
    const syncedPRs = await syncPullRequestsForRepo(octokit, repoFullName, repo.id, year);

    // 완료 상태로 업데이트
    const updatedProgress = (currentProgress.repoProgress || []).map((rp) =>
      rp.repoName === repoFullName
        ? { ...rp, status: "done" as const, commits: savedCommits }
        : rp
    );

    const completedCount = updatedProgress.filter((r) => r.status === "done").length;

    await updateSyncProgress(syncJobId, {
      repoProgress: updatedProgress,
      completedRepos: completedCount,
      totalCommits: (currentProgress.totalCommits || 0) + savedCommits,
    });

    return { totalCommits, savedCommits, prs: syncedPRs };
  } catch (error) {
    console.error(`[Sync] Error syncing ${repoFullName}:`, error);

    // 실패 상태로 업데이트
    const updatedProgress = (currentProgress.repoProgress || []).map((rp) =>
      rp.repoName === repoFullName
        ? { ...rp, status: "failed" as const, error: String(error) }
        : rp
    );

    const failedCount = updatedProgress.filter((r) => r.status === "failed").length;

    await updateSyncProgress(syncJobId, {
      repoProgress: updatedProgress,
      failedRepos: failedCount,
    });

    throw error;
  }
}

// 메인 동기화 실행
export async function runCommitSync(syncJobId: string): Promise<void> {
  console.log(`[Sync] ===== Starting commit sync: ${syncJobId} =====`);

  try {
    const syncJob = await db.commitSyncJob.findUnique({
      where: { id: syncJobId },
      include: { org: true },
    });

    if (!syncJob || !syncJob.org.installationId) {
      throw new Error("Sync job or installation not found");
    }

    // 시작 상태로 업데이트
    await db.commitSyncJob.update({
      where: { id: syncJobId },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
        error: null,
      },
    });

    // 1. 저장소 목록 조회
    console.log(`[Sync] Fetching repositories for ${syncJob.org.login}...`);
    const octokit = await getInstallationOctokit(syncJob.org.installationId);
    const repos = await getOrganizationRepos(octokit, syncJob.org.login, {
      includeArchived: false,
    });

    console.log(`[Sync] Found ${repos.length} repositories`);

    // 저장소 정보 저장
    for (const repo of repos) {
      await db.repository.upsert({
        where: { fullName: repo.fullName },
        create: {
          orgId: syncJob.orgId,
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
    const repoProgress = repos.map((r) => ({
      repoName: r.fullName,
      status: "pending" as const,
    }));

    await updateSyncProgress(syncJobId, {
      totalRepos: repos.length,
      completedRepos: 0,
      failedRepos: 0,
      totalCommits: 0,
      repoProgress,
    });

    // 2. 병렬로 저장소별 커밋 동기화
    const limit = pLimit(CONCURRENT_REPOS);
    let successCount = 0;
    let failCount = 0;

    const syncPromises = repos.map((repo) =>
      limit(async () => {
        try {
          await syncCommitsForRepo(
            syncJobId,
            repo.fullName,
            syncJob.org.installationId!,
            syncJob.year
          );
          successCount++;
        } catch (error) {
          failCount++;
          console.error(`[Sync] Failed to sync ${repo.fullName}:`, error);
        }
      })
    );

    await Promise.all(syncPromises);

    console.log(`[Sync] ===== Sync completed: ${successCount}/${repos.length} repos =====`);

    // 완료 상태로 업데이트
    await db.commitSyncJob.update({
      where: { id: syncJobId },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    console.error(`[Sync] Sync failed for ${syncJobId}:`, error);

    await db.commitSyncJob.update({
      where: { id: syncJobId },
      data: {
        status: "FAILED",
        error: String(error),
        finishedAt: new Date(),
      },
    });

    throw error;
  }
}
