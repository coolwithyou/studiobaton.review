import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    // 1. 인증 확인
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. syncJobId 파라미터 가져오기
    const { searchParams } = new URL(request.url);
    const syncJobId = searchParams.get("syncJobId");

    if (!syncJobId) {
      return NextResponse.json(
        { error: "syncJobId is required" },
        { status: 400 }
      );
    }

    // 3. 동기화 작업 조회
    const syncJob = await db.commitSyncJob.findUnique({
      where: { id: syncJobId },
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

    if (!syncJob) {
      return NextResponse.json(
        { error: "Sync job not found" },
        { status: 404 }
      );
    }

    // 4. 권한 확인 (조직 멤버인지)
    if (syncJob.org.members.length === 0) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // 5. 응답 반환
    return NextResponse.json({
      id: syncJob.id,
      status: syncJob.status,
      progress: syncJob.progress,
      error: syncJob.error,
      startedAt: syncJob.startedAt?.toISOString() || null,
      finishedAt: syncJob.finishedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error("Get sync status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

