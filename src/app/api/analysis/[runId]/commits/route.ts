import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * GET /api/analysis/[runId]/commits
 * 
 * 분석 실행에 해당하는 사용자의 연간 커밋을 조회합니다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId } = await params;

    // AnalysisRun 조회
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

    // 해당 년도의 시작과 끝 날짜
    const startDate = new Date(run.year, 0, 1); // 1월 1일
    const endDate = new Date(run.year, 11, 31, 23, 59, 59); // 12월 31일

    // 조직의 모든 리포지터리에서 해당 사용자의 커밋 조회
    const commits = await db.commit.findMany({
      where: {
        authorLogin: run.userLogin,
        committedAt: {
          gte: startDate,
          lte: endDate,
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

    // 날짜별로 그룹핑
    const commitsByDate = new Map<string, typeof commits>();

    commits.forEach((commit) => {
      const dateKey = commit.committedAt.toISOString().split("T")[0];
      if (!commitsByDate.has(dateKey)) {
        commitsByDate.set(dateKey, []);
      }
      commitsByDate.get(dateKey)!.push(commit);
    });

    // DayCommits 형태로 변환
    const dayCommits = Array.from(commitsByDate.entries())
      .map(([date, commits]) => ({
        date,
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          repoName: c.repo.name,
          repoFullName: c.repo.fullName,
          additions: c.additions,
          deletions: c.deletions,
          committedAt: c.committedAt.toISOString(),
        })),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      year: run.year,
      userLogin: run.userLogin,
      totalCommits: commits.length,
      totalDays: dayCommits.length,
      dayCommits,
    });
  } catch (error) {
    console.error("Get commits error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
