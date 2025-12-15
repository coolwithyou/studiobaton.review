"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MonthlyAnalysisData, MonthlyAnalysisResult, WeeklyAnalysisData } from "@/types";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  Target,
  Lightbulb,
  BarChart3,
  Calendar
} from "lucide-react";

interface MonthReportViewProps {
  runId: string;
  month: number;
  year: number;
  monthlyAnalysis?: MonthlyAnalysisData;
  weeklyAnalyses: WeeklyAnalysisData[];
  onRefresh: () => void;
}

const MONTH_NAMES = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

export function MonthReportView({
  runId,
  month,
  year,
  monthlyAnalysis,
  weeklyAnalyses,
  onRefresh,
}: MonthReportViewProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState("");

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setProgress("분석 시작 중...");

    try {
      const response = await fetch(`/api/analysis/${runId}/journal/analyze-month`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ month }),
      });

      if (!response.ok || !response.body) {
        throw new Error("분석 요청 실패");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));

            if (data.type === "progress") {
              if (data.data.currentWeek) {
                setProgress(
                  `${data.data.currentWeek}/${data.data.totalWeeks} 주차 분석 중`
                );
              } else {
                setProgress(data.data.message || "진행 중...");
              }
            } else if (data.type === "weekly_complete") {
              setProgress(`${data.data.weekNumber}주차 완료`);
            } else if (data.type === "monthly_complete") {
              setProgress("완료");
              setTimeout(() => {
                setAnalyzing(false);
                setProgress("");
                onRefresh();
              }, 1000);
            } else if (data.type === "error") {
              throw new Error(data.data.message);
            }
          }
        }
      }
    } catch (error) {
      console.error("Analysis error:", error);
      setProgress(`에러: ${error instanceof Error ? error.message : "분석 실패"}`);
      setTimeout(() => {
        setAnalyzing(false);
        setProgress("");
      }, 3000);
    }
  };

  const result = monthlyAnalysis?.stage3Result as MonthlyAnalysisResult | undefined;
  const isCompleted = monthlyAnalysis?.status === "COMPLETED";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">{MONTH_NAMES[month - 1]} 월간 리포트</h1>
          </div>
          <p className="text-muted-foreground">
            {year}년 {month}월 업무 종합 분석
          </p>
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
            disabled={analyzing}
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

      {progress && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <span className="text-sm font-medium text-blue-900">{progress}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      {result ? (
        <>
          {/* Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                종합 요약
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base leading-relaxed">{result.summary}</p>
            </CardContent>
          </Card>

          {/* Metrics Grid */}
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
                    {result.metrics.weeksActive}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">활동 주차</div>
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
                    {result.metrics.averageCommitsPerWeek?.toFixed(1) || 0}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">주당 평균</div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* Achievements */}
            {result.achievements.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Target className="h-5 w-5 text-green-600" />
                    주요 성과
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {result.achievements.map((achievement, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm leading-relaxed">{achievement}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Technical Growth */}
            {result.technicalGrowth.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-5 w-5 text-blue-600" />
                    기술적 성장
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {result.technicalGrowth.map((growth, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <TrendingUp className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm leading-relaxed">{growth}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Work Pattern */}
          {result.overallPattern && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-5 w-5" />
                  작업 패턴
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">{result.overallPattern}</p>
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Lightbulb className="h-5 w-5 text-amber-600" />
                  다음 달 권장 사항
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {result.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm leading-relaxed">{rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Weekly Breakdown */}
          {result.weeklyBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">주차별 활동</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {result.weeklyBreakdown.map((weekData, i) => (
                    <div key={i}>
                      {i > 0 && <Separator className="my-4" />}
                      <div>
                        <div className="font-medium text-sm mb-1">
                          {weekData.week}주차
                        </div>
                        <div className="text-sm text-muted-foreground mb-1">
                          {weekData.summary}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          핵심: {weekData.keyActivity}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="pt-6 text-center">
            <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {isCompleted
                ? "분석 데이터를 불러오는 중입니다..."
                : "AI 분석 버튼을 클릭하여 월간 리포트를 생성하세요."
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
