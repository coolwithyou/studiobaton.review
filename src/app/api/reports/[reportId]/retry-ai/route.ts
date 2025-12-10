import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { retryAiReviewForReport } from "@/lib/jobs/ai-runner";
import { LLMModelType } from "@/lib/llm";

/**
 * POST /api/reports/[reportId]/retry-ai
 * 
 * 특정 리포트의 AI 분석을 재시도합니다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { reportId } = await params;
    const body = await request.json().catch(() => ({}));
    const { llmModel } = body as { llmModel?: LLMModelType };

    // 리포트 조회 및 권한 확인
    const report = await db.yearlyReport.findUnique({
      where: { id: reportId },
      include: {
        run: {
          include: {
            org: {
              include: {
                members: {
                  where: { userId: session.user.id },
                },
              },
            },
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    if (report.run.org.members.length === 0) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // 확정된 리포트는 재시도 불가
    if (report.isFinalized) {
      return NextResponse.json(
        { error: "확정된 리포트는 AI 분석을 재시도할 수 없습니다." },
        { status: 400 }
      );
    }

    // AI 분석 재시도 (백그라운드)
    retryAiReviewForReport(reportId, llmModel).catch((error) => {
      console.error(`[API] AI retry failed for report ${reportId}:`, error);
    });

    return NextResponse.json({
      success: true,
      message: "AI 분석 재시도가 시작되었습니다.",
    });
  } catch (error) {
    console.error("Retry AI review error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/reports/[reportId]/retry-ai
 * 
 * AI 분석 상태를 조회합니다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { reportId } = await params;

    const report = await db.yearlyReport.findUnique({
      where: { id: reportId },
      include: {
        run: {
          include: {
            org: {
              include: {
                members: {
                  where: { userId: session.user.id },
                },
              },
            },
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    if (report.run.org.members.length === 0) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // AI 리뷰 현황 조회
    const workUnits = await db.workUnit.findMany({
      where: {
        runId: report.runId,
        userLogin: report.userLogin,
        isSampled: true,
      },
      include: {
        aiReview: {
          select: {
            id: true,
            model: true,
            createdAt: true,
          },
        },
      },
    });

    const totalSampled = workUnits.length;
    const reviewed = workUnits.filter((wu) => wu.aiReview).length;
    const lastReviewedAt = workUnits
      .filter((wu) => wu.aiReview)
      .sort((a, b) =>
        new Date(b.aiReview!.createdAt).getTime() - new Date(a.aiReview!.createdAt).getTime()
      )[0]?.aiReview?.createdAt;

    return NextResponse.json({
      reportId,
      totalSampled,
      reviewed,
      pending: totalSampled - reviewed,
      lastReviewedAt,
      isFinalized: report.isFinalized,
      canRetry: !report.isFinalized,
    });
  } catch (error) {
    console.error("Get AI status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
