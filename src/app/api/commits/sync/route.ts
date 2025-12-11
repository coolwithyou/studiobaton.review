import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { runCommitSync } from "@/lib/jobs/sync-runner";
import { qstash } from "@/lib/qstash";
import { getInstallationOctokit } from "@/lib/github";

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

    // 5-1. PR 권한 체크
    const octokit = await getInstallationOctokit(org.installationId);
    const { data: installation } = await octokit.rest.apps.getInstallation({
      installation_id: org.installationId,
    });

    const permissions = installation.permissions || {};
    if (!permissions.pull_requests || permissions.pull_requests === "none") {
      return NextResponse.json(
        {
          error: "Pull Request 권한이 없습니다. GitHub App 설정에서 Pull requests 읽기 권한을 추가해주세요.",
          permissionError: true,
          missingPermission: "pull_requests",
        },
        { status: 403 }
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
    // 프로덕션 환경에서는 QStash 사용, 로컬에서는 직접 실행
    const isDevelopment = process.env.NODE_ENV === "development";

    if (isDevelopment) {
      // 로컬 개발 환경: 직접 실행 (기존 방식)
      console.log(`[Sync] Running sync locally for ${syncJob.id}`);
      runCommitSync(syncJob.id).catch((error) => {
        console.error(`[Sync] Background sync failed for ${syncJob.id}:`, error);
      });
    } else {
      // 프로덕션 환경: QStash를 통해 실행
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
        const jobUrl = `${baseUrl}/api/jobs/sync-commits`;

        console.log(`[Sync] Enqueuing sync job via QStash: ${syncJob.id}`);

        await qstash.publishJSON({
          url: jobUrl,
          body: {
            syncJobId: syncJob.id,
          },
          // 최대 10분 타임아웃 (커밋이 많을 경우)
          timeout: "10m",
          // 실패 시 3번 재시도
          retries: 3,
        });

        console.log(`[Sync] Sync job enqueued successfully: ${syncJob.id}`);
      } catch (qstashError) {
        console.error(`[Sync] Failed to enqueue job via QStash:`, qstashError);
        // QStash 실패 시 fallback으로 직접 실행
        console.log(`[Sync] Falling back to direct execution for ${syncJob.id}`);
        runCommitSync(syncJob.id).catch((error) => {
          console.error(`[Sync] Background sync failed for ${syncJob.id}:`, error);
        });
      }
    }

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
