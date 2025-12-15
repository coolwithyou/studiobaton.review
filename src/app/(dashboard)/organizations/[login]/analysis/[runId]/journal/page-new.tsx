"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MonthRow } from "@/components/journal/month-row";
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
  const [monthlyAnalyses, setMonthlyAnalyses] = useState<MonthlyAnalysisData[]>([]);
  const [weeklyAnalyses, setWeeklyAnalyses] = useState<WeeklyAnalysisData[]>([]);
  const [loading, setLoading] = useState(true);

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
      const month = 12 - i; // 12월부터 역순
      return {
        month,
        weeklyAnalyses: (grouped.get(month) || []).sort((a, b) => a.weekNumber - b.weekNumber),
        monthlyAnalysis: monthlyAnalyses.find((m) => m.month === month),
      };
    });
  }, [weeklyAnalyses, monthlyAnalyses]);

  return (
    <div className="container max-w-7xl py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href={`/organizations/${orgLogin}/analysis/${runId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            분석 결과로 돌아가기
          </Link>
        </Button>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={userAvatarUrl || undefined} />
              <AvatarFallback className="text-xl">
                {(userName || userLogin).charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <BookOpen className="h-8 w-8 text-primary" />
                업무 일지
              </h1>
              <p className="text-muted-foreground">
                {userName || userLogin} · {year}년
              </p>
            </div>
          </div>
          <div className="text-right">
            <Badge variant="outline" className="text-lg px-3 py-1">
              <Calendar className="mr-2 h-4 w-4" />
              {totalCommits}개 커밋
            </Badge>
            <p className="text-sm text-muted-foreground mt-2">
              {initialDayCommits.length}일 활동
            </p>
          </div>
        </div>
      </div>

      {/* 월별 행 */}
      <div className="space-y-8">
        {monthsData.map(({ month, weeklyAnalyses, monthlyAnalysis }) => (
          <MonthRow
            key={month}
            runId={runId}
            year={year}
            month={month}
            monthlyAnalysis={monthlyAnalysis}
            weeklyAnalyses={weeklyAnalyses}
            allDayCommits={initialDayCommits}
            onRefresh={loadAnalyses}
          />
        ))}
      </div>
    </div>
  );
}
