"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WeeklyAnalysisData, WeeklyAnalysisResult } from "@/types";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Loader2, Sparkles, CheckCircle2 } from "lucide-react";

interface WeekListCardProps {
  runId: string;
  month: number;
  weeklyAnalyses: WeeklyAnalysisData[];
  selectedWeek: number | null;
  onSelectWeek: (week: number) => void;
  onRefresh: () => void;
}

export function WeekListCard({
  runId,
  month,
  weeklyAnalyses,
  selectedWeek,
  onSelectWeek,
  onRefresh,
}: WeekListCardProps) {
  const [analyzingWeek, setAnalyzingWeek] = useState<number | null>(null);

  const handleAnalyzeWeek = async (
    e: React.MouseEvent,
    week: WeeklyAnalysisData
  ) => {
    e.stopPropagation();
    setAnalyzingWeek(week.weekNumber);

    try {
      const response = await fetch(`/api/analysis/${runId}/journal/analyze-week`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          weekNumber: week.weekNumber,
          startDate: week.startDate,
          endDate: week.endDate,
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
      setAnalyzingWeek(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>주차별 활동</CardTitle>
      </CardHeader>
      <CardContent>
        {weeklyAnalyses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            이 달에는 활동이 없습니다.
          </p>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {weeklyAnalyses.map((week) => {
                const isSelected = selectedWeek === week.weekNumber;
                const isAnalyzing = analyzingWeek === week.weekNumber;
                const result = week.stage3Result as WeeklyAnalysisResult | undefined;

                return (
                  <div
                    key={week.id}
                    onClick={() => onSelectWeek(week.weekNumber)}
                    className={`
                      rounded-lg border p-3 cursor-pointer transition-colors
                      hover:bg-muted/50
                      ${isSelected ? "border-primary bg-muted/30" : "border-border"}
                    `}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">
                            {week.weekNumber}주차
                          </span>
                          {week.status === "COMPLETED" && (
                            <Badge variant="outline" className="text-xs">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              완료
                            </Badge>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground mb-1">
                          {format(new Date(week.startDate), "M/d", { locale: ko })} ~{" "}
                          {format(new Date(week.endDate), "M/d", { locale: ko })}
                        </p>

                        {result && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                            {result.summary}
                          </p>
                        )}

                        {isAnalyzing && (
                          <div className="mt-2 flex items-center gap-2 text-xs text-primary">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>분석 중...</span>
                          </div>
                        )}
                      </div>

                      {week.status !== "COMPLETED" && !isAnalyzing && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => handleAnalyzeWeek(e, week)}
                          className="ml-2"
                        >
                          <Sparkles className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

