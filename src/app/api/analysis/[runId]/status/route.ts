/**
 * 분석 상태 조회 API
 * GET /api/analysis/[runId]/status
 * 
 * 분석 진행 상황, 중간 결과물, 단계별 상세 정보를 반환합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

interface RouteContext {
  params: Promise<{
    runId: string;
  }>;
}

// 분석 단계 정의
const ANALYSIS_PHASES = [
  { key: "METRICS", step: 1, label: "메트릭 계산", description: "커밋 및 활동 지표 계산" },
  { key: "CLUSTERING", step: 2, label: "WorkUnit 클러스터링", description: "관련 커밋 그룹화" },
  { key: "SCORING", step: 3, label: "임팩트 스코어링", description: "작업 영향도 분석" },
  { key: "SAMPLING", step: 4, label: "AI 샘플링", description: "대표 작업 선정" },
  { key: "DIFF_FETCH", step: 5, label: "Diff 조회", description: "코드 변경사항 수집" },
  { key: "AI_ANALYSIS", step: 6, label: "AI 분석", description: "코드 품질 및 패턴 분석" },
];

// AI 분석 스테이지 정의
const AI_STAGES = [
  { stage: 0, label: "샘플링 결정", description: "분석할 WorkUnit 선정" },
  { stage: 1, label: "코드 품질 분석", description: "각 WorkUnit별 코드 품질 평가" },
  { stage: 2, label: "작업 패턴 분석", description: "개발 스타일 및 패턴 분석" },
  { stage: 3, label: "성장 포인트 도출", description: "학습 기회 및 개선점 도출" },
  { stage: 4, label: "종합 평가", description: "최종 평가 보고서 생성" },
];

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    // 1. 인증 확인
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId } = await context.params;

    // 2. 분석 Run 조회 (상세 정보 포함)
    const analysisRun = await db.analysisRun.findUnique({
      where: { id: runId },
      include: {
        org: {
          select: { login: true, name: true },
        },
        workUnits: {
          select: {
            id: true,
            title: true,
            summary: true,
            workType: true,
            impactScore: true,
            isSampled: true,
            startDate: true,
            endDate: true,
            repo: {
              select: { fullName: true, name: true, language: true },
            },
            _count: {
              select: { commits: true },
            },
          },
          orderBy: { impactScore: "desc" },
        },
        reports: {
          select: {
            id: true,
            userLogin: true,
            metrics: true,
            aiInsights: true,
            confirmedAt: true,
          },
        },
      },
    });

    if (!analysisRun) {
      return NextResponse.json(
        { error: "Analysis run not found" },
        { status: 404 }
      );
    }

    // 3. AI Review 결과 조회 (stage 0-4)
    const aiReviews = await db.aiReview.findMany({
      where: {
        OR: [
          { workUnit: { analysisRunId: runId } },
          { report: { analysisRunId: runId } },
        ],
      },
      select: {
        id: true,
        stage: true,
        result: true,
        createdAt: true,
        workUnitId: true,
        reportId: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // 4. Diff 조회 상태 확인
    const sampledWorkUnits = analysisRun.workUnits.filter(wu => wu.isSampled);
    const sampledCommitIds = await db.workUnitCommit.findMany({
      where: {
        workUnitId: { in: sampledWorkUnits.map(wu => wu.id) },
      },
      select: { commitId: true },
    });

    const diffCount = await db.commitDiff.count({
      where: {
        commitId: { in: sampledCommitIds.map(c => c.commitId) },
      },
    });

    // 5. 진행률 계산
    const progress = analysisRun.progress as {
      currentStep: number;
      totalSteps: number;
      message: string;
    } | null;

    const progressPercentage = progress
      ? Math.round((progress.currentStep / progress.totalSteps) * 100)
      : 0;

    // 6. 단계별 완료 상태 계산
    const currentPhaseIndex = ANALYSIS_PHASES.findIndex(p => p.key === analysisRun.phase);
    const phaseStatuses = ANALYSIS_PHASES.map((phase, index) => {
      let status: "completed" | "in_progress" | "pending" = "pending";
      
      if (analysisRun.status === "COMPLETED") {
        status = "completed";
      } else if (analysisRun.status === "FAILED") {
        status = index <= currentPhaseIndex ? (index === currentPhaseIndex ? "in_progress" : "completed") : "pending";
      } else if (index < currentPhaseIndex) {
        status = "completed";
      } else if (index === currentPhaseIndex) {
        status = "in_progress";
      }

      // 각 단계별 추가 정보
      let details: any = null;
      if (status === "completed" || status === "in_progress") {
        switch (phase.key) {
          case "METRICS":
            const report = analysisRun.reports[0];
            if (report?.metrics) {
              const metrics = report.metrics as any;
              details = {
                totalCommits: metrics.productivity?.totalCommits || 0,
                totalAdditions: metrics.productivity?.linesAdded || metrics.productivity?.totalAdditions || 0,
                totalDeletions: metrics.productivity?.linesDeleted || metrics.productivity?.totalDeletions || 0,
                activeDays: metrics.productivity?.workingDays || metrics.workPattern?.activeDays || 0,
                repoCount: metrics.diversity?.repositoryCount || metrics.diversity?.repoCount || 0,
              };
            }
            break;
          case "CLUSTERING":
            // 예측값 가져오기 및 동적 조정
            const workUnitPrediction = (progress as any)?.workUnitPrediction;
            const actualWorkUnitCount = analysisRun.workUnits.length;

            let adjustedPrediction = workUnitPrediction;
            if (workUnitPrediction && actualWorkUnitCount > workUnitPrediction.max * 0.9) {
              // 동적 상향 조정: 90% 초과 시 1.3배
              adjustedPrediction = {
                min: workUnitPrediction.min,
                expected: Math.ceil(workUnitPrediction.expected * 1.3),
                max: Math.ceil(workUnitPrediction.max * 1.3),
              };
            }

            details = {
              totalWorkUnits: actualWorkUnitCount,
              prediction: adjustedPrediction || null,
            };
            break;
          case "SCORING":
            const scoredCount = analysisRun.workUnits.filter(wu => wu.impactScore > 0).length;
            details = {
              scoredWorkUnits: scoredCount,
              topScore: analysisRun.workUnits[0]?.impactScore || 0,
            };
            break;
          case "SAMPLING":
            details = {
              sampledCount: sampledWorkUnits.length,
              totalWorkUnits: analysisRun.workUnits.length,
            };
            break;
          case "DIFF_FETCH":
            details = {
              fetchedDiffs: diffCount,
              totalCommits: sampledCommitIds.length,
            };
            break;
          case "AI_ANALYSIS":
            // AI 스테이지별 상태
            const stageStatuses = AI_STAGES.map(s => {
              const stageReviews = aiReviews.filter(r => r.stage === s.stage);
              return {
                ...s,
                completed: stageReviews.length > 0,
                count: stageReviews.length,
              };
            });

            // stage1Analysis 진행 상황 (progress JSON에서 가져오기)
            const stage1Analysis = (progress as any)?.stage1Analysis;
            const stage1Completed = aiReviews.filter(r => r.stage === 1).length;

            details = {
              stages: stageStatuses,
              stage1Progress: {
                completed: stage1Completed,
                total: sampledWorkUnits.length,
                inProgress: stage1Analysis?.inProgress?.length || 0,
                failed: stage1Analysis?.failed || 0,
                recentResults: stage1Analysis?.recentResults || [],
              },
            };
            break;
        }
      }

      return {
        ...phase,
        status,
        details,
      };
    });

    // 7. AI 스테이지별 결과 요약
    const aiStageResults: Record<number, any> = {};
    for (const stage of AI_STAGES) {
      const stageReviews = aiReviews.filter(r => r.stage === stage.stage);
      if (stageReviews.length > 0) {
        if (stage.stage === 0) {
          // 샘플링 결과
          const samplingResult = stageReviews[0]?.result as any;
          aiStageResults[stage.stage] = {
            selectedCount: samplingResult?.selectedWorkUnitIds?.length || 0,
            selectionReasons: samplingResult?.selectionReasons?.slice(0, 3) || [],
          };
        } else if (stage.stage === 1) {
          // 코드 품질 분석 (WorkUnit별)
          aiStageResults[stage.stage] = {
            analyzedCount: stageReviews.length,
            results: stageReviews.slice(0, 5).map(r => ({
              workUnitId: r.workUnitId,
              codeQuality: (r.result as any)?.codeQuality || null,
              strengths: (r.result as any)?.strengths?.slice(0, 2) || [],
              weaknesses: (r.result as any)?.weaknesses?.slice(0, 2) || [],
            })),
          };
        } else if (stage.stage >= 2) {
          // Stage 2-4는 report 단위
          const result = stageReviews[0]?.result as any;
          aiStageResults[stage.stage] = {
            completed: true,
            summary: getStageSummary(stage.stage, result),
          };
        }
      }
    }

    // 8. 샘플링된 WorkUnit 상세 정보
    const sampledWorkUnitDetails = sampledWorkUnits.map(wu => {
      const stage1Review = aiReviews.find(r => r.workUnitId === wu.id && r.stage === 1);
      return {
        id: wu.id,
        title: wu.title,
        summary: wu.summary,
        workType: wu.workType,
        impactScore: wu.impactScore,
        repo: wu.repo,
        commitCount: wu._count.commits,
        startDate: wu.startDate,
        endDate: wu.endDate,
        codeQuality: stage1Review ? (stage1Review.result as any)?.codeQuality : null,
        analyzed: !!stage1Review,
      };
    });

    return NextResponse.json({
      id: analysisRun.id,
      orgLogin: analysisRun.org.login,
      orgName: analysisRun.org.name,
      userLogin: analysisRun.userLogin,
      year: analysisRun.year,
      status: analysisRun.status,
      phase: analysisRun.phase,
      progress: {
        ...progress,
        percentage: progressPercentage,
      },
      error: analysisRun.error,
      startedAt: analysisRun.startedAt,
      finishedAt: analysisRun.finishedAt,
      
      // 단계별 상세 정보
      phases: phaseStatuses,
      
      // AI 스테이지별 결과
      aiStages: aiStageResults,
      
      // 샘플링된 WorkUnit
      sampledWorkUnits: sampledWorkUnitDetails,
      
      // 통계 요약
      stats: {
        totalWorkUnits: analysisRun.workUnits.length,
        sampledWorkUnits: sampledWorkUnits.length,
        analyzedWorkUnits: aiReviews.filter(r => r.stage === 1).length,
        fetchedDiffs: diffCount,
        reports: analysisRun.reports.length,
      },
    });
  } catch (error) {
    console.error("Get analysis status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Stage별 요약 추출
function getStageSummary(stage: number, result: any): string | null {
  if (!result) return null;
  
  switch (stage) {
    case 2: // 작업 패턴
      return result.workStyle || result.summary || null;
    case 3: // 성장 포인트
      return result.overallGrowthPotential || result.summary || null;
    case 4: // 종합 평가
      return result.executiveSummary || result.summary || null;
    default:
      return null;
  }
}
