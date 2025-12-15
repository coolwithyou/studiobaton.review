import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { getInstallationOctokit } from "@/lib/github";
import { JournalAnalyzer } from "@/lib/journal/analyzer";

/**
 * POST /api/analysis/[runId]/journal/analyze-week
 *
 * 주간 분석 실행
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId } = await params;
    const body = await request.json();
    const { weekNumber, startDate, endDate } = body;

    if (!weekNumber || !startDate || !endDate) {
      return NextResponse.json(
        { error: "weekNumber, startDate, endDate are required" },
        { status: 400 }
      );
    }

    // AnalysisRun 조회 및 권한 확인
    const run = await db.analysisRun.findUnique({
      where: { id: runId },
      include: {
        org: {
          include: {
            members: {
              where: { userId: session.user.id },
            },
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // 권한 확인
    if (run.org.members.length === 0) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // WeeklyAnalysis 조회 또는 생성
    let weeklyAnalysis = await db.weeklyAnalysis.findUnique({
      where: {
        runId_weekNumber: { runId, weekNumber },
      },
    });

    // 이미 COMPLETED 상태면 캐시된 결과 반환
    if (weeklyAnalysis?.status === "COMPLETED") {
      return NextResponse.json({
        analysisId: weeklyAnalysis.id,
        status: weeklyAnalysis.status,
        stage1Result: weeklyAnalysis.stage1Result,
        stage2Result: weeklyAnalysis.stage2Result,
        stage3Result: weeklyAnalysis.stage3Result,
      });
    }

    // 진행 중인 상태면 에러 반환
    if (
      weeklyAnalysis?.status === "STAGE1" ||
      weeklyAnalysis?.status === "STAGE2" ||
      weeklyAnalysis?.status === "STAGE3"
    ) {
      return NextResponse.json(
        { error: "이미 분석이 진행 중입니다" },
        { status: 409 }
      );
    }

    // 새로운 분석 생성
    if (!weeklyAnalysis) {
      weeklyAnalysis = await db.weeklyAnalysis.create({
        data: {
          runId,
          userLogin: run.userLogin,
          year: run.year,
          weekNumber,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status: "PENDING",
        },
      });
    }

    // 날짜 범위 설정
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    console.log(`[analyze-week] Week ${weekNumber}: ${start.toISOString()} ~ ${end.toISOString()}`);
    console.log(`[analyze-week] User: ${run.userLogin}, OrgId: ${run.orgId}`);

    // 기간 내 커밋 조회
    const commits = await db.commit.findMany({
      where: {
        authorLogin: run.userLogin,
        committedAt: {
          gte: start,
          lte: end,
        },
        repo: {
          orgId: run.orgId,
        },
      },
      include: {
        repo: {
          select: {
            name: true,
            fullName: true,
          },
        },
      },
      orderBy: {
        committedAt: "asc",
      },
    });

    console.log(`[analyze-week] Found ${commits.length} commits`);
    if (commits.length > 0) {
      console.log(`[analyze-week] First commit: ${commits[0].committedAt.toISOString()}`);
      console.log(`[analyze-week] Last commit: ${commits[commits.length - 1].committedAt.toISOString()}`);
    }

    // 커밋이 없으면 완료 처리
    if (commits.length === 0) {
      await db.weeklyAnalysis.update({
        where: { id: weeklyAnalysis.id },
        data: {
          status: "COMPLETED",
          stage3Result: {
            summary: "이 기간에는 커밋이 없습니다.",
            keyActivities: [],
            workPattern: "활동 없음",
            technicalHighlights: [],
            insights: [],
            metrics: {
              totalCommits: 0,
              keyCommitsAnalyzed: 0,
              reposWorked: 0,
              linesChanged: 0,
            },
          },
          analyzedAt: new Date(),
        },
      });

      return NextResponse.json({
        analysisId: weeklyAnalysis.id,
        status: "COMPLETED",
        stage3Result: {
          summary: "이 기간에는 커밋이 없습니다.",
          keyActivities: [],
          workPattern: "활동 없음",
          technicalHighlights: [],
          insights: [],
          metrics: {
            totalCommits: 0,
            keyCommitsAnalyzed: 0,
            reposWorked: 0,
            linesChanged: 0,
          },
        },
      });
    }

    // Analyzer 초기화 (GitHub API 필요)
    let octokit;
    let hasGitHubAccess = false;
    if (run.org.installationId) {
      try {
        octokit = await getInstallationOctokit(run.org.installationId);
        hasGitHubAccess = true;
      } catch (error) {
        console.error("Failed to get GitHub octokit:", error);
      }
    }

    const analyzer = octokit
      ? new JournalAnalyzer(octokit)
      : new JournalAnalyzer({} as any); // Stage 2 스킵용

    // Stage 1: 주요 커밋 선별
    await db.weeklyAnalysis.update({
      where: { id: weeklyAnalysis.id },
      data: { status: "STAGE1" },
    });

    const commitsForAnalysis = commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      repoName: c.repo.name,
      repoFullName: c.repo.fullName,
      additions: c.additions,
      deletions: c.deletions,
      committedAt: c.committedAt,
    }));

    const keyCommits = await analyzer.selectKeyCommits(commitsForAnalysis, 5);

    await db.weeklyAnalysis.update({
      where: { id: weeklyAnalysis.id },
      data: {
        stage1Result: { keyCommits },
      },
    });

    // Stage 2: 코드 리뷰 (GitHub 접근 가능할 때만)
    await db.weeklyAnalysis.update({
      where: { id: weeklyAnalysis.id },
      data: { status: "STAGE2" },
    });

    let commitReviews = [];
    if (hasGitHubAccess && octokit) {
      for (const commit of keyCommits) {
        try {
          const [owner, repo] = commit.repoFullName.split("/");
          const review = await analyzer.reviewCommit(commit, owner, repo);
          commitReviews.push(review);
        } catch (error) {
          console.error(`Failed to review commit ${commit.sha}:`, error);
          // 개별 커밋 리뷰 실패는 무시하고 계속 진행
        }
      }
    }

    await db.weeklyAnalysis.update({
      where: { id: weeklyAnalysis.id },
      data: {
        stage2Result: { commitReviews },
      },
    });

    // Stage 3: 최종 종합
    await db.weeklyAnalysis.update({
      where: { id: weeklyAnalysis.id },
      data: { status: "STAGE3" },
    });

    const weeklyResult = await analyzer.synthesizeWeekly(
      keyCommits,
      commitReviews,
      commitsForAnalysis
    );

    await db.weeklyAnalysis.update({
      where: { id: weeklyAnalysis.id },
      data: {
        status: "COMPLETED",
        stage3Result: weeklyResult,
        analyzedAt: new Date(),
      },
    });

    return NextResponse.json({
      analysisId: weeklyAnalysis.id,
      status: "COMPLETED",
      stage1Result: { keyCommits },
      stage2Result: { commitReviews },
      stage3Result: weeklyResult,
    });
  } catch (error) {
    console.error("Analyze week error:", error);

    // 에러 발생 시 weeklyAnalysis가 있으면 FAILED 상태로 업데이트
    const { runId } = await params;
    const body = await request.json();
    const { weekNumber } = body;

    try {
      await db.weeklyAnalysis.updateMany({
        where: { runId, weekNumber },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    } catch (updateError) {
      console.error("Failed to update error status:", updateError);
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
