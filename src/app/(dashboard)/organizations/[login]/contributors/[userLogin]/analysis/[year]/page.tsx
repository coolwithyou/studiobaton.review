"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowLeft,
  GitCommit,
  TrendingUp,
  TrendingDown,
  Star,
  Target,
  Lightbulb,
  Award,
  Code2,
  CheckCircle2,
  AlertCircle,
  FolderGit2,
  Calendar,
} from "lucide-react";

interface AnalysisResultData {
  orgLogin: string;
  userLogin: string;
  year: number;
  user: {
    login: string;
    name: string | null;
    avatarUrl: string | null;
  };
  analysisRun: {
    id: string;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
  };
  report: {
    id: string;
    metrics: any;
    overallScore: any;
    aiInsights: any;
    managerComment: string | null;
    confirmedAt: string | null;
  };
  analysis: {
    workPattern: any;
    growthPoints: any;
    summary: any;
  };
  sampledWorkUnits: {
    id: string;
    title: string | null;
    summary: string | null;
    workType: string | null;
    impactScore: number;
    repo: {
      fullName: string;
      name: string;
      language: string | null;
    };
    startDate: string;
    endDate: string;
    codeQuality: any;
    commits: {
      sha: string;
      message: string;
      additions: number;
      deletions: number;
      date: string;
    }[];
  }[];
}

export default function AnalysisResultPage() {
  const params = useParams();
  const router = useRouter();
  const orgLogin = params.login as string;
  const userLogin = params.userLogin as string;
  const year = parseInt(params.year as string, 10);

  const [data, setData] = useState<AnalysisResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/organizations/${orgLogin}/contributors/${userLogin}/analysis/${year}`
        );
        
        // 분석 상태 확인 - 미완료 시 progress 페이지로 리다이렉트
        if (res.status === 202) {
          // 202 Accepted: 분석 진행 중
          router.replace(`/organizations/${orgLogin}/contributors/${userLogin}/analysis/${year}/progress`);
          return;
        }
        
        if (!res.ok) {
          const json = await res.json();
          
          // 분석이 없거나 진행 중인 경우 progress 페이지로 이동
          if (json.status === "IN_PROGRESS" || json.status === "PENDING") {
            router.replace(`/organizations/${orgLogin}/contributors/${userLogin}/analysis/${year}/progress`);
            return;
          }
          
          throw new Error(json.error || "Failed to fetch analysis result");
        }
        
        const json = await res.json();
        
        // 분석 완료 여부 확인
        if (json.analysisRun?.status !== "COMPLETED") {
          router.replace(`/organizations/${orgLogin}/contributors/${userLogin}/analysis/${year}/progress`);
          return;
        }
        
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [orgLogin, userLogin, year, router]);

  if (loading) {
    return <AnalysisResultSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="container py-8 px-4">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href={`/organizations/${orgLogin}/contributors/${userLogin}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            돌아가기
          </Link>
        </Button>
        <div className="text-center py-12">
          <p className="text-destructive">{error || "데이터를 불러올 수 없습니다."}</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  const summary = data.analysis.summary;
  const workPattern = data.analysis.workPattern;
  const growthPoints = data.analysis.growthPoints;
  const metrics = data.report.metrics;

  return (
    <div className="container py-8 px-4 max-w-5xl">
      {/* Back Button & Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href={`/organizations/${orgLogin}/contributors/${userLogin}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            기여자 상세로 돌아가기
          </Link>
        </Button>

        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarImage src={data.user.avatarUrl || undefined} />
            <AvatarFallback className="text-lg">
              {data.user.login.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">
              {data.user.name || data.user.login} - {year}년 분석 결과
            </h1>
            <p className="text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              분석 완료: {data.analysisRun.finishedAt
                ? new Date(data.analysisRun.finishedAt).toLocaleDateString("ko-KR")
                : "N/A"}
            </p>
          </div>
        </div>
      </div>

      {/* Executive Summary */}
      {summary && (
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              종합 평가
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg leading-relaxed">{summary.executiveSummary || summary.summary}</p>
            
            {summary.overallAssessment && (
              <div className="mt-4 p-4 bg-background rounded-lg">
                <p className="font-medium mb-2">총평</p>
                <p className="text-muted-foreground">{summary.overallAssessment}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Scores Overview */}
      {metrics && (
        <div className="mb-8 grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <GitCommit className="mx-auto h-8 w-8 text-primary mb-2" />
                <p className="text-3xl font-bold">{metrics.productivity?.totalCommits || 0}</p>
                <p className="text-sm text-muted-foreground">총 커밋</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Code2 className="mx-auto h-8 w-8 text-green-500 mb-2" />
                <p className="text-3xl font-bold">
                  +{((metrics.productivity?.totalAdditions || 0) / 1000).toFixed(1)}k
                </p>
                <p className="text-sm text-muted-foreground">코드 추가</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <FolderGit2 className="mx-auto h-8 w-8 text-blue-500 mb-2" />
                <p className="text-3xl font-bold">{metrics.diversity?.repoCount || 0}</p>
                <p className="text-sm text-muted-foreground">기여 리포</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Calendar className="mx-auto h-8 w-8 text-orange-500 mb-2" />
                <p className="text-3xl font-bold">{metrics.workPattern?.activeDays || 0}</p>
                <p className="text-sm text-muted-foreground">활동일</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Strengths */}
        {summary?.topAchievements && summary.topAchievements.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <Star className="h-5 w-5" />
                주요 강점
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {summary.topAchievements.map((item: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Areas for Improvement */}
        {summary?.keyImprovements && summary.keyImprovements.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-600">
                <Target className="h-5 w-5" />
                개선 포인트
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {summary.keyImprovements.map((item: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Work Pattern Insights */}
        {workPattern && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                작업 패턴 분석
              </CardTitle>
            </CardHeader>
            <CardContent>
              {workPattern.workStyle && (
                <div className="mb-4">
                  <p className="font-medium text-sm text-muted-foreground mb-1">작업 스타일</p>
                  <p>{workPattern.workStyle}</p>
                </div>
              )}
              {workPattern.collaborationStyle && (
                <div className="mb-4">
                  <p className="font-medium text-sm text-muted-foreground mb-1">협업 스타일</p>
                  <p>{workPattern.collaborationStyle}</p>
                </div>
              )}
              {workPattern.productivityInsights && (
                <div>
                  <p className="font-medium text-sm text-muted-foreground mb-1">생산성 인사이트</p>
                  <p>{workPattern.productivityInsights}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Growth Points */}
        {growthPoints && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5" />
                성장 포인트
              </CardTitle>
            </CardHeader>
            <CardContent>
              {growthPoints.learningOpportunities && growthPoints.learningOpportunities.length > 0 && (
                <div className="mb-4">
                  <p className="font-medium text-sm text-muted-foreground mb-2">학습 기회</p>
                  <ul className="space-y-1">
                    {growthPoints.learningOpportunities.slice(0, 3).map((item: string, i: number) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-primary">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {growthPoints.careerSuggestions && growthPoints.careerSuggestions.length > 0 && (
                <div>
                  <p className="font-medium text-sm text-muted-foreground mb-2">커리어 제안</p>
                  <ul className="space-y-1">
                    {growthPoints.careerSuggestions.slice(0, 3).map((item: string, i: number) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-primary">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Action Items */}
      {summary?.actionItems && summary.actionItems.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>실행 항목</CardTitle>
            <CardDescription>다음 기간에 집중하면 좋을 항목들</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {summary.actionItems.map((item: string, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    {i + 1}
                  </span>
                  <span className="flex-1">{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sampled Work Units */}
      {data.sampledWorkUnits.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>분석된 주요 작업</CardTitle>
            <CardDescription>AI가 분석한 대표 WorkUnit 목록</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {data.sampledWorkUnits.slice(0, 5).map((wu, index) => (
                <AccordionItem key={wu.id} value={wu.id}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3 text-left">
                      <span className="text-sm text-muted-foreground">#{index + 1}</span>
                      <div>
                        <p className="font-medium">{wu.title || `${wu.repo.name} 작업`}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {wu.repo.name}
                          </Badge>
                          {wu.workType && (
                            <Badge variant="secondary" className="text-xs">
                              {wu.workType}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            Impact: {wu.impactScore.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pl-8 space-y-4">
                      {wu.summary && (
                        <p className="text-muted-foreground">{wu.summary}</p>
                      )}
                      
                      {wu.codeQuality && (
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="font-medium text-sm mb-2">코드 품질 분석</p>
                          {wu.codeQuality.codeQuality && (
                            <div className="grid grid-cols-4 gap-2 text-center text-sm">
                              <div>
                                <p className="font-bold">{wu.codeQuality.codeQuality.score || "N/A"}</p>
                                <p className="text-xs text-muted-foreground">종합</p>
                              </div>
                              <div>
                                <p className="font-bold">{wu.codeQuality.codeQuality.readability || "N/A"}</p>
                                <p className="text-xs text-muted-foreground">가독성</p>
                              </div>
                              <div>
                                <p className="font-bold">{wu.codeQuality.codeQuality.maintainability || "N/A"}</p>
                                <p className="text-xs text-muted-foreground">유지보수</p>
                              </div>
                              <div>
                                <p className="font-bold">{wu.codeQuality.codeQuality.bestPractices || "N/A"}</p>
                                <p className="text-xs text-muted-foreground">모범사례</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div>
                        <p className="font-medium text-sm mb-2">포함된 커밋</p>
                        <div className="space-y-2">
                          {wu.commits.map((commit) => (
                            <div key={commit.sha} className="text-sm flex items-center gap-2">
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                {commit.sha}
                              </code>
                              <span className="truncate flex-1">{commit.message}</span>
                              <span className="text-xs text-green-600">+{commit.additions}</span>
                              <span className="text-xs text-red-600">-{commit.deletions}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AnalysisResultSkeleton() {
  return (
    <div className="container py-8 px-4 max-w-5xl">
      <Skeleton className="h-8 w-48 mb-6" />

      <div className="flex items-center gap-4 mb-8">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div>
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-5 w-40 mt-1" />
        </div>
      </div>

      <Skeleton className="h-40 w-full mb-8" />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    </div>
  );
}

