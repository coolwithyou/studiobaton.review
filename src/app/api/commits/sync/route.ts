import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { runCommitSync } from "@/lib/jobs/sync-runner";

interface StartSyncRequest {
  orgLogin: string;
  year: number;
}

export async function POST(request: NextRequest) {
  try {
    // 1. 인증 확인
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. 요청 파싱
    const body: StartSyncRequest = await request.json();
    const { orgLogin, year } = body;

    // 3. 유효성 검사
    if (!orgLogin || !year) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const currentYear = new Date().getFullYear();
    if (year < 2000 || year > currentYear) {
      return NextResponse.json(
        { error: `Invalid year. Must be between 2000 and ${currentYear}` },
        { status: 400 }
      );
    }

    // 4. 조직 조회
    const org = await db.organization.findUnique({
      where: { login: orgLogin },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    if (!org.installationId) {
      return NextResponse.json(
        { error: "GitHub App not installed for this organization" },
        { status: 400 }
      );
    }

    // 5. 기존 동기화 작업 확인
    const existingSync = await db.commitSyncJob.findUnique({
      where: {
        orgId_year: {
          orgId: org.id,
          year,
        },
      },
    });

    // 진행 중인 동기화가 있으면 차단
    if (existingSync && existingSync.status === "IN_PROGRESS") {
      return NextResponse.json(
        {
          error: "Sync already in progress",
          syncJobId: existingSync.id,
          status: existingSync.status,
        },
        { status: 409 }
      );
    }

    // 6. 동기화 작업 생성/업데이트
    let syncJob;
    if (existingSync) {
      // 기존 작업 재시작
      syncJob = await db.commitSyncJob.update({
        where: { id: existingSync.id },
        data: {
          status: "PENDING",
          error: null,
          startedAt: null,
          finishedAt: null,
          progress: {
            totalRepos: 0,
            completedRepos: 0,
            failedRepos: 0,
            totalCommits: 0,
          },
        },
      });
    } else {
      // 새 작업 생성
      syncJob = await db.commitSyncJob.create({
        data: {
          orgId: org.id,
          year,
          status: "PENDING",
          createdById: session.user.id,
          progress: {
            totalRepos: 0,
            completedRepos: 0,
            failedRepos: 0,
            totalCommits: 0,
          },
        },
      });
    }

    // 7. 백그라운드에서 동기화 실행
    runCommitSync(syncJob.id).catch((error) => {
      console.error(`[Sync] Background sync failed for ${syncJob.id}:`, error);
    });

    return NextResponse.json({
      success: true,
      syncJobId: syncJob.id,
      orgLogin,
      year,
      message: "Commit sync started",
    });
  } catch (error) {
    console.error("Start sync error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
