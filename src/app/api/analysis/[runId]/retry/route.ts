import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { runAnalysis } from "@/lib/jobs/runner-optimized";
import { RestartMode } from "@/lib/jobs/resume-handler";

/**
 * POST /api/analysis/[runId]/retry
 * 
 * 실패한 분석을 재시도합니다.
 * - mode=resume: 중단된 지점부터 이어서 (기본)
 * - mode=retry: 실패한 저장소만 재시도
 * - mode=full: 전체 재시작
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
    const body = await request.json().catch(() => ({}));
    const { mode = "resume" } = body as { mode?: string };

    // 모드 검증
    let restartMode: RestartMode = RestartMode.RESUME;
    if (mode === "retry") restartMode = RestartMode.RETRY;
    else if (mode === "full") restartMode = RestartMode.FULL_RESTART;

    // 분석 실행 조회
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

    // FAILED 상태인지 확인
    if (run.status !== "FAILED") {
      return NextResponse.json(
        { error: "Only failed runs can be retried" },
        { status: 400 }
      );
    }

    // 상태 초기화
    await db.analysisRun.update({
      where: { id: runId },
      data: {
        status: "QUEUED",
        error: null,
      },
    });

    // 백그라운드에서 분석 재시작
    runAnalysis(runId, restartMode).catch((error) => {
      console.error(`[Analysis] Retry failed for ${runId}:`, error);
    });

    return NextResponse.json({
      success: true,
      message: `분석이 재시작되었습니다 (${mode} 모드)`,
      mode: restartMode,
    });
  } catch (error) {
    console.error("Retry analysis error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
