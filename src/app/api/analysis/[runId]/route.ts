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
        targetUsers: {
          select: {
            userLogin: true,
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
    } | null;

    const percentage = progress?.total
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

    return NextResponse.json({
      runId: run.id,
      orgLogin: run.org.login,
      orgName: run.org.name,
      year: run.year,
      status: run.status,
      progress: {
        phase: progress?.phase || run.status,
        total: progress?.total || 0,
        completed: progress?.completed || 0,
        failed: progress?.failed || 0,
        percentage,
      },
      targetUsers: run.targetUsers.map((u) => u.userLogin),
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

