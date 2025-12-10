import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import {
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  ChevronRight,
} from "lucide-react";
import { RunStatus } from "@prisma/client";

const statusConfig: Record<RunStatus, { label: string; icon: React.ElementType; variant: "default" | "secondary" | "destructive" | "outline"; spinning?: boolean }> = {
  QUEUED: { label: "대기 중", icon: Clock, variant: "outline" },
  SCANNING_REPOS: { label: "저장소 스캔", icon: Loader2, variant: "secondary", spinning: true },
  SCANNING_COMMITS: { label: "커밋 수집", icon: Loader2, variant: "secondary", spinning: true },
  BUILDING_UNITS: { label: "분석 중", icon: Loader2, variant: "secondary", spinning: true },
  AWAITING_AI_CONFIRMATION: { label: "AI 확인 대기", icon: Clock, variant: "outline" },
  REVIEWING: { label: "AI 리뷰", icon: Loader2, variant: "secondary", spinning: true },
  FINALIZING: { label: "완료 중", icon: Loader2, variant: "secondary", spinning: true },
  DONE: { label: "완료", icon: CheckCircle2, variant: "default" },
  FAILED: { label: "실패", icon: XCircle, variant: "destructive" },
};

async function getAnalysisRuns(userId: string) {
  // 사용자가 속한 조직 목록
  const memberships = await db.organizationMember.findMany({
    where: { userId },
    select: { orgId: true },
  });

  const orgIds = memberships.map((m) => m.orgId);

  // 모든 분석 실행
  const runs = await db.analysisRun.findMany({
    where: {
      orgId: { in: orgIds },
    },
    include: {
      org: {
        select: { login: true, name: true, avatarUrl: true },
      },
      user: {
        select: { login: true, name: true },
      },
      _count: {
        select: { reports: true, workUnits: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return runs;
}

export default async function AnalysisListPage() {
  const user = await getUser();
  if (!user) return null;

  const runs = await getAnalysisRuns(user.id);

  return (
    <div className="container py-8 px-4">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">분석 목록</h1>
          <p className="mt-2 text-muted-foreground">
            모든 분석 실행 기록을 확인할 수 있습니다.
          </p>
        </div>
        <Button asChild>
          <Link href="/analysis/new">
            <Plus className="mr-2 h-4 w-4" />
            새 분석 실행
          </Link>
        </Button>
      </div>

      {runs.length > 0 ? (
        <div className="space-y-4">
          {runs.map((run) => {
            const config = statusConfig[run.status];
            const StatusIcon = config.icon;

            return (
              <Card key={run.id} className="hover:border-primary/50 transition-colors">
                <Link href={`/analysis/${run.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <CardTitle className="text-lg">
                            {run.user.name || run.userLogin}
                          </CardTitle>
                          <CardDescription>
                            {run.org.name || run.org.login} • {run.year}년 분석
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant={config.variant}>
                        <StatusIcon
                          className={`mr-1 h-3 w-3 ${config.spinning ? "animate-spin" : ""}`}
                        />
                        {config.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-6 text-sm text-muted-foreground">
                        <span>
                          Work Units: {run._count.workUnits}개
                        </span>
                        <span>
                          리포트: {run._count.reports}개
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">
                          {run.createdAt.toLocaleDateString("ko-KR", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">분석 기록이 없습니다</h3>
            <p className="mb-4 text-center text-muted-foreground">
              새로운 분석을 시작하여 팀의 코드 기여를 분석해보세요.
            </p>
            <Button asChild>
              <Link href="/analysis/new">
                <Plus className="mr-2 h-4 w-4" />
                새 분석 실행
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
