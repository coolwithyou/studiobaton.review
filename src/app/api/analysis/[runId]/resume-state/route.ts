import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { analyzeResumeState } from "@/lib/jobs/resume-handler";

/**
 * GET /api/analysis/[runId]/resume-state
 * 
 * Resume 가능 여부 및 상태 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId } = await params;

    const run = await db.analysisRun.findUnique({
      where: { id: runId },
      include: {
        org: {
          include: {
            members: {
              where: { userId: session.user.id },
            },
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (run.org.members.length === 0) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const resumeState = await analyzeResumeState(runId);

    return NextResponse.json(resumeState);
  } catch (error) {
    console.error("Get resume state error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

