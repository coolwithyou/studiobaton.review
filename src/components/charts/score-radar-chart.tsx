"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Stage4Result } from "@/types";

interface ScoreRadarChartProps {
  assessment: Stage4Result['overallAssessment'];
  title?: string;
  description?: string;
}

const DIMENSION_LABELS: Record<string, string> = {
  productivity: "생산성",
  codeQuality: "코드 품질",
  diversity: "다양성",
  collaboration: "협업",
  growth: "성장",
};

export function ScoreRadarChart({
  assessment,
  title = "종합 역량 평가",
  description = "각 영역별 점수 (10점 만점)",
}: ScoreRadarChartProps) {
  const chartData = Object.entries(assessment).map(([key, value]) => ({
    dimension: DIMENSION_LABELS[key] || key,
    score: value.score,
    fullMark: 10,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis 
                dataKey="dimension"
                tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 10]}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                axisLine={false}
              />
              <Radar
                name="점수"
                dataKey="score"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.3}
                strokeWidth={2}
              />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* 점수 요약 */}
        <div className="grid grid-cols-5 gap-2 mt-4">
          {Object.entries(assessment).map(([key, value]) => (
            <div key={key} className="text-center">
              <div className="text-2xl font-bold text-primary">
                {value.score}
              </div>
              <div className="text-xs text-muted-foreground">
                {DIMENSION_LABELS[key]}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

