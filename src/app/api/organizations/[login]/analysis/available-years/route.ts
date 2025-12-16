/**
 * 분석 가능 연도 조회 API
 * GET /api/organizations/[login]/analysis/available-years
 * 
 * 커밋 동기화가 완료된 연도 목록을 반환합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

interface AvailableYear {
  year: number;
  syncStatus: string;
  totalCommits: number;
  completedAt: string | null;
  analysisStatus: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  try {
    // 1. 인증 확인
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { login } = await params;

    // 2. 조직 조회
    const org = await db.organization.findUnique({
      where: { login },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // 3. 동기화 완료된 연도 조회
    const syncJobs = await db.commitSyncJob.findMany({
      where: {
        orgId: org.id,
        status: "COMPLETED",
      },
      orderBy: { year: "desc" },
    });

    // 4. 각 연도별 분석 상태 조회
    const analysisRuns = await db.analysisRun.findMany({
      where: {
        orgId: org.id,
        year: { in: syncJobs.map((j) => j.year) },
      },
    });

    const analysisMap = new Map(
      analysisRuns.map((r) => [r.year, r.status])
    );

    // 5. 응답 구성
    const availableYears: AvailableYear[] = syncJobs.map((job) => {
      const progress = job.progress as { totalCommits?: number } | null;
      return {
        year: job.year,
        syncStatus: job.status,
        totalCommits: progress?.totalCommits || 0,
        completedAt: job.finishedAt?.toISOString() || null,
        analysisStatus: analysisMap.get(job.year) || null,
      };
    });

    return NextResponse.json({
      orgLogin: login,
      availableYears,
    });
  } catch (error) {
    console.error("Available years error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

