/**
 * 커밋 Diff 조회 및 저장 모듈
 * 
 * 샘플링된 커밋의 실제 코드 변경 내용(diff)을 조회하고 저장합니다.
 */

import { db } from "@/lib/db";
import { getInstallationOctokit, getCommitDetails } from "@/lib/github";
import type { CommitSampleResult } from "@/lib/ai/sampling";

// ============================================
// Diff 결과 타입
// ============================================

export interface CommitDiffData {
  commitId: string;
  sha: string;
  repoFullName: string;
  diff: string;
  files: Array<{
    path: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;
}

// ============================================
// 단일 커밋 Diff 조회
// ============================================

export async function fetchCommitDiff(
  installationId: number,
  repoFullName: string,
  sha: string
): Promise<CommitDiffData | null> {
  try {
    const octokit = await getInstallationOctokit(installationId);
    const [owner, repo] = repoFullName.split('/');

    const commitDetails = await getCommitDetails(octokit, owner, repo, sha);

    // 전체 diff 생성 (파일별 patch 합침)
    const diffParts: string[] = [];

    for (const file of commitDetails.files) {
      if (file.patch) {
        diffParts.push(`--- a/${file.path}`);
        diffParts.push(`+++ b/${file.path}`);
        diffParts.push(file.patch);
        diffParts.push('');
      }
    }

    const diff = diffParts.join('\n');

    // DB에서 commit ID 조회
    const commit = await db.commit.findFirst({
      where: {
        sha,
        repo: { fullName: repoFullName },
      },
      select: { id: true },
    });

    if (!commit) {
      console.warn(`커밋을 DB에서 찾을 수 없음: ${sha}`);
      return null;
    }

    return {
      commitId: commit.id,
      sha,
      repoFullName,
      diff,
      files: commitDetails.files,
    };
  } catch (error) {
    console.error(`Diff 조회 실패 (${repoFullName}/${sha}):`, error);
    return null;
  }
}

// ============================================
// 여러 커밋 Diff 일괄 조회
// ============================================

export async function fetchMultipleCommitDiffs(
  installationId: number,
  commits: Array<{ sha: string; repoFullName: string }>
): Promise<CommitDiffData[]> {
  const results: CommitDiffData[] = [];

  // 순차 처리 (Rate limit 고려)
  for (const commit of commits) {
    const diff = await fetchCommitDiff(
      installationId,
      commit.repoFullName,
      commit.sha
    );

    if (diff) {
      results.push(diff);
    }

    // Rate limit 방지를 위한 딜레이
    await sleep(100);
  }

  return results;
}

// ============================================
// Diff 저장
// ============================================

export async function saveCommitDiff(diffData: CommitDiffData): Promise<void> {
  await db.commitDiff.upsert({
    where: { commitId: diffData.commitId },
    create: {
      commitId: diffData.commitId,
      diff: diffData.diff,
    },
    update: {
      diff: diffData.diff,
    },
  });
}

export async function saveMultipleCommitDiffs(
  diffs: CommitDiffData[]
): Promise<void> {
  for (const diff of diffs) {
    await saveCommitDiff(diff);
  }
}

// ============================================
// WorkUnit의 선택된 커밋 Diff 조회 및 저장
// ============================================

export async function fetchAndSaveDiffsForSamples(
  orgId: string,
  sampleResults: CommitSampleResult[]
): Promise<number> {
  // 조직의 installationId 조회
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { installationId: true },
  });

  if (!org?.installationId) {
    throw new Error("조직의 GitHub App 설치 정보를 찾을 수 없습니다.");
  }

  let savedCount = 0;

  for (const sample of sampleResults) {
    // WorkUnit 정보 조회
    const workUnit = await db.workUnit.findUnique({
      where: { id: sample.workUnitId },
      include: {
        repo: {
          select: { fullName: true },
        },
      },
    });

    if (!workUnit) continue;

    // 선택된 커밋들의 Diff 조회 및 저장
    for (const sha of sample.selectedCommitShas) {
      const diffData = await fetchCommitDiff(
        org.installationId,
        workUnit.repo.fullName,
        sha
      );

      if (diffData) {
        await saveCommitDiff(diffData);
        savedCount++;
      }

      await sleep(100); // Rate limit 방지
    }
  }

  return savedCount;
}

// ============================================
// 샘플링된 WorkUnit의 Diff 조회 및 저장 (전체)
// ============================================

export async function fetchAndSaveDiffsForAnalysis(
  analysisRunId: string,
  orgId: string,
  maxCommitsPerWorkUnit: number = 3
): Promise<{ totalFetched: number; failed: number }> {
  // 샘플링된 WorkUnit 조회
  const sampledWorkUnits = await db.workUnit.findMany({
    where: {
      analysisRunId,
      isSampled: true,
    },
    include: {
      commits: {
        include: {
          commit: {
            select: {
              id: true,
              sha: true,
              additions: true,
              deletions: true,
            },
          },
        },
      },
      repo: {
        select: { fullName: true },
      },
    },
  });

  // 조직의 installationId 조회
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { installationId: true },
  });

  if (!org?.installationId) {
    throw new Error("조직의 GitHub App 설치 정보를 찾을 수 없습니다.");
  }

  let totalFetched = 0;
  let failed = 0;

  for (const workUnit of sampledWorkUnits) {
    // 변경량이 큰 커밋 우선 선택
    const sortedCommits = [...workUnit.commits]
      .sort((a, b) => 
        (b.commit.additions + b.commit.deletions) - 
        (a.commit.additions + a.commit.deletions)
      )
      .slice(0, maxCommitsPerWorkUnit);

    for (const wuc of sortedCommits) {
      // 이미 Diff가 있는지 확인
      const existingDiff = await db.commitDiff.findUnique({
        where: { commitId: wuc.commit.id },
      });

      if (existingDiff) {
        totalFetched++;
        continue;
      }

      try {
        const diffData = await fetchCommitDiff(
          org.installationId,
          workUnit.repo.fullName,
          wuc.commit.sha
        );

        if (diffData) {
          await saveCommitDiff(diffData);
          totalFetched++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Diff 조회 실패:`, error);
        failed++;
      }

      await sleep(100); // Rate limit 방지
    }
  }

  return { totalFetched, failed };
}

// ============================================
// 저장된 Diff 조회
// ============================================

export async function getCommitDiffById(commitId: string): Promise<string | null> {
  const diff = await db.commitDiff.findUnique({
    where: { commitId },
    select: { diff: true },
  });

  return diff?.diff || null;
}

export async function getCommitDiffBySha(
  repoFullName: string,
  sha: string
): Promise<string | null> {
  const commit = await db.commit.findFirst({
    where: {
      sha,
      repo: { fullName: repoFullName },
    },
    select: { id: true },
  });

  if (!commit) return null;

  return getCommitDiffById(commit.id);
}

// ============================================
// WorkUnit의 모든 Diff 조회
// ============================================

export async function getWorkUnitDiffs(workUnitId: string): Promise<Array<{
  sha: string;
  message: string;
  diff: string;
}>> {
  const workUnit = await db.workUnit.findUnique({
    where: { id: workUnitId },
    include: {
      commits: {
        include: {
          commit: {
            include: {
              diff: true,
            },
          },
        },
      },
    },
  });

  if (!workUnit) return [];

  return workUnit.commits
    .filter(wuc => wuc.commit.diff)
    .map(wuc => ({
      sha: wuc.commit.sha,
      message: wuc.commit.message,
      diff: wuc.commit.diff!.diff,
    }));
}

// ============================================
// Diff 요약 (AI 분석용)
// ============================================

export function summarizeDiff(
  diff: string,
  maxLines: number = 100,
  maxCharsPerFile: number = 2000
): string {
  const lines = diff.split('\n');
  
  if (lines.length <= maxLines) {
    return diff;
  }

  // 파일별로 분리
  const fileDiffs: string[] = [];
  let currentFile: string[] = [];

  for (const line of lines) {
    if (line.startsWith('--- a/') || line.startsWith('diff --git')) {
      if (currentFile.length > 0) {
        fileDiffs.push(currentFile.join('\n'));
      }
      currentFile = [line];
    } else {
      currentFile.push(line);
    }
  }

  if (currentFile.length > 0) {
    fileDiffs.push(currentFile.join('\n'));
  }

  // 각 파일의 diff를 최대 길이로 자름
  const truncatedFiles = fileDiffs.map(fileDiff => {
    if (fileDiff.length <= maxCharsPerFile) {
      return fileDiff;
    }
    return fileDiff.substring(0, maxCharsPerFile) + '\n... (truncated)';
  });

  // 전체 라인 수 제한
  const result = truncatedFiles.join('\n\n');
  const resultLines = result.split('\n');

  if (resultLines.length > maxLines) {
    return resultLines.slice(0, maxLines).join('\n') + '\n... (truncated)';
  }

  return result;
}

// ============================================
// 유틸리티
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

