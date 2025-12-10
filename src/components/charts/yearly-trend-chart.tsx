"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface YearlyTrendData {
  year: number;
  commits: number;
  workUnits: number;
  impactScore: number;
}

interface YearlyTrendChartProps {
  data: YearlyTrendData[];
}

export function YearlyTrendChart({ data }: YearlyTrendChartProps) {
  // 연도 오름차순 정렬
  const sortedData = [...data].sort((a, b) => a.year - b.year);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={sortedData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="year"
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => `${value}년`}
        />
        <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
          formatter={(value: number, name: string) => [
            value.toLocaleString(),
            name,
          ]}
          labelFormatter={(label) => `${label}년`}
        />
        <Legend />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="commits"
          name="커밋"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ fill: "hsl(var(--primary))", r: 4 }}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="workUnits"
          name="Work Units"
          stroke="hsl(220, 70%, 50%)"
          strokeWidth={2}
          dot={{ fill: "hsl(220, 70%, 50%)", r: 4 }}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="impactScore"
          name="임팩트"
          stroke="hsl(142, 76%, 36%)"
          strokeWidth={2}
          dot={{ fill: "hsl(142, 76%, 36%)", r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

