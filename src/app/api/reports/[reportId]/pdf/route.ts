import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { ReportStats } from "@/types";
import { generateReportPdf } from "@/lib/pdf/report-pdf";

/**
 * GET /api/reports/[reportId]/pdf
 * 
 * 리포트를 PDF로 생성하여 반환합니다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { reportId } = await params;

    // 리포트 조회
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
        user: true,
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // 권한 확인
    if (report.run.org.members.length === 0) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const stats = report.stats as unknown as ReportStats;

    // PDF 생성
    const pdfBuffer = await generateReportPdf({
      userLogin: report.userLogin,
      userName: report.user.name,
      year: report.year,
      orgName: report.run.org.name || report.run.org.login,
      summary: report.summary,
      strengths: report.strengths,
      improvements: report.improvements,
      actionItems: report.actionItems,
      stats,
      managerNotes: report.managerNotes,
      isFinalized: report.isFinalized,
      finalizedAt: report.finalizedAt?.toISOString() || null,
    });

    // PDF 응답 반환
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="report-${report.userLogin}-${report.year}.pdf"`,
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}

