import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * GET /api/analysis/[runId]/journal/analyses
 *
 * 업무 일지 분석 결과 조회
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

    // 주간 분석 조회
    const weeklyAnalyses = await db.weeklyAnalysis.findMany({
      where: { runId },
      orderBy: { weekNumber: "asc" },
    });

    // 월간 분석 조회
    const monthlyAnalyses = await db.monthlyAnalysis.findMany({
      where: { runId },
      orderBy: { month: "asc" },
    });

    // 응답 변환
    const weeklyData = weeklyAnalyses.map((w) => ({
      id: w.id,
      weekNumber: w.weekNumber,
      startDate: w.startDate.toISOString(),
      endDate: w.endDate.toISOString(),
      status: w.status,
      stage1Result: w.stage1Result,
      stage2Result: w.stage2Result,
      stage3Result: w.stage3Result,
      error: w.error,
      analyzedAt: w.analyzedAt?.toISOString(),
    }));

    const monthlyData = monthlyAnalyses.map((m) => ({
      id: m.id,
      month: m.month,
      status: m.status,
      stage1Result: m.stage1Result,
      stage2Result: m.stage2Result,
      stage3Result: m.stage3Result,
      weeklyAnalysisIds: m.weeklyAnalysisIds,
      error: m.error,
      analyzedAt: m.analyzedAt?.toISOString(),
    }));

    return NextResponse.json({
      weeklyAnalyses: weeklyData,
      monthlyAnalyses: monthlyData,
    });
  } catch (error) {
    console.error("Get analyses error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
