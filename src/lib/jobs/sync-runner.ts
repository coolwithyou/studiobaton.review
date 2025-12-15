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

interface SyncProgress {
  totalRepos: number;
  completedRepos: number;
  failedRepos: number;
  totalCommits: number;
  currentRepo?: string;
  currentCommit?: {
    sha: string;
    message: string;
    author: string;
    index: number;
    total: number;
  };
  repoProgress?: Array<{
    repoName: string;
    status: "pending" | "syncing" | "done" | "failed";
    commits?: number;
    error?: string;
  }>;
}

// 진행률 업데이트 (원자적 업데이트)
async function updateSyncProgress(
  syncJobId: string,
  updates: Partial<SyncProgress> & { status?: string; error?: string }
) {
  // DB에서 최신 상태를 조회하고 업데이트 (원자적 작업)
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

// 저장소별 상태만 원자적으로 업데이트 (실시간 카운트 재계산)
async function updateRepoStatus(
  syncJobId: string,
  repoFullName: string,
  status: "pending" | "syncing" | "done" | "failed",
  extraData?: { commits?: number; error?: string }
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
    repoProgress: [],
  };

  // 해당 저장소의 상태만 업데이트
  const updatedRepoProgress = (currentProgress.repoProgress || []).map((rp) =>
    rp.repoName === repoFullName
      ? { ...rp, status, ...extraData }
      : rp
  );

  // 실시간 카운트 재계산
  const completedRepos = updatedRepoProgress.filter((r) => r.status === "done").length;
  const failedRepos = updatedRepoProgress.filter((r) => r.status === "failed").length;
  const totalCommits = updatedRepoProgress.reduce((sum, r) => sum + (r.commits || 0), 0);

  await db.commitSyncJob.update({
    where: { id: syncJobId },
    data: {
      progress: JSON.parse(JSON.stringify({
        ...currentProgress,
        repoProgress: updatedRepoProgress,
        completedRepos,
        failedRepos,
        totalCommits,
      })),
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

  // 진행 상태 업데이트 (syncing으로 변경)
  await updateRepoStatus(syncJobId, repoFullName, "syncing");

  // currentRepo 업데이트
  await updateSyncProgress(syncJobId, {
    currentRepo: repoFullName,
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
      // 완료 상태로 업데이트 (원자적)
      await updateRepoStatus(syncJobId, repoFullName, "done", { commits: 0 });
      return { totalCommits: 0, savedCommits: 0, prs: 0 };
    }

    // 이미 동기화된 커밋 SHA 조회 (스킵용)
    const existingCommits = await db.commit.findMany({
      where: {
        repoId: repo.id,
        sha: { in: commits.map((c) => c.sha) },
      },
      select: { sha: true },
    });
    const existingShas = new Set(existingCommits.map((c) => c.sha));

    // 새 커밋만 필터링
    const newCommits = commits.filter((c) => !existingShas.has(c.sha));
    const skippedCount = commits.length - newCommits.length;

    if (skippedCount > 0) {
      console.log(`[Sync] Skipping ${skippedCount} already synced commits for ${repoFullName}`);
    }

    if (newCommits.length === 0) {
      // 모든 커밋이 이미 동기화됨
      console.log(`[Sync] All ${totalCommits} commits already synced for ${repoFullName}`);
      await updateRepoStatus(syncJobId, repoFullName, "done", { commits: totalCommits });
      return { totalCommits, savedCommits: 0, prs: 0 };
    }

    console.log(`[Sync] Fetching details for ${newCommits.length} new commits...`);

    // 새 커밋만 상세 조회 (병렬)
    const limit = pLimit(CONCURRENT_COMMITS);
    const detailsPromises = newCommits.map((commit) =>
      limit(() => getCommitDetails(octokit, owner, repoName, commit.sha))
    );

    const allDetails = await Promise.all(detailsPromises);

    // 커밋 저장
    let savedCommits = 0;
    const commitIdMap = new Map<string, string>();

    for (let i = 0; i < allDetails.length; i++) {
      const details = allDetails[i];
      try {
        // 진행률 업데이트 (50개마다 또는 첫/마지막 커밋)
        if (i === 0 || i === allDetails.length - 1 || i % 50 === 0) {
          await updateSyncProgress(syncJobId, {
            currentCommit: {
              sha: details.sha.substring(0, 7),
              message: details.message.split('\n')[0].substring(0, 50),
              author: details.authorLogin,
              index: i + 1,
              total: allDetails.length,
            },
          });
        }

        // GitHubUser 생성
        await db.gitHubUser.upsert({
          where: { login: details.authorLogin },
          create: { login: details.authorLogin },
          update: {},
        });

        // 커밋 저장 (신규만이므로 create 시도, 실패 시 upsert)
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
            additions: details.stats.additions,
            deletions: details.stats.deletions,
            filesChanged: details.files.length,
            message: details.message,
          },
        });

        commitIdMap.set(details.sha, savedCommit.id);

        // 파일 정보 배치 저장 (createMany 사용 가능한 경우)
        if (details.files.length > 0) {
          // 파일별로 upsert (Prisma에서 createMany는 upsert 지원 안함)
          await Promise.all(
            details.files.map((file) =>
              db.commitFile.upsert({
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
              })
            )
          );
        }

        savedCommits++;
      } catch (commitError) {
        console.error(`[Sync] Error saving commit ${details.sha}:`, commitError);
      }
    }

    console.log(`[Sync] Saved ${savedCommits} new commits (${skippedCount} skipped) for ${repoFullName}`);

    // PR 정보 동기화
    const syncedPRs = await syncPullRequestsForRepo(octokit, repoFullName, repo.id, year);

    // 완료 상태로 업데이트 (원자적) - 총 커밋 수 (새 커밋 + 기존 커밋)
    await updateRepoStatus(syncJobId, repoFullName, "done", { commits: totalCommits });

    // currentCommit 클리어 (totalCommits는 최종 시점에서 계산)
    await updateSyncProgress(syncJobId, {
      currentCommit: undefined, // 커밋 처리 완료
    });

    return { totalCommits, savedCommits, prs: syncedPRs };
  } catch (error) {
    console.error(`[Sync] Error syncing ${repoFullName}:`, error);

    // 실패 상태로 업데이트 (원자적)
    await updateRepoStatus(syncJobId, repoFullName, "failed", {
      error: String(error)
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

    // 최종 진행률 재계산 (레이스 컨디션 방지)
    const finalSyncJob = await db.commitSyncJob.findUnique({
      where: { id: syncJobId },
    });

    if (finalSyncJob) {
      const finalProgress = (finalSyncJob.progress as unknown as SyncProgress) || {};
      const repoProgress = finalProgress.repoProgress || [];

      // repoProgress 배열에서 실제 완료/실패 수 및 총 커밋 수 계산
      const completedCount = repoProgress.filter((r) => r.status === "done").length;
      const failedCount = repoProgress.filter((r) => r.status === "failed").length;
      const totalCommitsCount = repoProgress.reduce((sum, r) => sum + (r.commits || 0), 0);

      console.log(`[Sync] Final count - Completed: ${completedCount}, Failed: ${failedCount}, Total: ${repos.length}, Commits: ${totalCommitsCount}`);

      // 최종 카운트로 업데이트 (정확한 통계)
      await db.commitSyncJob.update({
        where: { id: syncJobId },
        data: {
          status: "COMPLETED",
          finishedAt: new Date(),
          progress: JSON.parse(JSON.stringify({
            ...finalProgress,
            completedRepos: completedCount,
            failedRepos: failedCount,
            totalCommits: totalCommitsCount,
            currentRepo: undefined,
            currentCommit: undefined,
          })),
        },
      });
    } else {
      // fallback: syncJob을 찾을 수 없는 경우
      await db.commitSyncJob.update({
        where: { id: syncJobId },
        data: {
          status: "COMPLETED",
          finishedAt: new Date(),
        },
      });
    }
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
