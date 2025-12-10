import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { InterimReportView } from "@/components/reports/interim-report-view";
import { calculateInterimStats } from "@/lib/analysis/interim-stats";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface PageProps {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ userLogin?: string }>;
}

export default async function InterimReportPage({
  params,
  searchParams,
}: PageProps) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.user) {
    redirect("/login");
  }

  const { runId } = await params;
  const { userLogin } = await searchParams;

  // userLogin이 없으면 분석 상세 페이지로 리다이렉트
  if (!userLogin) {
    redirect(`/analysis/${runId}`);
  }

  // 분석 실행 조회 및 권한 확인
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
    notFound();
  }

  if (run.org.members.length === 0) {
    redirect("/dashboard");
  }

  if (run.userLogin !== userLogin) {
    notFound();
  }

  // Work Unit 확인
  const workUnitCount = await db.workUnit.count({
    where: { runId, userLogin },
  });

  if (workUnitCount === 0) {
    return (
      <div className="container mx-auto p-8">
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
          <div className="text-center">
            <h2 className="text-2xl font-bold">리포트를 생성할 수 없습니다</h2>
            <p className="text-muted-foreground mt-2">
              Work Unit이 아직 생성되지 않았습니다.
            </p>
            <p className="text-sm text-muted-foreground">
              분석 상태: <strong>{run.status}</strong>
            </p>
          </div>
          <Button asChild>
            <Link href={`/analysis/${runId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              분석 상세로 돌아가기
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // 리포트 데이터 생성
  const reportData = await calculateInterimStats(runId, userLogin);

  return (
    <div className="container mx-auto p-8">
      <div className="mb-6">
        <Button variant="ghost" asChild>
          <Link href={`/analysis/${runId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            분석 상세로 돌아가기
          </Link>
        </Button>
      </div>

      <InterimReportView data={reportData} />
    </div>
  );
}

