/**
 * QStash를 통해 호출되는 커밋 동기화 백그라운드 작업
 * 이 엔드포인트는 QStash에서만 호출되어야 함
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { runCommitSync } from "@/lib/jobs/sync-runner";

async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const { syncJobId } = body;

    if (!syncJobId) {
      return NextResponse.json(
        { error: "Missing syncJobId" },
        { status: 400 }
      );
    }

    console.log(`[QStash Job] Starting commit sync for ${syncJobId}`);

    // 동기화 실행 (완료될 때까지 대기)
    await runCommitSync(syncJobId);

    console.log(`[QStash Job] Commit sync completed for ${syncJobId}`);

    return NextResponse.json({
      success: true,
      syncJobId,
      message: "Commit sync completed",
    });
  } catch (error) {
    console.error("[QStash Job] Commit sync failed:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

// QStash 서명 검증을 통한 보안 처리
export const POST = verifySignatureAppRouter(handler);
