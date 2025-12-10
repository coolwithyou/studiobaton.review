import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { ReportStats } from "@/types";

/**
 * GET /api/reports/compare
 * 
 * 특정 사용자의 연도별 리포트를 조회합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const orgLogin = searchParams.get("org");
    const userLogin = searchParams.get("user");

    if (!orgLogin || !userLogin) {
      return NextResponse.json(
        { error: "Missing org or user parameter" },
        { status: 400 }
      );
    }

    // 조직 조회 및 권한 확인
    const org = await db.organization.findUnique({
      where: { login: orgLogin },
      include: {
        members: {
          where: { userId: session.user.id },
        },
      },
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    if (org.members.length === 0) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // 연도별 리포트 조회
    const reports = await db.yearlyReport.findMany({
      where: {
        userLogin,
        run: {
          orgId: org.id,
          status: "DONE",
        },
      },
      include: {
        run: {
          select: { year: true },
        },
      },
      orderBy: {
        year: "desc",
      },
      take: 5,
    });

    const formattedReports = reports.map((report) => ({
      year: report.year,
      stats: report.stats as unknown as ReportStats,
      summary: report.summary,
      strengths: report.strengths,
      improvements: report.improvements,
      actionItems: report.actionItems,
      isFinalized: report.isFinalized,
    }));

    return NextResponse.json({ reports: formattedReports });
  } catch (error) {
    console.error("Compare reports error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

