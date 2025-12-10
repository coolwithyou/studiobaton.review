import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * POST /api/reports/[reportId]/finalize
 * 
 * 리포트를 확정합니다.
 */
export async function POST(
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

    // 조직 멤버인지 확인
    if (report.run.org.members.length === 0) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // ADMIN만 확정 가능
    if (report.run.org.members[0].role !== "ADMIN") {
      return NextResponse.json(
        { error: "Admin access required to finalize" },
        { status: 403 }
      );
    }

    // 이미 확정된 경우
    if (report.isFinalized) {
      return NextResponse.json(
        { error: "Report already finalized" },
        { status: 400 }
      );
    }

    // 리포트 확정
    const updatedReport = await db.yearlyReport.update({
      where: { id: reportId },
      data: {
        isFinalized: true,
        finalizedAt: new Date(),
        finalizedBy: session.user.login,
      },
    });

    return NextResponse.json({
      success: true,
      isFinalized: updatedReport.isFinalized,
      finalizedAt: updatedReport.finalizedAt?.toISOString(),
      finalizedBy: updatedReport.finalizedBy,
    });
  } catch (error) {
    console.error("Finalize report error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/reports/[reportId]/finalize
 * 
 * 리포트 확정을 취소합니다.
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

    // ADMIN만 확정 취소 가능
    if (
      report.run.org.members.length === 0 ||
      report.run.org.members[0].role !== "ADMIN"
    ) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    // 확정 취소
    const updatedReport = await db.yearlyReport.update({
      where: { id: reportId },
      data: {
        isFinalized: false,
        finalizedAt: null,
        finalizedBy: null,
      },
    });

    return NextResponse.json({
      success: true,
      isFinalized: updatedReport.isFinalized,
    });
  } catch (error) {
    console.error("Unfinalize report error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

