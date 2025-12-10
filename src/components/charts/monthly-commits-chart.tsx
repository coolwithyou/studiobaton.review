"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";

interface MonthlyData {
  month: number;
  commits: number;
  workUnits: number;
  additions: number;
  deletions: number;
  filesChanged: number;
}

interface MonthlyCommitsChartProps {
  data: MonthlyData[];
}

const MONTH_NAMES = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월"
];

export function MonthlyCommitsChart({ data }: MonthlyCommitsChartProps) {
  const chartData = data.map((item) => ({
    month: MONTH_NAMES[item.month - 1],
    커밋수: item.commits,
    "Work Units": item.workUnits,
    "코드변경(K)": Math.round((item.additions + item.deletions) / 1000),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis yAxisId="left" />
        <YAxis yAxisId="right" orientation="right" />
        <Tooltip />
        <Legend />
        <Bar yAxisId="left" dataKey="커밋수" fill="#3b82f6" />
        <Bar yAxisId="left" dataKey="Work Units" fill="#8b5cf6" />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="코드변경(K)"
          stroke="#f59e0b"
          strokeWidth={2}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

