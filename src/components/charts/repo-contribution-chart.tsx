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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RepoContribution } from "@/types";

interface RepoContributionChartProps {
  data: RepoContribution[];
  title?: string;
  description?: string;
  maxRepos?: number;
}

export function RepoContributionChart({
  data,
  title = "저장소별 기여",
  description = "저장소별 커밋 및 코드 변경량",
  maxRepos = 10,
}: RepoContributionChartProps) {
  // 상위 N개만 표시
  const chartData = data
    .slice(0, maxRepos)
    .map((d) => ({
      ...d,
      name: d.repo.split('/').pop() || d.repo, // org/repo -> repo
      fullName: d.repo,
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ left: 20, right: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                type="number"
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                type="category"
                dataKey="name"
                width={100}
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value, name) => [
                  Number(value).toLocaleString(),
                  name === 'commits' ? '커밋' :
                  name === 'linesAdded' ? '추가 라인' :
                  name === 'linesDeleted' ? '삭제 라인' : String(name),
                ]}
                labelFormatter={(label) => {
                  const item = chartData.find(d => d.name === label);
                  return item?.fullName || label;
                }}
              />
              <Legend 
                formatter={(value) => 
                  value === 'commits' ? '커밋' :
                  value === 'linesAdded' ? '추가 라인' :
                  value === 'linesDeleted' ? '삭제 라인' : value
                }
              />
              <Bar
                dataKey="commits"
                fill="hsl(var(--primary))"
                radius={[0, 4, 4, 0]}
              />
              <Bar
                dataKey="linesAdded"
                fill="hsl(142, 76%, 36%)"
                radius={[0, 4, 4, 0]}
              />
              <Bar
                dataKey="linesDeleted"
                fill="hsl(0, 84%, 60%)"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

