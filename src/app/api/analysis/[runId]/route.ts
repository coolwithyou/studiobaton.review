import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId } = await params;

    const run = await db.analysisRun.findUnique({
      where: { id: runId },
      include: {
        org: {
          select: {
            login: true,
            name: true,
          },
        },
        user: {
          select: {
            login: true,
            name: true,
          },
        },
        _count: {
          select: {
            workUnits: true,
            reports: true,
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // 진행률 계산
    const progress = run.progress as {
      total: number;
      completed: number;
      failed: number;
      phase?: string;
      repoProgress?: Array<{
        repoName: string;
        status: string;
        commitCount?: number;
        error?: string;
      }>;
    } | null;

    const percentage = progress?.total
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

    // 메시지 필드도 포함
    const currentMessage = (run.progress as Record<string, unknown>)?.message as string | undefined;

    return NextResponse.json({
      runId: run.id,
      orgLogin: run.org.login,
      orgName: run.org.name,
      userLogin: run.userLogin,
      userName: run.user.name,
      year: run.year,
      status: run.status,
      progress: {
        phase: progress?.phase || run.status,
        total: progress?.total || 0,
        completed: progress?.completed || 0,
        failed: progress?.failed || 0,
        percentage,
        message: currentMessage,
        repoProgress: progress?.repoProgress || [],
      },
      workUnitCount: run._count.workUnits,
      reportCount: run._count.reports,
      options: run.options,
      error: run.error,
      startedAt: run.startedAt?.toISOString(),
      finishedAt: run.finishedAt?.toISOString(),
      createdAt: run.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Get analysis status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/analysis/[runId]
 * 
 * 분석 실행을 삭제합니다. QUEUED 또는 FAILED 상태에서만 가능합니다.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId } = await params;

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

    // 삭제 가능한 상태인지 확인
    if (!["QUEUED", "FAILED"].includes(run.status)) {
      return NextResponse.json(
        { error: "Cannot delete a running or completed analysis. Please cancel first." },
        { status: 400 }
      );
    }

    // 관련 데이터 삭제 (cascade로 대부분 처리되지만 명시적으로)
    await db.$transaction(async (tx) => {
      // WorkUnitCommit 삭제
      await tx.workUnitCommit.deleteMany({
        where: { workUnit: { runId } },
      });

      // AiReview 삭제
      await tx.aiReview.deleteMany({
        where: { workUnit: { runId } },
      });

      // WorkUnit 삭제
      await tx.workUnit.deleteMany({
        where: { runId },
      });

      // YearlyReport 삭제
      await tx.yearlyReport.deleteMany({
        where: { runId },
      });

      // JobLog 삭제
      await tx.jobLog.deleteMany({
        where: { runId },
      });

      // AnalysisRun 삭제
      await tx.analysisRun.delete({
        where: { id: runId },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Analysis deleted successfully",
    });
  } catch (error) {
    console.error("Delete analysis error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
