import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * PATCH /api/reports/[reportId]/manager-notes
 * 
 * 리포트의 매니저 코멘트를 업데이트합니다.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { reportId } = await params;
    const body = await request.json();
    const { notes } = body;

    if (typeof notes !== "string") {
      return NextResponse.json(
        { error: "Invalid notes format" },
        { status: 400 }
      );
    }

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

    // 조직 멤버인지 확인
    if (report.run.org.members.length === 0) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // 이미 확정된 리포트는 수정 불가
    if (report.isFinalized) {
      return NextResponse.json(
        { error: "Cannot edit finalized report" },
        { status: 400 }
      );
    }

    // 매니저 코멘트 업데이트
    const updatedReport = await db.yearlyReport.update({
      where: { id: reportId },
      data: {
        managerNotes: notes,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      managerNotes: updatedReport.managerNotes,
    });
  } catch (error) {
    console.error("Update manager notes error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

