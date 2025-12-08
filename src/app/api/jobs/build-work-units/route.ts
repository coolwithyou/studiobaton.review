import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  clusterCommits,
  generateSummary,
  detectHotfix,
  detectRevert,
} from "@/lib/analysis/clustering";
import {
  calculateImpactScore,
  calculateHotspotFiles,
  inferWorkType,
} from "@/lib/analysis/scoring";
import { ClusteringConfig, ImpactConfig, AnalysisOptions } from "@/types";

interface BuildWorkUnitsPayload {
  runId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: BuildWorkUnitsPayload = await request.json();
    const { runId } = body;

    // 1. 분석 실행 조회
    const run = await db.analysisRun.findUnique({
      where: { id: runId },
      include: {
        targetUsers: true,
        org: {
          include: {
            repos: {
              select: { id: true, fullName: true },
            },
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // 2. 상태 업데이트
    await db.analysisRun.update({
      where: { id: runId },
      data: { status: "BUILDING_UNITS" },
    });

    const options = run.options as AnalysisOptions;
    const clusteringConfig: Partial<ClusteringConfig> =
      options?.clusteringConfig || {};
    const impactConfig: Partial<ImpactConfig> = options?.impactConfig || {};

    let totalWorkUnits = 0;
    const targetLogins = run.targetUsers.map((u) => u.userLogin);

    // 3. 각 사용자별로 Work Unit 생성
    for (const userLogin of targetLogins) {
      // 해당 연도의 커밋 조회 (파일 정보 포함)
      const commits = await db.commit.findMany({
        where: {
          authorLogin: userLogin,
          repo: {
            orgId: run.orgId,
          },
          committedAt: {
            gte: new Date(`${run.year}-01-01`),
            lte: new Date(`${run.year}-12-31T23:59:59`),
          },
        },
        include: {
          files: true,
          repo: {
            select: { id: true, fullName: true },
          },
        },
        orderBy: { committedAt: "asc" },
      });

      if (commits.length === 0) continue;

      // 핫스팟 파일 계산
      const hotspotFiles = calculateHotspotFiles(commits);

      // 저장소별로 그룹화
      const commitsByRepo = new Map<string, typeof commits>();
      for (const commit of commits) {
        const repoId = commit.repoId;
        if (!commitsByRepo.has(repoId)) {
          commitsByRepo.set(repoId, []);
        }
        commitsByRepo.get(repoId)!.push(commit);
      }

      // 각 저장소별로 클러스터링
      for (const [repoId, repoCommits] of commitsByRepo) {
        const workUnits = clusterCommits(repoCommits, clusteringConfig);

        for (const wu of workUnits) {
          const isHotfix = detectHotfix(wu.commits);
          const hasRevert = detectRevert(wu.commits);

          // 임팩트 스코어 계산
          const { score, factors } = calculateImpactScore(
            {
              additions: wu.additions,
              deletions: wu.deletions,
              primaryPaths: wu.primaryPaths,
              isHotfix,
              hasRevert,
            },
            impactConfig,
            hotspotFiles
          );

          // 요약 및 작업 유형 생성
          const summary = generateSummary(wu.commits);
          const workType = inferWorkType(
            wu.commits[0]?.message || "",
            wu.primaryPaths
          );

          // Work Unit 저장
          const workUnit = await db.workUnit.create({
            data: {
              runId,
              repoId,
              userLogin,
              startAt: wu.startAt,
              endAt: wu.endAt,
              commitCount: wu.commits.length,
              filesChanged: wu.filesChanged,
              additions: wu.additions,
              deletions: wu.deletions,
              summary: `[${workType}] ${summary}`,
              primaryPaths: wu.primaryPaths,
              impactScore: score,
              impactFactors: JSON.parse(JSON.stringify(factors)),
              isHotfix,
              hasRevert,
              isSampled: false,
            },
          });

          // Work Unit - Commit 연결
          for (let i = 0; i < wu.commits.length; i++) {
            await db.workUnitCommit.create({
              data: {
                workUnitId: workUnit.id,
                commitId: wu.commits[i].id,
                order: i,
              },
            });
          }

          totalWorkUnits++;
        }
      }
    }

    // 4. 샘플링 대상 선정
    await selectSamples(runId);

    // 5. 상태 업데이트 및 다음 단계 트리거
    await db.analysisRun.update({
      where: { id: runId },
      data: {
        status: "REVIEWING",
        progress: {
          total: totalWorkUnits,
          completed: 0,
          failed: 0,
          phase: "REVIEWING",
        },
      },
    });

    // AI 리뷰 Job 트리거 (QStash)
    /*
    await qstash.publishJSON({
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/ai-review`,
      body: { runId },
    });
    */

    // Job 로그 기록
    await db.jobLog.create({
      data: {
        runId,
        jobType: "build_work_units",
        jobId: `build-${runId}-${Date.now()}`,
        status: "COMPLETED",
        output: { totalWorkUnits },
        startedAt: new Date(),
        endedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      totalWorkUnits,
    });
  } catch (error) {
    console.error("Build work units error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================
// 샘플링 대상 선정
// ============================================

async function selectSamples(runId: string): Promise<void> {
  // 임팩트 상위 7개
  const topImpact = await db.workUnit.findMany({
    where: { runId },
    orderBy: { impactScore: "desc" },
    take: 7,
  });

  // 랜덤 3개 (상위 제외)
  const topIds = topImpact.map((w) => w.id);
  const remaining = await db.workUnit.findMany({
    where: {
      runId,
      id: { notIn: topIds },
    },
  });

  const shuffled = remaining.sort(() => Math.random() - 0.5);
  const randomSamples = shuffled.slice(0, 3);

  // Hotfix/Revert 포함 2개
  const specialSamples = await db.workUnit.findMany({
    where: {
      runId,
      id: { notIn: topIds },
      OR: [{ isHotfix: true }, { hasRevert: true }],
    },
    take: 2,
  });

  // 샘플 표시 업데이트
  const sampleIds = [
    ...topImpact.map((w) => w.id),
    ...randomSamples.map((w) => w.id),
    ...specialSamples.map((w) => w.id),
  ];

  const uniqueIds = [...new Set(sampleIds)];

  await db.workUnit.updateMany({
    where: { id: { in: uniqueIds } },
    data: { isSampled: true },
  });
}

