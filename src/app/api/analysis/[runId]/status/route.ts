/**
 * 분석 상태 조회 API
 * GET /api/analysis/[runId]/status
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

interface RouteContext {
  params: Promise<{
    runId: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
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
        workUnits: {
          select: { id: true },
        },
        reports: {
          select: { 
            id: true, 
            userLogin: true,
            confirmedAt: true,
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

    // 3. 진행률 계산
    const progress = analysisRun.progress as {
      currentStep: number;
      totalSteps: number;
      message: string;
    } | null;

    const progressPercentage = progress
      ? Math.round((progress.currentStep / progress.totalSteps) * 100)
      : 0;

    return NextResponse.json({
      id: analysisRun.id,
      orgLogin: analysisRun.org.login,
      orgName: analysisRun.org.name,
      year: analysisRun.year,
      status: analysisRun.status,
      phase: analysisRun.phase,
      progress: {
        ...progress,
        percentage: progressPercentage,
      },
      error: analysisRun.error,
      startedAt: analysisRun.startedAt,
      finishedAt: analysisRun.finishedAt,
      stats: {
        workUnits: analysisRun.workUnits.length,
        reports: analysisRun.reports.length,
        confirmedReports: analysisRun.reports.filter(r => r.confirmedAt).length,
      },
    });
  } catch (error) {
    console.error("Get analysis status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

