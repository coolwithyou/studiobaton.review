"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface RepoData {
  repoName: string;
  commits: number;
  additions: number;
  deletions: number;
  percentage: number;
}

interface RepoDistributionChartProps {
  data: RepoData[];
  maxSlices?: number;
}

const COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#6366f1",
  "#f43f5e",
];

export function RepoDistributionChart({
  data,
  maxSlices = 8,
}: RepoDistributionChartProps) {
  // 상위 N개만 표시하고 나머지는 "기타"로
  const topRepos = data.slice(0, maxSlices);
  const otherRepos = data.slice(maxSlices);

  const chartData = [...topRepos];

  if (otherRepos.length > 0) {
    const otherTotal = {
      repoName: "기타",
      commits: otherRepos.reduce((sum, r) => sum + r.commits, 0),
      additions: otherRepos.reduce((sum, r) => sum + r.additions, 0),
      deletions: otherRepos.reduce((sum, r) => sum + r.deletions, 0),
      percentage: otherRepos.reduce((sum, r) => sum + r.percentage, 0),
    };
    chartData.push(otherTotal);
  }

  const renderLabel = (entry: any) => {
    if (!entry || typeof entry.percentage !== "number") return "";
    if (entry.percentage < 5) return "";
    return `${entry.percentage.toFixed(1)}%`;
  };

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData as any}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderLabel}
            outerRadius={100}
            fill="#8884d8"
            dataKey="commits"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string, props: any) => [
              `${value} 커밋 (${props.payload.percentage.toFixed(1)}%)`,
              props.payload.repoName,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* 테이블 */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-2">저장소</th>
              <th className="text-right p-2">커밋</th>
              <th className="text-right p-2">+/-</th>
              <th className="text-right p-2">비율</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((repo, index) => (
              <tr key={index} className="border-t">
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="truncate max-w-[200px]">{repo.repoName}</span>
                  </div>
                </td>
                <td className="text-right p-2">{repo.commits.toLocaleString()}</td>
                <td className="text-right p-2 text-muted-foreground">
                  +{repo.additions.toLocaleString()} -
                  {repo.deletions.toLocaleString()}
                </td>
                <td className="text-right p-2 font-medium">
                  {repo.percentage.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

