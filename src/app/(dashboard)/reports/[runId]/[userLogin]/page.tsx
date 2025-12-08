import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { db } from "@/lib/db";
import { ReportStats, ReviewResult, ImpactFactors } from "@/types";
import { ActivityChart } from "@/components/charts/activity-chart";
import { WorkTypeChart } from "@/components/charts/work-type-chart";
import { RepoContributionChart } from "@/components/charts/repo-contribution-chart";
import { ImpactRadarChart } from "@/components/charts/impact-radar-chart";
import {
  ArrowLeft,
  Download,
  CheckCircle2,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Target,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export default async function UserReportPage({
  params,
}: {
  params: Promise<{ runId: string; userLogin: string }>;
}) {
  const { runId, userLogin } = await params;

  const report = await db.yearlyReport.findUnique({
    where: {
      runId_userLogin: { runId, userLogin },
    },
    include: {
      run: {
        include: { org: true },
      },
      user: true,
    },
  });

  if (!report) {
    notFound();
  }

  const stats = report.stats as unknown as ReportStats;

  // Work Units 조회 (AI 리뷰 포함)
  const workUnits = await db.workUnit.findMany({
    where: {
      runId,
      userLogin,
      isSampled: true,
    },
    include: {
      repo: { select: { name: true, fullName: true } },
      aiReview: true,
    },
    orderBy: { impactScore: "desc" },
    take: 10,
  });

  return (
    <div className="container py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href={`/analysis/${runId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            분석 결과로 돌아가기
          </Link>
        </Button>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={report.user.avatarUrl || undefined} />
              <AvatarFallback className="text-xl">
                {(report.user.name || report.userLogin).charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold">
                {report.user.name || report.userLogin}
              </h1>
              <p className="text-muted-foreground">
                @{report.userLogin} · {report.year}년 연간 리포트
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {report.isFinalized && (
              <Badge variant="outline" className="text-green-600">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                확정됨
              </Badge>
            )}
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              PDF 다운로드
            </Button>
          </div>
        </div>
      </div>

      {/* 요약 카드 */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI 요약
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg leading-relaxed">{report.summary}</p>
        </CardContent>
      </Card>

      {/* 통계 카드 */}
      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              총 커밋
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalCommits}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              작업 묶음
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalWorkUnits}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              평균 임팩트
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.avgImpactScore}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              변경 규모
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              <span className="text-green-600">+{stats.totalAdditions.toLocaleString()}</span>
              {" / "}
              <span className="text-red-600">-{stats.totalDeletions.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 강점 / 개선점 / 액션아이템 */}
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <TrendingUp className="h-5 w-5" />
              강점
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {report.strengths.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600 shrink-0" />
                  <span className="text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="h-5 w-5" />
              개선 영역
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {report.improvements.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-600 shrink-0" />
                  <span className="text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-600">
              <Target className="h-5 w-5" />
              액션 아이템
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {report.actionItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* 차트 섹션 */}
      <Tabs defaultValue="activity" className="mb-8">
        <TabsList>
          <TabsTrigger value="activity">월별 활동</TabsTrigger>
          <TabsTrigger value="workType">작업 유형</TabsTrigger>
          <TabsTrigger value="repos">저장소 기여</TabsTrigger>
        </TabsList>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>월별 활동 추이</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityChart data={stats.monthlyActivity} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workType">
          <Card>
            <CardHeader>
              <CardTitle>작업 유형 분포</CardTitle>
            </CardHeader>
            <CardContent>
              <WorkTypeChart data={stats.workTypeDistribution} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="repos">
          <Card>
            <CardHeader>
              <CardTitle>저장소별 기여도</CardTitle>
            </CardHeader>
            <CardContent>
              <RepoContributionChart data={stats.topRepos} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 대표 작업 (AI 리뷰) */}
      <Card>
        <CardHeader>
          <CardTitle>대표 작업 (AI 리뷰)</CardTitle>
          <CardDescription>
            임팩트가 높은 작업들의 AI 분석 결과입니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {workUnits.map((wu) => {
              const review = wu.aiReview?.result as ReviewResult | undefined;
              return (
                <div
                  key={wu.id}
                  className="rounded-lg border p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-medium">{wu.summary}</h4>
                      <p className="text-sm text-muted-foreground">
                        {wu.repo.name} · {wu.commitCount}개 커밋 ·{" "}
                        {format(wu.startAt, "MM/dd", { locale: ko })} ~{" "}
                        {format(wu.endAt, "MM/dd", { locale: ko })}
                      </p>
                    </div>
                    <Badge variant="outline">
                      임팩트 {wu.impactScore.toFixed(1)}
                    </Badge>
                  </div>

                  {review && (
                    <>
                      <Separator className="my-3" />
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <p className="text-sm font-medium mb-2">강점</p>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {review.strengths.map((s, i) => (
                              <li key={i}>• {s}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-sm font-medium mb-2">개선 제안</p>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {review.suggestions.map((s, i) => (
                              <li key={i}>• {s}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      {wu.impactFactors && (
                        <div className="mt-4">
                          <p className="text-sm font-medium mb-2">임팩트 분석</p>
                          <ImpactRadarChart data={wu.impactFactors as unknown as ImpactFactors} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 매니저 코멘트 */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>매니저 코멘트</CardTitle>
          <CardDescription>
            리포트를 검토하고 코멘트를 추가하세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {report.managerNotes ? (
            <p className="whitespace-pre-wrap">{report.managerNotes}</p>
          ) : (
            <p className="text-muted-foreground">아직 코멘트가 없습니다.</p>
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="outline">코멘트 수정</Button>
            {!report.isFinalized && <Button>리포트 확정</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

