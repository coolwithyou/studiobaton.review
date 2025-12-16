/**
 * 기여자 연도별 분석 결과 조회 API
 * GET /api/organizations/[login]/contributors/[userLogin]/analysis/[year]
 * 
 * 특정 기여자의 특정 연도 분석 결과를 반환합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ login: string; userLogin: string; year: string }> }
) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { login: orgLogin, userLogin, year: yearStr } = await params;
    const year = parseInt(yearStr, 10);

    if (isNaN(year)) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    // 조직 조회
    const org = await db.organization.findUnique({
      where: { login: orgLogin },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // 분석 Run 조회
    const analysisRun = await db.analysisRun.findUnique({
      where: {
        orgId_year_userLogin: {
          orgId: org.id,
          year,
          userLogin,
        },
      },
    });

    if (!analysisRun) {
      return NextResponse.json(
        { error: "Analysis not found" },
        { status: 404 }
      );
    }

    if (analysisRun.status !== "COMPLETED") {
      return NextResponse.json(
        {
          error: "Analysis not completed",
          status: analysisRun.status,
          phase: analysisRun.phase,
        },
        { status: 400 }
      );
    }

    // 리포트 조회
    const report = await db.yearlyReport.findUnique({
      where: {
        analysisRunId_userLogin: {
          analysisRunId: analysisRun.id,
          userLogin,
        },
      },
      include: {
        aiReviews: {
          where: { stage: { gte: 2 } }, // Stage 2, 3, 4
          orderBy: { stage: "asc" },
        },
      },
    });

    if (!report) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    // WorkUnit 샘플 조회 (분석된 것들)
    const sampledWorkUnits = await db.workUnit.findMany({
      where: {
        analysisRunId: analysisRun.id,
        userLogin,
        isSampled: true,
      },
      include: {
        repo: {
          select: { fullName: true, name: true, language: true },
        },
        aiReviews: {
          where: { stage: 1 }, // Stage 1: 코드 품질
        },
        commits: {
          include: {
            commit: {
              select: {
                sha: true,
                message: true,
                additions: true,
                deletions: true,
                committedAt: true,
              },
            },
          },
          take: 3,
        },
      },
      orderBy: { impactScore: "desc" },
    });

    // Stage 2, 3, 4 결과 추출
    const stage2 = report.aiReviews.find((r) => r.stage === 2)?.result;
    const stage3 = report.aiReviews.find((r) => r.stage === 3)?.result;
    const stage4 = report.aiReviews.find((r) => r.stage === 4)?.result;

    // 사용자 정보
    const githubUser = await db.gitHubUser.findUnique({
      where: { login: userLogin },
    });

    return NextResponse.json({
      orgLogin,
      userLogin,
      year,
      user: {
        login: githubUser?.login || userLogin,
        name: githubUser?.name || null,
        avatarUrl: githubUser?.avatarUrl || null,
      },
      analysisRun: {
        id: analysisRun.id,
        status: analysisRun.status,
        startedAt: analysisRun.startedAt?.toISOString() || null,
        finishedAt: analysisRun.finishedAt?.toISOString() || null,
      },
      report: {
        id: report.id,
        metrics: report.metrics,
        overallScore: report.overallScore,
        aiInsights: report.aiInsights,
        managerComment: report.managerComment,
        confirmedAt: report.confirmedAt?.toISOString() || null,
      },
      analysis: {
        workPattern: stage2,
        growthPoints: stage3,
        summary: stage4,
      },
      sampledWorkUnits: sampledWorkUnits.map((wu) => ({
        id: wu.id,
        title: wu.title,
        summary: wu.summary,
        workType: wu.workType,
        impactScore: wu.impactScore,
        repo: {
          fullName: wu.repo.fullName,
          name: wu.repo.name,
          language: wu.repo.language,
        },
        startDate: wu.startDate.toISOString(),
        endDate: wu.endDate.toISOString(),
        codeQuality: wu.aiReviews[0]?.result || null,
        commits: wu.commits.slice(0, 3).map((wuc) => ({
          sha: wuc.commit.sha.substring(0, 7),
          message: wuc.commit.message.split("\n")[0].substring(0, 80),
          additions: wuc.commit.additions,
          deletions: wuc.commit.deletions,
          date: wuc.commit.committedAt.toISOString().split("T")[0],
        })),
      })),
    });
  } catch (error) {
    console.error("Analysis result error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

