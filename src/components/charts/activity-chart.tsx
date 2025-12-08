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

interface MonthlyData {
  month: number;
  commits: number;
  workUnits: number;
}

interface ActivityChartProps {
  data: MonthlyData[];
  showWorkUnits?: boolean;
}

const monthNames = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

export function ActivityChart({ data, showWorkUnits = true }: ActivityChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    name: monthNames[d.month - 1],
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
        />
        <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="commits"
          name="커밋"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ fill: "hsl(var(--primary))" }}
        />
        {showWorkUnits && (
          <Line
            type="monotone"
            dataKey="workUnits"
            name="작업 묶음"
            stroke="hsl(var(--chart-2))"
            strokeWidth={2}
            dot={{ fill: "hsl(var(--chart-2))" }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

