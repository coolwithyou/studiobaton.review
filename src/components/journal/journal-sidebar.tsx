"use client";

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Calendar, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { WeeklyAnalysisData, MonthlyAnalysisData } from "@/types";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface JournalSidebarProps {
  year: number;
  monthsData: Array<{
    month: number;
    weeklyAnalyses: WeeklyAnalysisData[];
    monthlyAnalysis?: MonthlyAnalysisData;
  }>;
  selectedView: { type: "month" | "week"; id: number } | null;
  onSelectView: (view: { type: "month" | "week"; id: number }) => void;
}

const MONTH_NAMES = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월"
];

export function JournalSidebar({
  year,
  monthsData,
  selectedView,
  onSelectView,
}: JournalSidebarProps) {
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(
    new Set([new Date().getMonth() + 1]) // 현재 월은 기본 확장
  );

  const toggleMonth = (month: number) => {
    const newExpanded = new Set(expandedMonths);
    if (newExpanded.has(month)) {
      newExpanded.delete(month);
    } else {
      newExpanded.add(month);
    }
    setExpandedMonths(newExpanded);
  };

  const getMonthStatusBadge = (monthData: typeof monthsData[0]) => {
    if (monthData.monthlyAnalysis?.status === "COMPLETED") {
      return <Badge variant="secondary" className="ml-2 text-xs">완료</Badge>;
    }

    const completedWeeks = monthData.weeklyAnalyses.filter(
      w => w.status === "COMPLETED"
    ).length;
    const totalWeeks = monthData.weeklyAnalyses.length;

    if (completedWeeks > 0 && completedWeeks < totalWeeks) {
      return (
        <Badge variant="outline" className="ml-2 text-xs">
          {completedWeeks}/{totalWeeks}
        </Badge>
      );
    }

    return null;
  };

  const getWeekStatusIcon = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case "STAGE1":
      case "STAGE2":
      case "STAGE3":
        return <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />;
      case "FAILED":
        return <Circle className="h-3 w-3 text-red-500" />;
      default:
        return <Circle className="h-3 w-3 text-muted-foreground/30" />;
    }
  };

  return (
    <div className="h-full flex flex-col border-r bg-muted/10">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">{year}년</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          월/주차별 업무 일지
        </p>
      </div>

      {/* Navigation Tree */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {monthsData.map((monthData) => {
            const isExpanded = expandedMonths.has(monthData.month);
            const isMonthSelected =
              selectedView?.type === "month" && selectedView.id === monthData.month;
            const hasWeeks = monthData.weeklyAnalyses.length > 0;

            return (
              <div key={monthData.month} className="mb-1">
                {/* Month Node */}
                <div
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer
                    hover:bg-muted transition-colors
                    ${isMonthSelected ? "bg-muted font-medium" : ""}
                  `}
                  onClick={() => {
                    onSelectView({ type: "month", id: monthData.month });
                    if (!isExpanded && hasWeeks) {
                      toggleMonth(monthData.month);
                    }
                  }}
                >
                  {hasWeeks && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMonth(monthData.month);
                      }}
                      className="hover:bg-muted-foreground/10 rounded p-0.5"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  {!hasWeeks && <div className="w-5" />}

                  <span className="flex-1 text-sm">
                    {MONTH_NAMES[monthData.month - 1]}
                  </span>

                  {getMonthStatusBadge(monthData)}
                </div>

                {/* Week Nodes */}
                {isExpanded && hasWeeks && (
                  <div className="ml-4 mt-1 space-y-1">
                    {monthData.weeklyAnalyses.map((week) => {
                      const isWeekSelected =
                        selectedView?.type === "week" && selectedView.id === week.weekNumber;

                      return (
                        <div
                          key={week.id}
                          className={`
                            flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer
                            hover:bg-muted transition-colors text-sm
                            ${isWeekSelected ? "bg-primary/10 font-medium border-l-2 border-primary" : ""}
                          `}
                          onClick={() => onSelectView({ type: "week", id: week.weekNumber })}
                        >
                          {getWeekStatusIcon(week.status || "PENDING")}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-medium">{week.weekNumber}주차</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(week.startDate), "M/d", { locale: ko })} ~{" "}
                              {format(new Date(week.endDate), "M/d", { locale: ko })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
