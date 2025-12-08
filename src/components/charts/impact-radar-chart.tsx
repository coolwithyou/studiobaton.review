"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ImpactFactors } from "@/types";

interface ImpactRadarChartProps {
  data: ImpactFactors;
}

const FACTOR_LABELS: Record<keyof ImpactFactors, string> = {
  baseScore: "기본 점수",
  coreModuleBonus: "핵심 모듈",
  hotspotBonus: "핫스팟",
  testPenalty: "테스트",
  configBonus: "설정",
  sizeScore: "변경 규모",
};

export function ImpactRadarChart({ data }: ImpactRadarChartProps) {
  const chartData = Object.entries(data).map(([key, value]) => ({
    factor: FACTOR_LABELS[key as keyof ImpactFactors] || key,
    value: Math.max(0, value), // 음수는 0으로
    fullMark: 10,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={chartData}>
        <PolarGrid className="stroke-muted" />
        <PolarAngleAxis
          dataKey="factor"
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
        />
        <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fontSize: 10 }} />
        <Radar
          name="임팩트"
          dataKey="value"
          stroke="hsl(var(--primary))"
          fill="hsl(var(--primary))"
          fillOpacity={0.3}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

