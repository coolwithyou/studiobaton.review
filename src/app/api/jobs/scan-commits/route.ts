import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getInstallationOctokit, getCommits, getCommitDetails } from "@/lib/github";

interface ScanCommitsPayload {
  runId: string;
  repoFullName: string;
  installationId: number;
  year: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: ScanCommitsPayload = await request.json();
    const { runId, repoFullName, installationId, year } = body;

    // 1. 분석 실행 및 저장소 조회
    const run = await db.analysisRun.findUnique({
      where: { id: runId },
      include: {
        targetUsers: true,
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const repo = await db.repository.findUnique({
      where: { fullName: repoFullName },
    });

    if (!repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    // 2. 연도 범위 설정
    const since = `${year}-01-01T00:00:00Z`;
    const until = `${year}-12-31T23:59:59Z`;
    const [owner, repoName] = repoFullName.split("/");

    // 3. GitHub API로 커밋 조회
    const octokit = await getInstallationOctokit(installationId);
    const targetLogins = run.targetUsers.map((u) => u.userLogin);

    let totalCommits = 0;
    let savedCommits = 0;

    // 각 사용자별로 커밋 조회
    for (const authorLogin of targetLogins) {
      try {
        const commits = await getCommits(octokit, {
          owner,
          repo: repoName,
          since,
          until,
          author: authorLogin,
        });

        totalCommits += commits.length;

        // 커밋 상세 정보 조회 및 저장
        for (const commit of commits) {
          try {
            // GitHubUser 확인/생성
            await db.gitHubUser.upsert({
              where: { login: authorLogin },
              create: {
                login: authorLogin,
                email: commit.authorEmail,
              },
              update: {},
            });

            // 커밋 상세 조회 (파일 변경 정보)
            const details = await getCommitDetails(
              octokit,
              owner,
              repoName,
              commit.sha
            );

            // 커밋 저장
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
                  id: `${savedCommit.id}-${file.path}`,
                },
                create: {
                  id: `${savedCommit.id}-${file.path}`,
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
            console.error(`Error processing commit ${commit.sha}:`, commitError);
            // 개별 커밋 실패는 계속 진행
          }
        }
      } catch (userError) {
        console.error(`Error fetching commits for ${authorLogin}:`, userError);
        // 개별 사용자 실패는 계속 진행
      }
    }

    // 4. 진행률 업데이트
    const currentProgress = run.progress as {
      total: number;
      completed: number;
      failed: number;
    };

    await db.analysisRun.update({
      where: { id: runId },
      data: {
        progress: {
          ...currentProgress,
          completed: currentProgress.completed + 1,
        },
      },
    });

    // 5. Job 로그 기록
    await db.jobLog.create({
      data: {
        runId,
        jobType: "scan_commits",
        jobId: `${repoFullName}-${Date.now()}`,
        status: "COMPLETED",
        input: { repoFullName, year },
        output: { totalCommits, savedCommits },
        startedAt: new Date(),
        endedAt: new Date(),
      },
    });

    // 6. 모든 저장소 완료 확인 후 다음 단계로
    const updatedRun = await db.analysisRun.findUnique({
      where: { id: runId },
    });

    const progress = updatedRun?.progress as {
      total: number;
      completed: number;
      failed: number;
    };

    if (progress.completed + progress.failed >= progress.total) {
      // 모든 저장소 스캔 완료 → Work Unit 생성 단계로
      await db.analysisRun.update({
        where: { id: runId },
        data: {
          status: "BUILDING_UNITS",
        },
      });

      // Work Unit 생성 Job 트리거 (QStash)
      /*
      await qstash.publishJSON({
        url: `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/build-work-units`,
        body: { runId },
      });
      */
    }

    return NextResponse.json({
      success: true,
      totalCommits,
      savedCommits,
    });
  } catch (error) {
    console.error("Scan commits error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

