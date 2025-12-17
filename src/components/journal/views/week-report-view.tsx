"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  WeeklyAnalysisData,
  WeeklyAnalysisResult,
  KeyCommitInfo,
  CommitReview,
  DayCommits
} from "@/types";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  Lightbulb,
  Code2,
  AlertTriangle,
  Award,
  GitCommit,
  Plus,
  Minus,
  Calendar
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";

interface WeekReportViewProps {
  runId: string;
  weekNumber: number;
  year: number;
  weeklyAnalysis?: WeeklyAnalysisData;
  commits: DayCommits[];
  onRefresh: () => void;
}

export function WeekReportView({
  runId,
  weekNumber,
  year,
  weeklyAnalysis,
  commits,
  onRefresh,
}: WeekReportViewProps) {
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    if (!weeklyAnalysis) return;

    setAnalyzing(true);

    try {
      const response = await fetch(`/api/analysis/${runId}/journal/analyze-week`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          weekNumber,
          startDate: weeklyAnalysis.startDate,
          endDate: weeklyAnalysis.endDate,
        }),
      });

      if (!response.ok) {
        throw new Error("분석 요청 실패");
      }

      await response.json();
      onRefresh();
    } catch (error) {
      console.error("Analysis error:", error);
    } finally {
      setAnalyzing(false);
    }
  };

  const result = (weeklyAnalysis as any)?.stage3Result;
  const stage1Result = (weeklyAnalysis as any)?.stage1Result as { keyCommits: KeyCommitInfo[] } | undefined;
  const stage2Result = (weeklyAnalysis as any)?.stage2Result as { commitReviews: CommitReview[] } | undefined;
  const isCompleted = weeklyAnalysis?.status === "DONE";

  const keyCommits = stage1Result?.keyCommits || [];
  const commitReviews = stage2Result?.commitReviews || [];

  const totalCommits = commits.reduce((sum, day) => sum + day.commits.length, 0);

  const getQualityBadge = (quality: string) => {
    switch (quality) {
      case "high":
        return <Badge className="bg-green-600">High</Badge>;
      case "medium":
        return <Badge variant="secondary">Medium</Badge>;
      case "low":
        return <Badge variant="outline">Low</Badge>;
      default:
        return null;
    }
  };

  const getComplexityBadge = (complexity: string) => {
    switch (complexity) {
      case "high":
        return <Badge variant="destructive">복잡함</Badge>;
      case "medium":
        return <Badge variant="secondary">보통</Badge>;
      case "low":
        return <Badge variant="outline">단순함</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">{weekNumber}주차 리포트</h1>
          </div>
          {weeklyAnalysis && (
            <p className="text-muted-foreground">
              {format(new Date(weeklyAnalysis.startDate), "yyyy년 M월 d일", { locale: ko })} ~{" "}
              {format(new Date(weeklyAnalysis.endDate), "M월 d일", { locale: ko })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isCompleted && (
            <Badge variant="secondary" className="text-base px-3 py-1">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              분석 완료
            </Badge>
          )}

          <Button
            onClick={handleAnalyze}
            disabled={analyzing || !weeklyAnalysis}
            size="lg"
          >
            {analyzing ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                분석 중...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                {isCompleted ? "재분석" : "AI 분석"}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="report" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="report">리포트</TabsTrigger>
          <TabsTrigger value="review">코드 리뷰 ({keyCommits.length})</TabsTrigger>
          <TabsTrigger value="timeline">타임라인 ({totalCommits})</TabsTrigger>
        </TabsList>

        {/* Report Tab */}
        <TabsContent value="report" className="space-y-6 mt-6">
          {result ? (
            <>
              {/* Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-primary" />
                    주간 요약
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base leading-relaxed">{result.summary}</p>
                </CardContent>
              </Card>

              {/* Metrics */}
              {result.metrics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-primary">
                        {result.metrics.totalCommits}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">총 커밋</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-primary">
                        {result.metrics.keyCommitsAnalyzed}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">주요 커밋</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-primary">
                        {result.metrics.reposWorked}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">작업 리포</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-primary">
                        {result.metrics.linesChanged.toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">변경 라인</div>
                    </CardContent>
                  </Card>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-6">
                {/* Key Activities */}
                {result.keyActivities.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        주요 활동
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {result.keyActivities.map((activity: string, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-muted-foreground mt-1">•</span>
                            <span className="text-sm leading-relaxed">{activity}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Technical Highlights */}
                {result.technicalHighlights.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Code2 className="h-5 w-5 text-blue-600" />
                        기술 하이라이트
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {result.technicalHighlights.map((highlight: string, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <Code2 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                            <span className="text-sm leading-relaxed">{highlight}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Work Pattern */}
              {result.workPattern && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <TrendingUp className="h-5 w-5" />
                      작업 패턴
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed">{result.workPattern}</p>
                  </CardContent>
                </Card>
              )}

              {/* Insights */}
              {result.insights.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Lightbulb className="h-5 w-5 text-amber-600" />
                      인사이트
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {result.insights.map((insight: string, i: number) => (
                        <li key={i} className="flex items-start gap-2">
                          <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <span className="text-sm leading-relaxed">{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  AI 분석 버튼을 클릭하여 주간 리포트를 생성하세요.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Code Review Tab */}
        <TabsContent value="review" className="mt-6">
          {commitReviews.length > 0 ? (
            <Accordion type="single" collapsible className="space-y-4">
              {commitReviews.map((review, index) => {
                const keyCommit = keyCommits.find(kc => kc.sha === review.sha);

                return (
                  <AccordionItem
                    key={review.sha}
                    value={review.sha}
                    className="border rounded-lg px-4"
                  >
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-start gap-3 text-left flex-1">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-xs">
                              {review.repoFullName?.split('/')[1] || 'unknown'}
                            </Badge>
                            {getQualityBadge(review.technicalQuality || '')}
                            {getComplexityBadge(review.complexity || '')}
                          </div>
                          <p className="text-sm font-medium line-clamp-2">
                            {review.message.split("\n")[0]}
                          </p>
                          {keyCommit && (
                            <p className="text-xs text-muted-foreground mt-1">
                              선정 이유: {keyCommit.reason}
                            </p>
                          )}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pt-4">
                        {/* Summary */}
                        <div>
                          <h4 className="text-sm font-medium mb-2">리뷰 요약</h4>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {review.summary}
                          </p>
                        </div>

                        <Separator />

                        {/* Impact */}
                        {(review as any).impact?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                              <TrendingUp className="h-4 w-4" />
                              임팩트
                            </h4>
                            <ul className="space-y-1">
                              {(review as any).impact.map((item: string, i: number) => (
                                <li key={i} className="text-sm text-muted-foreground">
                                  • {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Risks */}
                        {(review as any).risks?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                              리스크
                            </h4>
                            <ul className="space-y-1">
                              {(review as any).risks.map((risk: string, i: number) => (
                                <li key={i} className="text-sm text-muted-foreground">
                                  • {risk}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Learnings */}
                        {(review as any).learnings?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                              <Lightbulb className="h-4 w-4 text-blue-600" />
                              학습 포인트
                            </h4>
                            <ul className="space-y-1">
                              {(review as any).learnings.map((learning: string, i: number) => (
                                <li key={i} className="text-sm text-muted-foreground">
                                  • {learning}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Analyzed Files */}
                        {(review as any).filesAnalyzed?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">분석된 파일</h4>
                            <div className="space-y-2">
                              {(review as any).filesAnalyzed.map((file: any, i: number) => (
                                <div
                                  key={i}
                                  className="text-xs bg-muted/30 rounded p-2"
                                >
                                  <div className="font-mono mb-1">{file.path}</div>
                                  <div className="text-muted-foreground">
                                    {file.changes} 변경 · {file.insight}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Commit Details */}
                        <div className="text-xs text-muted-foreground pt-2 border-t">
                          <span className="font-mono">{review.sha.substring(0, 7)}</span>
                          {keyCommit && (
                            <>
                              {" · "}
                              <span className="text-green-600">+{keyCommit.additions}</span>
                              {" "}
                              <span className="text-red-600">-{keyCommit.deletions}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <Code2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {isCompleted
                    ? "코드 리뷰 데이터가 없습니다."
                    : "AI 분석을 실행하면 주요 커밋의 코드 리뷰를 볼 수 있습니다."
                  }
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="mt-6">
          {commits.length > 0 ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>커밋 타임라인</CardTitle>
                  <Badge variant="outline">{totalCommits}개</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-6">
                    {commits.map((day) => (
                      <div key={day.date}>
                        {/* 날짜 헤더 */}
                        <div className="mb-3 flex items-center gap-2">
                          <h4 className="text-sm font-medium">
                            {format(parseISO(day.date), "M월 d일 (E)", { locale: ko })}
                          </h4>
                          <Badge variant="secondary" className="text-xs">
                            {day.commits.length}
                          </Badge>
                        </div>

                        {/* 커밋 목록 */}
                        <div className="space-y-3">
                          {day.commits.map((commit, idx) => (
                            <div
                              key={`${commit.sha}-${idx}`}
                              className="rounded-lg border bg-muted/30 p-3"
                            >
                              <div className="flex items-start gap-3">
                                <GitCommit className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  {/* 리포지토리 */}
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline" className="text-xs">
                                      {commit.repoFullName?.split('/')[1] || 'unknown'}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {format(new Date(commit.committedAt), "HH:mm")}
                                    </span>
                                  </div>

                                  {/* 커밋 메시지 */}
                                  <p className="text-sm leading-relaxed mb-2">
                                    {commit.message.split("\n")[0]}
                                  </p>

                                  {/* 변경 통계 */}
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <span className="font-mono">{commit.sha.substring(0, 7)}</span>
                                    {(commit.additions > 0 || commit.deletions > 0) && (
                                      <>
                                        <span className="flex items-center gap-1 text-green-600">
                                          <Plus className="h-3 w-3" />
                                          {commit.additions}
                                        </span>
                                        <span className="flex items-center gap-1 text-red-600">
                                          <Minus className="h-3 w-3" />
                                          {commit.deletions}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <GitCommit className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  이 주차에는 커밋이 없습니다.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

