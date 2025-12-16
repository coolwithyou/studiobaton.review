/**
 * 분석 리포트 목록 조회 API
 * GET /api/analysis/[runId]/reports
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

interface RouteContext {
  params: Promise<{
    runId: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    // 1. 인증 확인
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId } = await context.params;

    // 2. 분석 Run 확인
    const analysisRun = await db.analysisRun.findUnique({
      where: { id: runId },
      select: { id: true, year: true },
    });

    if (!analysisRun) {
      return NextResponse.json(
        { error: "Analysis run not found" },
        { status: 404 }
      );
    }

    // 3. 리포트 목록 조회
    const reports = await db.yearlyReport.findMany({
      where: { analysisRunId: runId },
      include: {
        aiReviews: {
          where: { stage: 4 },
          select: { result: true },
          take: 1,
        },
      },
    });

    // 4. GitHubUser 정보 조회
    const userLogins = reports.map(r => r.userLogin);
    const users = await db.gitHubUser.findMany({
      where: { login: { in: userLogins } },
      select: {
        login: true,
        name: true,
        avatarUrl: true,
      },
    });

    const userMap = new Map(users.map(u => [u.login, u]));

    // 5. 응답 구성
    const result = reports.map(report => {
      const user = userMap.get(report.userLogin);
      const metrics = report.metrics as any;
      const stage4Result = report.aiReviews[0]?.result as any;
      const overallScore = report.overallScore as any;

      // 종합 점수 계산
      let totalScore = 0;
      if (overallScore) {
        const weights = { productivity: 0.25, codeQuality: 0.30, diversity: 0.15, collaboration: 0.15, growth: 0.15 };
        totalScore = Object.entries(weights).reduce((sum, [key, weight]) => {
          return sum + (overallScore[key]?.score || 5) * weight;
        }, 0);
        totalScore = Math.round(totalScore * 10) / 10;
      }

      return {
        id: report.id,
        userLogin: report.userLogin,
        userName: user?.name,
        avatarUrl: user?.avatarUrl,
        metrics: metrics ? {
          totalCommits: metrics.productivity?.totalCommits || 0,
          totalPRs: metrics.productivity?.totalPRs || 0,
          linesAdded: metrics.productivity?.linesAdded || 0,
          linesDeleted: metrics.productivity?.linesDeleted || 0,
          workingDays: metrics.productivity?.workingDays || 0,
          repoCount: metrics.diversity?.repositoryCount || 0,
        } : null,
        overallScore: totalScore,
        executiveSummary: stage4Result?.executiveSummary,
        confirmedAt: report.confirmedAt,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      };
    });

    // 점수순 정렬
    result.sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));

    return NextResponse.json({
      year: analysisRun.year,
      reports: result,
    });
  } catch (error) {
    console.error("Get reports error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

