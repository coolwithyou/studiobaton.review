"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from "@/components/ui/resizable";
import { JournalSidebar } from "@/components/journal/journal-sidebar";
import { MonthReportView } from "@/components/journal/views/month-report-view";
import { WeekReportView } from "@/components/journal/views/week-report-view";
import { MonthlyAnalysisData, WeeklyAnalysisData, DayCommits } from "@/types";
import { ArrowLeft, BookOpen, Calendar } from "lucide-react";
import { generateYearWeeks } from "@/lib/journal/utils";

interface JournalPageClientProps {
  runId: string;
  orgLogin: string;
  year: number;
  userLogin: string;
  userName: string | null;
  userAvatarUrl: string | null;
  initialDayCommits: DayCommits[];
  totalCommits: number;
}

export default function JournalPageClient({
  runId,
  orgLogin,
  year,
  userLogin,
  userName,
  userAvatarUrl,
  initialDayCommits,
  totalCommits,
}: JournalPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [monthlyAnalyses, setMonthlyAnalyses] = useState<MonthlyAnalysisData[]>([]);
  const [weeklyAnalyses, setWeeklyAnalyses] = useState<WeeklyAnalysisData[]>([]);
  const [loading, setLoading] = useState(true);

  // URL에서 선택된 view 파싱
  const viewType = (searchParams.get("view") as "month" | "week") || "month";
  const viewId = parseInt(searchParams.get("id") || String(new Date().getMonth() + 1));

  const selectedView = { type: viewType, id: viewId };

  const loadAnalyses = async () => {
    try {
      const response = await fetch(`/api/analysis/${runId}/journal/analyses`);
      if (response.ok) {
        const data = await response.json();
        setMonthlyAnalyses(data.monthlyAnalyses || []);

        // 기존 분석 결과와 전체 주차 정보 병합
        const yearWeeks = generateYearWeeks(year);
        const existingWeekMap = new Map(
          (data.weeklyAnalyses || []).map((w: WeeklyAnalysisData) => [w.weekNumber, w])
        );

        const allWeeks = yearWeeks.map((w) => {
          const existing = existingWeekMap.get(w.weekNumber);
          return existing || {
            id: `temp-${w.weekNumber}`,
            weekNumber: w.weekNumber,
            startDate: w.startDate.toISOString(),
            endDate: w.endDate.toISOString(),
            status: "PENDING" as const,
          };
        });

        setWeeklyAnalyses(allWeeks as WeeklyAnalysisData[]);
      }
    } catch (error) {
      console.error("Failed to load analyses:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalyses();
  }, [runId]);

  // 월별로 데이터 그룹핑
  const monthsData = useMemo(() => {
    const grouped = new Map<number, WeeklyAnalysisData[]>();

    weeklyAnalyses.forEach((week) => {
      // 주차의 중간 날짜를 기준으로 월 판단 (더 정확함)
      const weekStart = new Date(week.startDate);
      const weekEnd = new Date(week.endDate);
      const midDate = new Date((weekStart.getTime() + weekEnd.getTime()) / 2);
      const month = midDate.getMonth() + 1;

      if (!grouped.has(month)) {
        grouped.set(month, []);
      }
      grouped.get(month)!.push(week);
    });

    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1; // 1월부터 순서대로
      return {
        month,
        weeklyAnalyses: (grouped.get(month) || []).sort((a, b) => a.weekNumber - b.weekNumber),
        monthlyAnalysis: monthlyAnalyses.find((m) => m.month === month),
      };
    });
  }, [weeklyAnalyses, monthlyAnalyses]);

  const handleSelectView = (view: { type: "month" | "week"; id: number }) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view.type);
    params.set("id", String(view.id));
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // 선택된 주차의 커밋 필터링
  const selectedWeekCommits = useMemo(() => {
    if (selectedView.type !== "week") return [];

    const week = weeklyAnalyses.find(w => w.weekNumber === selectedView.id);
    if (!week) return [];

    const weekStart = new Date(week.startDate);
    const weekEnd = new Date(week.endDate);
    weekEnd.setHours(23, 59, 59, 999);

    return initialDayCommits
      .map(day => {
        const dayDate = new Date(day.date);
        if (dayDate >= weekStart && dayDate <= weekEnd) {
          return day;
        }
        return null;
      })
      .filter((day): day is DayCommits => day !== null);
  }, [selectedView, weeklyAnalyses, initialDayCommits]);

  const selectedMonthData = monthsData.find(m => m.month === selectedView.id);
  const selectedWeekData = weeklyAnalyses.find(w => w.weekNumber === selectedView.id);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b bg-background">
        <div className="container max-w-full px-6 py-4">
          <Button variant="ghost" size="sm" className="mb-3" asChild>
            <Link href={`/organizations/${orgLogin}/analysis/${runId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              분석 결과로 돌아가기
            </Link>
          </Button>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12">
                <AvatarImage src={userAvatarUrl || undefined} />
                <AvatarFallback className="text-lg">
                  {(userName || userLogin).charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <BookOpen className="h-6 w-6 text-primary" />
                  업무 일지
                </h1>
                <p className="text-sm text-muted-foreground">
                  {userName || userLogin} · {year}년
                </p>
              </div>
            </div>
            <div className="text-right">
              <Badge variant="outline" className="text-base px-3 py-1">
                <Calendar className="mr-2 h-4 w-4" />
                {totalCommits}개 커밋
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">
                {initialDayCommits.length}일 활동
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Resizable Layout */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Sidebar */}
        <ResizablePanel defaultSize={22} minSize={15} maxSize={35}>
          <JournalSidebar
            year={year}
            monthsData={monthsData}
            selectedView={selectedView}
            onSelectView={handleSelectView}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Main Content */}
        <ResizablePanel defaultSize={78}>
          <div className="h-full overflow-auto">
            {selectedView.type === "month" && selectedMonthData && (
              <MonthReportView
                runId={runId}
                month={selectedView.id}
                year={year}
                monthlyAnalysis={selectedMonthData.monthlyAnalysis}
                weeklyAnalyses={selectedMonthData.weeklyAnalyses}
                onRefresh={loadAnalyses}
              />
            )}

            {selectedView.type === "week" && (
              <WeekReportView
                runId={runId}
                weekNumber={selectedView.id}
                year={year}
                weeklyAnalysis={selectedWeekData}
                commits={selectedWeekCommits}
                onRefresh={loadAnalyses}
              />
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
