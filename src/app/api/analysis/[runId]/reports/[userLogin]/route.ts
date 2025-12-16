/**
 * 개인 리포트 조회 및 업데이트 API
 * GET /api/analysis/[runId]/reports/[userLogin]
 * PATCH /api/analysis/[runId]/reports/[userLogin]
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

interface RouteContext {
  params: Promise<{
    runId: string;
    userLogin: string;
  }>;
}

// GET: 리포트 상세 조회
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId, userLogin } = await context.params;

    const report = await db.yearlyReport.findUnique({
      where: {
        analysisRunId_userLogin: {
          analysisRunId: runId,
          userLogin,
        },
      },
      include: {
        analysisRun: {
          select: { year: true, orgId: true },
        },
        aiReviews: {
          orderBy: { stage: 'asc' },
        },
      },
    });

    if (!report) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    // 사용자 정보
    const user = await db.gitHubUser.findUnique({
      where: { login: userLogin },
    });

    // AI 리뷰 결과 정리
    const aiReviews = report.aiReviews.reduce((acc, review) => {
      acc[`stage${review.stage}`] = review.result;
      return acc;
    }, {} as Record<string, any>);

    return NextResponse.json({
      id: report.id,
      userLogin: report.userLogin,
      userName: user?.name,
      avatarUrl: user?.avatarUrl,
      year: report.analysisRun.year,
      metrics: report.metrics,
      aiInsights: report.aiInsights,
      overallScore: report.overallScore,
      charts: report.charts,
      managerComment: report.managerComment,
      confirmedAt: report.confirmedAt,
      aiReviews,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    });
  } catch (error) {
    console.error("Get report error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH: 리포트 업데이트 (매니저 코멘트, 확정)
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId, userLogin } = await context.params;
    const body = await request.json();

    const report = await db.yearlyReport.findUnique({
      where: {
        analysisRunId_userLogin: {
          analysisRunId: runId,
          userLogin,
        },
      },
    });

    if (!report) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    // 이미 확정된 경우 수정 불가
    if (report.confirmedAt && !body.forceUpdate) {
      return NextResponse.json(
        { error: "Report already confirmed" },
        { status: 400 }
      );
    }

    // 업데이트 데이터 구성
    const updateData: any = {};

    if (body.managerComment !== undefined) {
      updateData.managerComment = body.managerComment;
    }

    if (body.confirm === true) {
      updateData.confirmedAt = new Date();
    }

    const updated = await db.yearlyReport.update({
      where: { id: report.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      id: updated.id,
      managerComment: updated.managerComment,
      confirmedAt: updated.confirmedAt,
    });
  } catch (error) {
    console.error("Update report error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

