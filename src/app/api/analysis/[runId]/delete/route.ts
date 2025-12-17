/**
 * 분석 삭제 API
 * DELETE /api/analysis/[runId]/delete
 *
 * 분석 데이터를 완전히 삭제합니다.
 * - WorkUnit, AiReview, YearlyReport, RepoAnalysisSummary 등 관련 데이터 모두 삭제
 * - Cascade delete로 연결된 데이터 자동 삭제
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

interface RouteContext {
  params: Promise<{
    runId: string;
  }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    // 1. 인증 확인
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId } = await context.params;

    // 2. 분석 Run 조회
    const analysisRun = await db.analysisRun.findUnique({
      where: { id: runId },
      include: {
        org: {
          select: { login: true, name: true },
        },
        _count: {
          select: {
            workUnits: true,
            reports: true,
            repoSummaries: true,
          },
        },
      },
    });

    if (!analysisRun) {
      return NextResponse.json(
        { error: "Analysis run not found" },
        { status: 404 }
      );
    }

    // 3. 진행 중인 분석은 먼저 정지 필요 (선택적으로 허용할 수도 있음)
    if (analysisRun.status === "IN_PROGRESS") {
      return NextResponse.json(
        {
          error: "Cannot delete in-progress analysis. Please pause it first.",
          currentStatus: analysisRun.status,
        },
        { status: 400 }
      );
    }

    // 4. 삭제 전 로그
    console.log(`[Analysis] Deleting: ${runId}`, {
      org: analysisRun.org.login,
      user: analysisRun.userLogin,
      year: analysisRun.year,
      workUnits: analysisRun._count.workUnits,
      reports: analysisRun._count.reports,
    });

    // 5. 분석 Run 삭제 (Cascade로 연결된 데이터 자동 삭제)
    // - WorkUnit -> WorkUnitCommit, AiReview
    // - YearlyReport -> AiReview
    // - RepoAnalysisSummary
    await db.analysisRun.delete({
      where: { id: runId },
    });

    console.log(`[Analysis] Deleted successfully: ${runId}`);

    return NextResponse.json({
      success: true,
      message: "Analysis deleted successfully",
      deleted: {
        analysisRunId: runId,
        org: analysisRun.org.login,
        user: analysisRun.userLogin,
        year: analysisRun.year,
        workUnits: analysisRun._count.workUnits,
        reports: analysisRun._count.reports,
      },
    });
  } catch (error) {
    console.error("Delete analysis error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
