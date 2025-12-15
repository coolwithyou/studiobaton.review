import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

interface RouteParams {
  params: Promise<{
    orgLogin: string;
    year: string;
  }>;
}

// GET: 동기화 상태 조회
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgLogin, year: yearStr } = await params;
    const year = parseInt(yearStr);

    // 1. 조직 조회
    const org = await db.organization.findUnique({
      where: { login: orgLogin },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // 2. 동기화 작업 조회
    const syncJob = await db.commitSyncJob.findUnique({
      where: {
        orgId_year: {
          orgId: org.id,
          year,
        },
      },
    });

    if (!syncJob) {
      return NextResponse.json(
        { error: "Sync job not found", exists: false },
        { status: 404 }
      );
    }

    // 3. 진행률 정보 반환
    return NextResponse.json({
      id: syncJob.id,
      orgLogin,
      year: syncJob.year,
      status: syncJob.status,
      progress: syncJob.progress,
      error: syncJob.error,
      startedAt: syncJob.startedAt,
      finishedAt: syncJob.finishedAt,
      createdAt: syncJob.createdAt,
    });
  } catch (error) {
    console.error("Get sync status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: 동기화 작업 취소/삭제
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // 1. 인증 확인
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orgLogin, year: yearStr } = await params;
    const year = parseInt(yearStr);

    // 2. 조직 조회
    const org = await db.organization.findUnique({
      where: { login: orgLogin },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // 3. 동기화 작업 조회
    const syncJob = await db.commitSyncJob.findUnique({
      where: {
        orgId_year: {
          orgId: org.id,
          year,
        },
      },
    });

    if (!syncJob) {
      return NextResponse.json(
        { error: "Sync job not found" },
        { status: 404 }
      );
    }

    // 4. 진행 중인 작업은 취소 처리
    if (syncJob.status === "IN_PROGRESS") {
      await db.commitSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: "FAILED",
          error: "Cancelled by user",
          finishedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: "Sync job cancelled",
      });
    }

    // 5. 완료/실패한 작업은 삭제
    await db.commitSyncJob.delete({
      where: { id: syncJob.id },
    });

    return NextResponse.json({
      success: true,
      message: "Sync job deleted",
    });
  } catch (error) {
    console.error("Delete sync job error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

