import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import {
  Plus,
  Building2,
  BarChart3,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { RunStatus } from "@prisma/client";

const statusConfig: Record<RunStatus, { label: string; icon: React.ElementType; color: string }> = {
  QUEUED: { label: "대기 중", icon: Clock, color: "text-yellow-600" },
  SCANNING_REPOS: { label: "저장소 스캔", icon: Loader2, color: "text-blue-600" },
  SCANNING_COMMITS: { label: "커밋 수집", icon: Loader2, color: "text-blue-600" },
  BUILDING_UNITS: { label: "분석 중", icon: Loader2, color: "text-blue-600" },
  AWAITING_AI_CONFIRMATION: { label: "AI 확인 대기", icon: Clock, color: "text-yellow-600" },
  REVIEWING: { label: "AI 리뷰", icon: Loader2, color: "text-purple-600" },
  FINALIZING: { label: "완료 중", icon: Loader2, color: "text-green-600" },
  DONE: { label: "완료", icon: CheckCircle2, color: "text-green-600" },
  FAILED: { label: "실패", icon: XCircle, color: "text-red-600" },
};

async function getDashboardData(userId: string) {
  // 사용자가 속한 조직 목록
  const orgs = await db.organization.findMany({
    where: {
      members: {
        some: { userId },
      },
    },
    select: {
      id: true,
      login: true,
      name: true,
      installationId: true,
    },
  });

  const orgIds = orgs.map((o) => o.id);

  // 최근 분석 실행 5개
  const recentRuns = await db.analysisRun.findMany({
    where: {
      orgId: { in: orgIds },
    },
    include: {
      org: {
        select: { login: true, name: true },
      },
      _count: {
        select: { reports: true, workUnits: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // 통계
  const totalRuns = await db.analysisRun.count({
    where: { orgId: { in: orgIds } },
  });

  const completedRuns = await db.analysisRun.count({
    where: { orgId: { in: orgIds }, status: "DONE" },
  });

  const totalReports = await db.yearlyReport.count({
    where: {
      run: { orgId: { in: orgIds } },
    },
  });

  return {
    orgs,
    recentRuns,
    stats: {
      totalOrgs: orgs.length,
      installedOrgs: orgs.filter((o) => o.installationId).length,
      totalRuns,
      completedRuns,
      totalReports,
    },
  };
}

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) return null;

  const { orgs, recentRuns, stats } = await getDashboardData(user.id);

  return (
    <div className="container py-8 px-4">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">안녕하세요, {user.name || user.login}님</h1>
        <p className="mt-2 text-muted-foreground">
          팀의 코드 기여를 분석하고 연간 리포트를 생성하세요.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Card className="hover:border-primary/50 transition-colors">
          <Link href="/analysis/new">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">새 분석 실행</CardTitle>
              <Plus className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">시작하기</p>
              <p className="text-xs text-muted-foreground">
                조직과 연도를 선택하여 분석을 시작합니다
              </p>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <Link href="/organizations">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">조직 관리</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {stats.installedOrgs}/{stats.totalOrgs} 연결됨
              </p>
              <p className="text-xs text-muted-foreground">
                GitHub App 설치 및 팀 설정을 관리합니다
              </p>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <Link href="/analysis">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">분석 현황</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.completedRuns}회 완료</p>
              <p className="text-xs text-muted-foreground">
                총 {stats.totalRuns}회 분석 실행, {stats.totalReports}개 리포트
              </p>
            </CardContent>
          </Link>
        </Card>
      </div>

      {/* Recent Analysis Runs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>최근 분석</CardTitle>
            <CardDescription>최근 실행된 분석 목록입니다</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/analysis">
              전체 보기
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentRuns.length > 0 ? (
            <div className="space-y-4">
              {recentRuns.map((run) => {
                const config = statusConfig[run.status];
                const StatusIcon = config.icon;
                const isRunning = !["DONE", "FAILED"].includes(run.status);

                return (
                  <Link
                    key={run.id}
                    href={`/analysis/${run.id}`}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`${config.color}`}>
                        <StatusIcon
                          className={`h-5 w-5 ${isRunning ? "animate-spin" : ""}`}
                        />
                      </div>
                      <div>
                        <p className="font-medium">
                          {run.org.name || run.org.login} - {run.year}년
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {run.createdAt.toLocaleDateString("ko-KR", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm text-muted-foreground">
                        <p>{run._count.workUnits} Work Units</p>
                        <p>{run._count.reports} 리포트</p>
                      </div>
                      <Badge
                        variant={
                          run.status === "DONE"
                            ? "default"
                            : run.status === "FAILED"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {config.label}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="mb-2 font-medium">아직 분석 기록이 없습니다</p>
              <p className="mb-4 text-sm text-muted-foreground">
                첫 번째 분석을 실행해보세요!
              </p>
              <Button asChild>
                <Link href="/analysis/new">
                  <Plus className="mr-2 h-4 w-4" />
                  새 분석 실행
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
