"use client";

import { useState, useMemo } from "react";
import { MonthlyAnalysisData, WeeklyAnalysisData, DayCommits } from "@/types";
import { MonthAnalysisCard } from "./month-analysis-card";
import { WeekListCard } from "./week-list-card";
import { CommitsCard } from "./commits-card";

interface MonthRowProps {
  runId: string;
  year: number;
  month: number; // 1-12
  monthlyAnalysis?: MonthlyAnalysisData;
  weeklyAnalyses: WeeklyAnalysisData[]; // 해당 월의 주차들
  allDayCommits: DayCommits[]; // 전체 커밋
  onRefresh: () => void;
}

export function MonthRow({
  runId,
  year,
  month,
  monthlyAnalysis,
  weeklyAnalyses,
  allDayCommits,
  onRefresh,
}: MonthRowProps) {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  // 선택된 주차의 커밋 필터링
  const filteredCommits = useMemo(() => {
    if (!selectedWeek) return [];

    const weekData = weeklyAnalyses.find((w) => w.weekNumber === selectedWeek);
    if (!weekData) return [];

    const weekStart = new Date(weekData.startDate);
    const weekEnd = new Date(weekData.endDate);

    console.log(`[month-row] Filtering commits for week ${selectedWeek}`);
    console.log(`[month-row] Week range: ${weekStart.toISOString()} ~ ${weekEnd.toISOString()}`);
    console.log(`[month-row] Total dayCommits: ${allDayCommits.length}`);

    const filtered = allDayCommits.filter((day) => {
      const dayDate = new Date(day.date);
      return dayDate >= weekStart && dayDate <= weekEnd;
    });

    console.log(`[month-row] Filtered to ${filtered.length} days with ${filtered.reduce((sum, d) => sum + d.commits.length, 0)} commits`);

    return filtered;
  }, [selectedWeek, weeklyAnalyses, allDayCommits]);

  return (
    <div className="mb-8">
      {/* 데스크탑: 3열 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 1열: 월간 분석 (3칸) */}
        <div className="lg:col-span-3">
          <MonthAnalysisCard
            runId={runId}
            month={month}
            year={year}
            analysis={monthlyAnalysis}
            onRefresh={onRefresh}
          />
        </div>

        {/* 2열: 주차 목록 (4칸) */}
        <div className="lg:col-span-4">
          <WeekListCard
            runId={runId}
            month={month}
            weeklyAnalyses={weeklyAnalyses}
            selectedWeek={selectedWeek}
            onSelectWeek={setSelectedWeek}
            onRefresh={onRefresh}
          />
        </div>

        {/* 3열: 선택된 주의 커밋 (5칸) */}
        <div className="lg:col-span-5">
          <CommitsCard
            year={year}
            month={month}
            selectedWeek={selectedWeek}
            commits={filteredCommits}
          />
        </div>
      </div>
    </div>
  );
}
