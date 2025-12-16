"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkTypeDistribution } from "@/types";

interface WorkTypeChartProps {
  data: WorkTypeDistribution[];
  title?: string;
  description?: string;
}

const WORK_TYPE_LABELS: Record<string, string> = {
  feature: "기능 추가",
  bugfix: "버그 수정",
  refactor: "리팩토링",
  docs: "문서화",
  test: "테스트",
  style: "스타일",
  chore: "유지보수",
  unknown: "기타",
};

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(221, 83%, 53%)",
  "hsl(262, 83%, 58%)",
  "hsl(var(--muted-foreground))",
];

export function WorkTypeChart({
  data,
  title = "작업 유형 분포",
  description = "커밋 유형별 비율",
}: WorkTypeChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    name: WORK_TYPE_LABELS[d.type] || d.type,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, payload }) => `${name} ${payload?.percentage || 0}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="count"
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
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value, name) => [
                  `${value}개 (${chartData.find(d => d.name === name)?.percentage || 0}%)`,
                  String(name),
                ]}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

