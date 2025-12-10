import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { runAiReviewAndFinalize } from "@/lib/jobs/ai-runner";

/**
 * GET /api/analysis/[runId]/confirm-ai-review
 * 
 * AI 리뷰 전 예상 정보를 조회합니다.
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
        targetUsers: true,
        _count: {
          select: { workUnits: true },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (run.org.members.length === 0) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (run.status !== "AWAITING_AI_CONFIRMATION") {
      return NextResponse.json(
        { error: "Run is not awaiting AI confirmation" },
        { status: 400 }
      );
    }

    // 총 커밋 수 조회
    const totalCommits = await db.commit.count({
      where: {
        repo: { orgId: run.orgId },
        authorLogin: { in: run.targetUsers.map((u) => u.userLogin) },
        committedAt: {
          gte: new Date(`${run.year}-01-01`),
          lte: new Date(`${run.year}-12-31T23:59:59`),
        },
      },
    });

    // 샘플링될 Work Unit 수 (상위 20개 또는 전체의 30%)
    const totalWorkUnits = run._count.workUnits;
    const sampleSize = Math.min(20, Math.ceil(totalWorkUnits * 0.3));

    // 예상 토큰 계산
    const avgInputTokensPerUnit = 2000;
    const avgOutputTokensPerUnit = 500;
    const estimatedInputTokens = sampleSize * avgInputTokensPerUnit;
    const estimatedOutputTokens = sampleSize * avgOutputTokensPerUnit;
    const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens;

    // 예상 비용 (GPT-4o 기준)
    const gpt4oInputCost = 5 / 1_000_000; // $5 per 1M tokens
    const gpt4oOutputCost = 15 / 1_000_000; // $15 per 1M tokens
    const estimatedCostUSD =
      estimatedInputTokens * gpt4oInputCost +
      estimatedOutputTokens * gpt4oOutputCost;

    const options = run.options as { llmModel?: string };

    return NextResponse.json({
      runId: run.id,
      status: run.status,
      summary: {
        totalCommits,
        totalWorkUnits,
        sampleSize,
        targetUsers: run.targetUsers.length,
      },
      tokenEstimate: {
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        totalTokens: estimatedTotalTokens,
        estimatedCostUSD: estimatedCostUSD.toFixed(4),
      },
      llmModel: options?.llmModel || "gpt-4o",
    });
  } catch (error) {
    console.error("Get AI review info error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/analysis/[runId]/confirm-ai-review
 * 
 * AI 리뷰를 시작합니다.
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
    const body = await request.json().catch(() => ({}));
    const { skipAiReview = false } = body;

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

    if (run.org.members.length === 0) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (run.status !== "AWAITING_AI_CONFIRMATION") {
      return NextResponse.json(
        { error: "Run is not awaiting AI confirmation" },
        { status: 400 }
      );
    }

    // AI 리뷰 및 리포트 생성 시작 (백그라운드)
    runAiReviewAndFinalize(runId, skipAiReview).catch((error) => {
      console.error(`[Analysis] AI review failed for ${runId}:`, error);
    });

    return NextResponse.json({
      success: true,
      message: skipAiReview
        ? "AI 리뷰를 건너뛰고 리포트를 생성합니다."
        : "AI 리뷰가 시작되었습니다.",
    });
  } catch (error) {
    console.error("Confirm AI review error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

