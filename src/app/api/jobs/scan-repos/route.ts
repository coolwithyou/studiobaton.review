import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getInstallationOctokit, getOrganizationRepos } from "@/lib/github";
import { AnalysisOptions } from "@/types";

interface ScanReposPayload {
  runId: string;
  orgLogin: string;
  installationId: number;
}

export async function POST(request: NextRequest) {
  try {
    // QStash 서명 검증 (실제 구현 시)
    // const signature = request.headers.get("upstash-signature");
    // await verifySignature(signature, await request.text());

    const body: ScanReposPayload = await request.json();
    const { runId, orgLogin, installationId } = body;

    // 1. AnalysisRun 조회
    const run = await db.analysisRun.findUnique({
      where: { id: runId },
      include: { org: true },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // 2. 상태 업데이트
    await db.analysisRun.update({
      where: { id: runId },
      data: {
        status: "SCANNING_REPOS",
        startedAt: run.startedAt || new Date(),
      },
    });

    // 3. GitHub API로 저장소 목록 조회
    const octokit = await getInstallationOctokit(installationId);
    const options = run.options as AnalysisOptions;
    
    const repos = await getOrganizationRepos(octokit, orgLogin, {
      includeArchived: options?.includeArchived,
    });

    // 제외할 저장소 필터링
    const excludeRepos = options?.excludeRepos || [];
    const filteredRepos = repos.filter(
      (repo) => !excludeRepos.includes(repo.fullName)
    );

    // 4. Repository 레코드 저장/업데이트
    for (const repo of filteredRepos) {
      await db.repository.upsert({
        where: { fullName: repo.fullName },
        create: {
          orgId: run.orgId,
          githubId: repo.id,
          fullName: repo.fullName,
          name: repo.name,
          defaultBranch: repo.defaultBranch,
          isArchived: repo.isArchived,
          isPrivate: repo.isPrivate,
          language: repo.language,
          description: repo.description,
        },
        update: {
          defaultBranch: repo.defaultBranch,
          isArchived: repo.isArchived,
          isPrivate: repo.isPrivate,
          language: repo.language,
          description: repo.description,
        },
      });
    }

    // 5. 진행률 업데이트
    await db.analysisRun.update({
      where: { id: runId },
      data: {
        status: "SCANNING_COMMITS",
        progress: {
          total: filteredRepos.length,
          completed: 0,
          failed: 0,
          phase: "SCANNING_COMMITS",
        },
      },
    });

    // 6. 각 저장소에 대해 커밋 스캔 Job 생성 (QStash Fan-out)
    // 실제 구현 시:
    /*
    const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
    
    for (const repo of filteredRepos) {
      await qstash.publishJSON({
        url: `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/scan-commits`,
        body: {
          runId,
          repoFullName: repo.fullName,
          installationId,
          year: run.year,
        },
        delay: Math.floor(Math.random() * 10), // 0-10초 랜덤 지연 (rate limit 분산)
      });
    }
    */

    return NextResponse.json({
      success: true,
      repoCount: filteredRepos.length,
    });
  } catch (error) {
    console.error("Scan repos error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

