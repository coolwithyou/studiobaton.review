"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { TimeHeatmapData } from "@/types";
import { cn } from "@/lib/utils";

interface TimeHeatmapChartProps {
  data: TimeHeatmapData[];
  title?: string;
  description?: string;
}

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getIntensityClass(count: number, maxCount: number): string {
  if (count === 0) return "bg-muted";
  const ratio = count / maxCount;
  if (ratio > 0.75) return "bg-primary";
  if (ratio > 0.5) return "bg-primary/75";
  if (ratio > 0.25) return "bg-primary/50";
  return "bg-primary/25";
}

export function TimeHeatmapChart({
  data,
  title = "작업 시간 분포",
  description = "요일별 / 시간대별 커밋 빈도",
}: TimeHeatmapChartProps) {
  const maxCount = Math.max(...data.map(d => d.count), 1);

  // 데이터를 2D 배열로 변환
  const grid: number[][] = Array.from({ length: 7 }, () => 
    Array.from({ length: 24 }, () => 0)
  );

  data.forEach(d => {
    grid[d.dayOfWeek][d.hour] = d.count;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* 시간 레이블 */}
            <div className="flex mb-1 pl-8">
              {HOURS.map(hour => (
                <div 
                  key={hour} 
                  className="flex-1 text-center text-xs text-muted-foreground"
                >
                  {hour % 3 === 0 ? `${hour}시` : ''}
                </div>
              ))}
            </div>

            {/* 히트맵 그리드 */}
            <TooltipProvider>
              {DAY_NAMES.map((day, dayIndex) => (
                <div key={day} className="flex items-center mb-1">
                  <div className="w-8 text-xs text-muted-foreground pr-2">
                    {day}
                  </div>
                  {HOURS.map(hour => {
                    const count = grid[dayIndex][hour];
                    return (
                      <Tooltip key={`${dayIndex}-${hour}`}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "flex-1 h-5 rounded-sm mx-0.5 cursor-pointer transition-colors hover:ring-2 hover:ring-primary/50",
                              getIntensityClass(count, maxCount)
                            )}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{day}요일 {hour}시: {count}개 커밋</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              ))}
            </TooltipProvider>

            {/* 범례 */}
            <div className="flex items-center justify-end mt-4 gap-2 text-xs text-muted-foreground">
              <span>적음</span>
              <div className="flex gap-0.5">
                <div className="w-4 h-4 rounded-sm bg-muted" />
                <div className="w-4 h-4 rounded-sm bg-primary/25" />
                <div className="w-4 h-4 rounded-sm bg-primary/50" />
                <div className="w-4 h-4 rounded-sm bg-primary/75" />
                <div className="w-4 h-4 rounded-sm bg-primary" />
              </div>
              <span>많음</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

