import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { AnalysisOptions } from "@/types";
// import { Client } from "@upstash/qstash"; // QStash 연동 시 활성화

// QStash 클라이언트 (실제 구현 시 활성화)
// const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

interface StartAnalysisRequest {
  orgLogin: string;
  year: number;
  userLogins: string[];
  options?: AnalysisOptions;
}

export async function POST(request: NextRequest) {
  try {
    // 1. 인증 확인
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. 요청 파싱
    const body: StartAnalysisRequest = await request.json();
    const { orgLogin, year, userLogins, options = {} } = body;

    // 3. 유효성 검사
    if (!orgLogin || !year || !userLogins?.length) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 4. 조직 조회 (GitHub App 설치 확인)
    const org = await db.organization.findUnique({
      where: { login: orgLogin },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found. Please install GitHub App first." },
        { status: 404 }
      );
    }

    if (!org.installationId) {
      return NextResponse.json(
        { error: "GitHub App not installed for this organization." },
        { status: 400 }
      );
    }

    // 5. 기존 분석 확인 (같은 연도)
    const existingRun = await db.analysisRun.findUnique({
      where: {
        orgId_year: {
          orgId: org.id,
          year,
        },
      },
    });

    if (existingRun && existingRun.status !== "FAILED") {
      return NextResponse.json(
        { error: "Analysis for this year already exists.", runId: existingRun.id },
        { status: 409 }
      );
    }

    // 6. GitHubUser 레코드 확인/생성
    for (const login of userLogins) {
      await db.gitHubUser.upsert({
        where: { login },
        create: { login },
        update: {},
      });
    }

    // 7. AnalysisRun 생성
    const analysisRun = await db.analysisRun.upsert({
      where: {
        orgId_year: {
          orgId: org.id,
          year,
        },
      },
      create: {
        orgId: org.id,
        year,
        status: "QUEUED",
        options: {
          llmModel: options.llmModel || "gpt-4o",
          includeArchived: options.includeArchived || false,
          excludeRepos: options.excludeRepos || [],
          clusteringConfig: options.clusteringConfig || {},
          impactConfig: options.impactConfig || {},
        },
        createdById: session.user.id,
        progress: {
          total: 0,
          completed: 0,
          failed: 0,
          phase: "QUEUED",
        },
        targetUsers: {
          createMany: {
            data: userLogins.map((login) => ({ userLogin: login })),
          },
        },
      },
      update: {
        status: "QUEUED",
        error: null,
        startedAt: null,
        finishedAt: null,
        options: {
          llmModel: options.llmModel || "gpt-4o",
          includeArchived: options.includeArchived || false,
          excludeRepos: options.excludeRepos || [],
          clusteringConfig: options.clusteringConfig || {},
          impactConfig: options.impactConfig || {},
        },
        progress: {
          total: 0,
          completed: 0,
          failed: 0,
          phase: "QUEUED",
        },
      },
    });

    // 8. QStash에 첫 번째 Job 등록 (org_scan_repos)
    // 실제 구현 시 활성화
    /*
    await qstash.publishJSON({
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/scan-repos`,
      body: {
        runId: analysisRun.id,
        orgLogin,
        installationId: org.installationId,
      },
    });
    */

    // 임시: 직접 상태 업데이트 (개발용)
    await db.analysisRun.update({
      where: { id: analysisRun.id },
      data: {
        status: "SCANNING_REPOS",
        startedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      runId: analysisRun.id,
      status: "queued",
      estimatedTime: 15, // 예상 소요 시간 (분)
    });
  } catch (error) {
    console.error("Analysis start error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

