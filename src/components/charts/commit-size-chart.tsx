"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface CommitSizeChartProps {
  commits: Array<{
    additions: number;
    deletions: number;
  }>;
  title?: string;
  description?: string;
}

const SIZE_BUCKETS = [
  { label: "1-10줄", min: 1, max: 10 },
  { label: "11-50줄", min: 11, max: 50 },
  { label: "51-100줄", min: 51, max: 100 },
  { label: "101-200줄", min: 101, max: 200 },
  { label: "201-500줄", min: 201, max: 500 },
  { label: "500줄+", min: 501, max: Infinity },
];

export function CommitSizeChart({
  commits,
  title = "커밋 크기 분포",
  description = "커밋당 변경 라인 수 분포",
}: CommitSizeChartProps) {
  // 버킷별 커밋 수 계산
  const chartData = SIZE_BUCKETS.map(bucket => {
    const count = commits.filter(c => {
      const size = c.additions + c.deletions;
      return size >= bucket.min && size <= bucket.max;
    }).length;

    return {
      name: bucket.label,
      count,
      percentage: commits.length > 0 
        ? Math.round((count / commits.length) * 100) 
        : 0,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="name"
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value) => [`${value}개`, '커밋 수']}
              />
              <Bar
                dataKey="count"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 통계 요약 */}
        <div className="grid grid-cols-3 gap-4 mt-4 text-center">
          <div>
            <div className="text-lg font-semibold">
              {commits.length > 0 
                ? Math.round(commits.reduce((sum, c) => 
                    sum + c.additions + c.deletions, 0
                  ) / commits.length)
                : 0}
            </div>
            <div className="text-xs text-muted-foreground">평균 크기</div>
          </div>
          <div>
            <div className="text-lg font-semibold">
              {chartData.find(d => d.name === "1-10줄")?.percentage || 0}%
            </div>
            <div className="text-xs text-muted-foreground">소규모 커밋</div>
          </div>
          <div>
            <div className="text-lg font-semibold">
              {chartData.filter(d => 
                d.name === "201-500줄" || d.name === "500줄+"
              ).reduce((sum, d) => sum + d.percentage, 0)}%
            </div>
            <div className="text-xs text-muted-foreground">대규모 커밋</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

