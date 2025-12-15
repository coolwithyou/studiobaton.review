import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * DELETE /api/reports/[reportId]
 * 
 * 리포트와 관련된 분석 데이터를 삭제합니다.
 * AnalysisRun을 삭제하면 cascade로 WorkUnit, YearlyReport, JobLog가 함께 삭제됩니다.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { reportId } = await params;

    // 리포트 조회 및 권한 확인
    const report = await db.yearlyReport.findUnique({
      where: { id: reportId },
      include: {
        run: {
          include: {
            org: {
              include: {
                members: {
                  where: { userId: session.user.id },
                },
              },
            },
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // 조직 멤버가 아니면 접근 불가
    if (report.run.org.members.length === 0) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // ADMIN만 삭제 가능
    const isAdmin = report.run.org.members[0]?.role === "ADMIN";
    if (!isAdmin) {
      return NextResponse.json(
        { error: "리포트를 삭제하려면 관리자 권한이 필요합니다." },
        { status: 403 }
      );
    }

    const runId = report.runId;
    const orgLogin = report.run.org.login;

    // AnalysisRun 삭제 (cascade로 관련 데이터 모두 삭제)
    await db.analysisRun.delete({
      where: { id: runId },
    });

    return NextResponse.json({
      success: true,
      message: "리포트와 관련 데이터가 삭제되었습니다.",
      redirectUrl: `/organizations/${orgLogin}`,
    });
  } catch (error) {
    console.error("Delete report error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

