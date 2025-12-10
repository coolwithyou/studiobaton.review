import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/lib/db";
import { ReportStats } from "@/types";
import { ActivityChart } from "@/components/charts/activity-chart";
import { WorkTypeChart } from "@/components/charts/work-type-chart";
import { ProgressMonitor } from "@/components/analysis/progress-monitor";
import {
  ArrowLeft,
  GitCommit,
  Layers,
  CheckCircle2,
  FileText,
  BarChart3,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export default async function AnalysisDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  const run = await db.analysisRun.findUnique({
    where: { id: runId },
    include: {
      org: true,
      user: true,
      reports: {
        include: {
          user: true,
        },
      },
      _count: {
        select: {
          workUnits: true,
        },
      },
    },
  });

  if (!run) {
    notFound();
  }

  const progress = run.progress as {
    total: number;
    completed: number;
    failed: number;
  } | null;

  const isRunning = !["DONE", "FAILED"].includes(run.status);

  // 전체 통계 집계
  const totalStats = run.reports.reduce(
    (acc, report) => {
      const stats = report.stats as unknown as ReportStats;
      return {
        commits: acc.commits + (stats?.totalCommits || 0),
        workUnits: acc.workUnits + (stats?.totalWorkUnits || 0),
        additions: acc.additions + (stats?.totalAdditions || 0),
        deletions: acc.deletions + (stats?.totalDeletions || 0),
      };
    },
    { commits: 0, workUnits: 0, additions: 0, deletions: 0 }
  );

  return (
    <div className="container py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href="/analysis">
            <ArrowLeft className="mr-2 h-4 w-4" />
            목록으로
          </Link>
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {run.user.name || run.userLogin} - {run.year}년 분석
            </h1>
            <p className="mt-2 text-muted-foreground">
              {run.org.name || run.org.login} • {format(run.createdAt, "yyyy년 MM월 dd일 HH:mm", { locale: ko })} 시작
            </p>
          </div>
        </div>
      </div>

      {/* Progress Monitor (진행 중인 경우 또는 실패한 경우) */}
      {(isRunning || run.status === "FAILED") && (
        <ProgressMonitor
          runId={runId}
          initialStatus={run.status}
          initialProgress={progress}
          targetUser={run.userLogin}
        />
      )}

      {/* 통계 카드 */}
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">총 커밋</CardTitle>
            <GitCommit className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalStats.commits.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">작업 묶음</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{run._count.workUnits}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">변경 규모</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <span className="text-green-600">+{totalStats.additions.toLocaleString()}</span>
              {" / "}
              <span className="text-red-600">-{totalStats.deletions.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 리포트 목록 */}
      {run.status === "DONE" && run.reports.length > 0 && (
        <Tabs defaultValue="reports" className="space-y-4">
          <TabsList>
            <TabsTrigger value="reports">
              <FileText className="mr-2 h-4 w-4" />
              리포트
            </TabsTrigger>
            <TabsTrigger value="overview">
              <BarChart3 className="mr-2 h-4 w-4" />
              전체 현황
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>팀원별 연간 리포트</CardTitle>
                <CardDescription>
                  각 팀원의 연간 코드 기여 리포트를 확인하세요.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {run.reports.map((report) => {
                    const stats = report.stats as unknown as ReportStats;
                    return (
                      <Link
                        key={report.id}
                        href={`/reports/${run.id}/${report.userLogin}`}
                        className="rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-lg font-semibold text-primary">
                              {(report.user.name || report.userLogin).charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">
                              {report.user.name || report.userLogin}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              @{report.userLogin}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">커밋</span>
                            <p className="font-medium">{stats?.totalCommits || 0}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">임팩트</span>
                            <p className="font-medium">{stats?.avgImpactScore?.toFixed(1) || 0}</p>
                          </div>
                        </div>
                        {report.isFinalized && (
                          <Badge variant="outline" className="mt-2">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            확정됨
                          </Badge>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">월별 활동</CardTitle>
                </CardHeader>
                <CardContent>
                  {run.reports[0] && (
                    <ActivityChart
                      data={(run.reports[0].stats as unknown as ReportStats)?.monthlyActivity || []}
                    />
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">작업 유형 분포</CardTitle>
                </CardHeader>
                <CardContent>
                  {run.reports[0] && (
                    <WorkTypeChart
                      data={(run.reports[0].stats as unknown as ReportStats)?.workTypeDistribution || {}}
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* 완료 상태 안내 */}
      {run.status === "DONE" && run.reports.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">리포트가 없습니다</h3>
            <p className="text-muted-foreground">
              분석은 완료되었으나 생성된 리포트가 없습니다.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
