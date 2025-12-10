"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface CommitSizeHistogramProps {
  largeChanges: number;
  smallChanges: number;
  totalCommits: number;
}

export function CommitSizeHistogram({
  largeChanges,
  smallChanges,
  totalCommits,
}: CommitSizeHistogramProps) {
  const mediumChanges = totalCommits - largeChanges - smallChanges;

  const data = [
    {
      name: "소규모\n(<50 LoC)",
      count: smallChanges,
      fill: "#10b981",
    },
    {
      name: "중규모\n(50-500 LoC)",
      count: mediumChanges,
      fill: "#3b82f6",
    },
    {
      name: "대규모\n(>500 LoC)",
      count: largeChanges,
      fill: "#f59e0b",
    },
  ];

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div>
          <div className="text-2xl font-bold text-green-600">{smallChanges}</div>
          <div className="text-muted-foreground">
            {totalCommits > 0 ? ((smallChanges / totalCommits) * 100).toFixed(1) : 0}%
          </div>
        </div>
        <div>
          <div className="text-2xl font-bold text-blue-600">{mediumChanges}</div>
          <div className="text-muted-foreground">
            {totalCommits > 0 ? ((mediumChanges / totalCommits) * 100).toFixed(1) : 0}%
          </div>
        </div>
        <div>
          <div className="text-2xl font-bold text-orange-600">{largeChanges}</div>
          <div className="text-muted-foreground">
            {totalCommits > 0 ? ((largeChanges / totalCommits) * 100).toFixed(1) : 0}%
          </div>
        </div>
      </div>
    </div>
  );
}

