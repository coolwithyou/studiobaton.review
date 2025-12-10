import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { calculateInterimStats } from "@/lib/analysis/interim-stats";

/**
 * GET /api/analysis/[runId]/interim-report?userLogin=xxx
 * 
 * 정량적 중간 리포트 조회
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
    const { searchParams } = new URL(request.url);
    const userLogin = searchParams.get("userLogin");

    if (!userLogin) {
      return NextResponse.json(
        { error: "userLogin parameter is required" },
        { status: 400 }
      );
    }

    // 분석 실행 조회 및 권한 확인
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

    // 타겟 사용자 확인
    if (run.userLogin !== userLogin) {
      return NextResponse.json(
        { error: "User not in target users list" },
        { status: 404 }
      );
    }

    // Work Unit이 생성되었는지 확인
    const workUnitCount = await db.workUnit.count({
      where: { runId, userLogin },
    });

    if (workUnitCount === 0) {
      return NextResponse.json(
        { 
          error: "Work units not yet created. Please wait for analysis to reach AWAITING_AI_CONFIRMATION status.",
          status: run.status 
        },
        { status: 400 }
      );
    }

    // 통계 계산
    const reportData = await calculateInterimStats(runId, userLogin);

    return NextResponse.json(reportData);
  } catch (error) {
    console.error("Get interim report error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

