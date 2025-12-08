"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ComparisonData {
  metric: string;
  current: number;
  previous: number;
  change: number;
}

interface ComparisonChartProps {
  data: ComparisonData[];
  currentLabel?: string;
  previousLabel?: string;
}

export function ComparisonChart({
  data,
  currentLabel = "올해",
  previousLabel = "작년",
}: ComparisonChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="metric" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
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
        />
        <Legend />
        <Bar
          dataKey="previous"
          name={previousLabel}
          fill="hsl(var(--muted-foreground))"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="current"
          name={currentLabel}
          fill="hsl(var(--primary))"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// 변화율 표시 컴포넌트
export function ChangeIndicator({ value }: { value: number }) {
  const isPositive = value > 0;
  const isNeutral = value === 0;

  return (
    <span
      className={`text-sm font-medium ${
        isNeutral
          ? "text-muted-foreground"
          : isPositive
          ? "text-green-600"
          : "text-red-600"
      }`}
    >
      {isPositive ? "+" : ""}
      {value}%
    </span>
  );
}

