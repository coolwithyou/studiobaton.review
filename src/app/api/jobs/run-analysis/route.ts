/**
 * QStash를 통해 호출되는 분석 백그라운드 작업
 * 이 엔드포인트는 QStash에서만 호출되어야 함
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { runAnalysis, RestartMode } from "@/lib/jobs/runner-optimized";

async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const { runId, mode = RestartMode.FULL_RESTART } = body;

    if (!runId) {
      return NextResponse.json(
        { error: "Missing runId" },
        { status: 400 }
      );
    }

    console.log(`[QStash Job] Starting analysis for ${runId} (mode: ${mode})`);

    // 분석 실행 (완료될 때까지 대기)
    await runAnalysis(runId, mode);

    console.log(`[QStash Job] Analysis completed for ${runId}`);

    return NextResponse.json({
      success: true,
      runId,
      message: "Analysis completed",
    });
  } catch (error) {
    console.error("[QStash Job] Analysis failed:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

// QStash 서명 검증을 통한 보안 처리
export const POST = verifySignatureAppRouter(handler);

