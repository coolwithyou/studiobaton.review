import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * POST /api/analysis/[runId]/cancel
 * 
 * 진행 중인 분석을 취소합니다.
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

    // 이미 완료된 경우
    if (["DONE", "FAILED"].includes(run.status)) {
      return NextResponse.json(
        { error: "Cannot cancel completed runs" },
        { status: 400 }
      );
    }

    // 상태를 FAILED로 변경
    await db.analysisRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        error: "Cancelled by user",
        finishedAt: new Date(),
      },
    });

    // TODO: QStash Job 취소 (현재 QStash는 Job 취소 기능이 제한적)

    return NextResponse.json({
      success: true,
      message: "Analysis cancelled",
    });
  } catch (error) {
    console.error("Cancel analysis error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

