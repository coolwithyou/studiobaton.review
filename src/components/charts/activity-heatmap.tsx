"use client";

import { useMemo } from "react";

interface HeatmapData {
  dayOfWeek: number;
  hour: number;
  count: number;
}

interface ActivityHeatmapProps {
  data: HeatmapData[];
}

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  // 데이터를 맵으로 변환
  const heatmapMap = useMemo(() => {
    const map = new Map<string, number>();
    data.forEach((item) => {
      const key = `${item.dayOfWeek}-${item.hour}`;
      map.set(key, item.count);
    });
    return map;
  }, [data]);

  // 최대값 찾기 (색상 강도 계산용)
  const maxCount = useMemo(() => {
    return Math.max(...data.map((d) => d.count), 1);
  }, [data]);

  const getColor = (count: number) => {
    if (count === 0) return "bg-gray-100 dark:bg-gray-800";
    const intensity = count / maxCount;
    if (intensity < 0.2) return "bg-green-200 dark:bg-green-900";
    if (intensity < 0.4) return "bg-green-300 dark:bg-green-800";
    if (intensity < 0.6) return "bg-green-400 dark:bg-green-700";
    if (intensity < 0.8) return "bg-green-500 dark:bg-green-600";
    return "bg-green-600 dark:bg-green-500";
  };

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* 시간 헤더 */}
        <div className="flex mb-1">
          <div className="w-8"></div>
          {HOURS.filter((h) => h % 3 === 0).map((hour) => (
            <div
              key={hour}
              className="text-xs text-muted-foreground text-center"
              style={{ width: "36px" }}
            >
              {hour}
            </div>
          ))}
        </div>

        {/* 히트맵 그리드 */}
        {DAY_NAMES.map((day, dayIndex) => (
          <div key={day} className="flex items-center mb-1">
            <div className="w-8 text-xs text-muted-foreground">{day}</div>
            <div className="flex gap-0.5">
              {HOURS.map((hour) => {
                const key = `${dayIndex}-${hour}`;
                const count = heatmapMap.get(key) || 0;
                const colorClass = getColor(count);

                return (
                  <div
                    key={hour}
                    className={`w-3 h-3 rounded-sm ${colorClass} hover:ring-2 hover:ring-primary cursor-pointer transition-all`}
                    title={`${day}요일 ${hour}시: ${count}개 커밋`}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* 범례 */}
        <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
          <span>적음</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-sm bg-gray-100 dark:bg-gray-800"></div>
            <div className="w-3 h-3 rounded-sm bg-green-200 dark:bg-green-900"></div>
            <div className="w-3 h-3 rounded-sm bg-green-300 dark:bg-green-800"></div>
            <div className="w-3 h-3 rounded-sm bg-green-400 dark:bg-green-700"></div>
            <div className="w-3 h-3 rounded-sm bg-green-500 dark:bg-green-600"></div>
            <div className="w-3 h-3 rounded-sm bg-green-600 dark:bg-green-500"></div>
          </div>
          <span>많음</span>
        </div>
      </div>
    </div>
  );
}

