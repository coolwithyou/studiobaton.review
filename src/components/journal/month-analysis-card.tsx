"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MonthlyAnalysisData, MonthlyAnalysisResult } from "@/types";
import { Loader2, Sparkles, CheckCircle2 } from "lucide-react";

interface MonthAnalysisCardProps {
  runId: string;
  month: number;
  year: number;
  analysis?: MonthlyAnalysisData;
  onRefresh: () => void;
}

const MONTH_NAMES = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

export function MonthAnalysisCard({
  runId,
  month,
  year,
  analysis,
  onRefresh,
}: MonthAnalysisCardProps) {
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

  const result = analysis?.stage3Result as MonthlyAnalysisResult | undefined;
  const isCompleted = analysis?.status === "COMPLETED";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{MONTH_NAMES[month - 1]}</CardTitle>
          {isCompleted && (
            <Badge variant="outline" className="text-green-600">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              완료
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* AI 분석 버튼 */}
        {!isCompleted && (
          <div className="mb-4">
            <Button
              onClick={handleAnalyze}
              disabled={analyzing}
              size="sm"
              variant="outline"
            >
              {analyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  분석 중...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI 분석
                </>
              )}
            </Button>
            {progress && (
              <p className="mt-2 text-xs text-muted-foreground">
                {progress}
              </p>
            )}
          </div>
        )}

        {/* 분석 결과 */}
        {result && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium mb-2">종합 요약</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {result.summary}
              </p>
            </div>

            {result.achievements.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">주요 성과</h3>
                <ul className="space-y-1">
                  {result.achievements.slice(0, 3).map((achievement, i) => (
                    <li
                      key={i}
                      className="text-sm text-muted-foreground leading-relaxed"
                    >
                      • {achievement}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.metrics && (
              <div className="pt-3 border-t text-xs text-muted-foreground">
                총 {result.metrics.totalCommits}개 커밋 · {result.metrics.weeksActive}주 활동
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

