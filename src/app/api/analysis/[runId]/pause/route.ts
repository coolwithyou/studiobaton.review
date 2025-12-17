/**
 * 분석 일시 정지 API
 * POST /api/analysis/[runId]/pause
 * 
 * 진행 중인 분석을 일시 정지합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

interface RouteContext {
  params: Promise<{
    runId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
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
          select: { login: true },
        },
      },
    });

    if (!analysisRun) {
      return NextResponse.json(
        { error: "Analysis run not found" },
        { status: 404 }
      );
    }

    // 3. 상태 확인 (진행 중인 경우만 일시 정지 가능)
    if (analysisRun.status !== "IN_PROGRESS") {
      return NextResponse.json(
        { 
          error: "Only in-progress analysis can be paused",
          currentStatus: analysisRun.status,
        },
        { status: 400 }
      );
    }

    // 4. 일시 정지 상태로 업데이트
    const updatedRun = await db.analysisRun.update({
      where: { id: runId },
      data: {
        status: "PAUSED",
        progress: {
          ...(analysisRun.progress as any),
          message: `일시 정지됨 (${(analysisRun.progress as any)?.message || analysisRun.phase})`,
        },
      },
    });

    console.log(`[Analysis] Paused: ${runId} at phase ${analysisRun.phase}`);

    return NextResponse.json({
      success: true,
      analysisRunId: runId,
      status: updatedRun.status,
      phase: updatedRun.phase,
      message: "Analysis paused",
    });
  } catch (error) {
    console.error("Pause analysis error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

