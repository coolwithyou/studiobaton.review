"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PeriodAnalysis } from "@/types";
import { Sparkles, Loader2, Calendar, TrendingUp } from "lucide-react";
import { startOfYear, endOfYear, startOfWeek, endOfWeek, addWeeks, startOfMonth, endOfMonth, addMonths, format } from "date-fns";
import { ko } from "date-fns/locale";

interface PeriodAnalyzerProps {
  runId: string;
  year: number;
}

export function PeriodAnalyzer({ runId, year }: PeriodAnalyzerProps) {
  const [periodType, setPeriodType] = useState<"week" | "month">("month");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [analysis, setAnalysis] = useState<PeriodAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 주간 목록 생성 (1-52주)
  const weeks = Array.from({ length: 52 }, (_, i) => {
    const yearStart = startOfYear(new Date(year, 0, 1));
    const weekStart = startOfWeek(addWeeks(yearStart, i), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

    // 해당 년도에 포함되는 주만
    if (weekStart.getFullYear() === year || weekEnd.getFullYear() === year) {
      return {
        value: `${i + 1}`,
        label: `${i + 1}주차 (${format(weekStart, "M/d")} ~ ${format(weekEnd, "M/d")})`,
        startDate: format(weekStart, "yyyy-MM-dd"),
        endDate: format(weekEnd, "yyyy-MM-dd"),
      };
    }
    return null;
  }).filter(Boolean) as Array<{ value: string; label: string; startDate: string; endDate: string }>;

  // 월간 목록 생성 (1-12월)
  const months = Array.from({ length: 12 }, (_, i) => {
    const monthStart = startOfMonth(new Date(year, i, 1));
    const monthEnd = endOfMonth(monthStart);

    return {
      value: `${i + 1}`,
      label: `${i + 1}월`,
      startDate: format(monthStart, "yyyy-MM-dd"),
      endDate: format(monthEnd, "yyyy-MM-dd"),
    };
  });

  const handleAnalyze = async () => {
    if (!selectedPeriod) return;

    setLoading(true);
    setError(null);

    try {
      const periods = periodType === "week" ? weeks : months;
      const period = periods.find((p) => p.value === selectedPeriod);

      if (!period) {
        throw new Error("Invalid period");
      }

      const response = await fetch(`/api/analysis/${runId}/journal-analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: period.startDate,
          endDate: period.endDate,
          periodType,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to analyze period");
      }

      const data = await response.json();
      setAnalysis(data);
    } catch (err) {
      console.error("Analysis error:", err);
      setError("분석 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          기간별 AI 분석
        </CardTitle>
        <CardDescription>
          주간 또는 월간 단위로 커밋을 분석하여 업무 패턴과 주요 활동을 파악합니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={periodType} onValueChange={(v) => setPeriodType(v as "week" | "month")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="week">주간</TabsTrigger>
            <TabsTrigger value="month">월간</TabsTrigger>
          </TabsList>

          <TabsContent value="week" className="space-y-4">
            <div className="flex gap-2">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="주차를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {weeks.map((week) => (
                    <SelectItem key={week.value} value={week.value}>
                      {week.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAnalyze} disabled={!selectedPeriod || loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    분석 중...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    분석
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="month" className="space-y-4">
            <div className="flex gap-2">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="월을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAnalyze} disabled={!selectedPeriod || loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    분석 중...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    분석
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {analysis && (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="font-semibold">분석 결과</h4>
                <Badge variant="outline">
                  {analysis.commitCount}개 커밋
                </Badge>
              </div>

              <div className="space-y-4">
                {/* 요약 */}
                <div>
                  <p className="text-sm leading-relaxed">{analysis.summary}</p>
                </div>

                {/* 주요 활동 */}
                {analysis.keyActivities.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium">주요 활동</p>
                    <ul className="space-y-1">
                      {analysis.keyActivities.map((activity, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          {activity}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 업무 패턴 */}
                <div>
                  <p className="mb-2 text-sm font-medium">업무 패턴</p>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="text-sm">{analysis.workPattern}</span>
                  </div>
                </div>

                {/* 작업 리포지터리 */}
                {analysis.reposCovered.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium">
                      작업 리포지터리 ({analysis.reposCovered.length}개)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {analysis.reposCovered.map((repo) => (
                        <Badge key={repo} variant="secondary">
                          {repo.split("/")[1] || repo}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
