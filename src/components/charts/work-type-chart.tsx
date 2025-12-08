"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { WorkType } from "@/types";

interface WorkTypeChartProps {
  data: Record<WorkType, number>;
}

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  feature: "기능 개발",
  bugfix: "버그 수정",
  refactor: "리팩토링",
  chore: "유지보수",
  docs: "문서화",
  test: "테스트",
};

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
];

export function WorkTypeChart({ data }: WorkTypeChartProps) {
  const chartData = Object.entries(data)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      name: WORK_TYPE_LABELS[key as WorkType] || key,
      value,
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        데이터가 없습니다
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          label={({ name, percent }) =>
            `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
          }
          labelLine={false}
        >
          {chartData.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={COLORS[index % COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

