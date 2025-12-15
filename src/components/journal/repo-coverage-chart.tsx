"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RepoCoverageStats } from "@/types";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Target, TrendingUp, Users } from "lucide-react";

interface RepoCoverageChartProps {
  stats: RepoCoverageStats;
}

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function RepoCoverageChart({ stats }: RepoCoverageChartProps) {
  // 작업 스타일 레이블
  const workStyleLabels = {
    specialist: "전문가형 (단일 프로젝트 집중)",
    generalist: "제너럴리스트형 (다중 프로젝트)",
    balanced: "균형형 (적절한 분산)",
  };

  const workStyleColors = {
    specialist: "text-blue-600",
    generalist: "text-purple-600",
    balanced: "text-green-600",
  };

  // 월간 다양성 차트 데이터
  const monthlyChartData = useMemo(() => {
    return stats.monthlyDiversity.map((m) => ({
      name: `${m.month}월`,
      리포수: m.repoCount,
      집중도: (m.focusScore * 100).toFixed(0),
      커밋수: m.commits,
    }));
  }, [stats.monthlyDiversity]);

  // 주간 다양성 차트 데이터 (샘플링: 4주마다)
  const weeklyChartData = useMemo(() => {
    return stats.weeklyDiversity
      .filter((_, idx) => idx % 4 === 0) // 4주마다 샘플링
      .map((w) => ({
        name: `${w.week}주`,
        리포수: w.repoCount,
        집중도: (w.focusScore * 100).toFixed(0),
      }));
  }, [stats.weeklyDiversity]);

  return (
    <div className="space-y-6">
      {/* 요약 카드들 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Target className="h-4 w-4" />
              연간 커버리지
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.coveragePercentage.toFixed(0)}%</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.totalReposContributed} / {stats.totalReposInOrg} 리포
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              평균 월간 리포 수
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {(
                stats.monthlyDiversity.reduce((sum, m) => sum + m.repoCount, 0) /
                stats.monthlyDiversity.length
              ).toFixed(1)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">활동한 달 기준</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" />
              작업 스타일
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-xl font-bold ${workStyleColors[stats.workStyle]}`}>
              {workStyleLabels[stats.workStyle]}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 차트 탭 */}
      <Card>
        <CardHeader>
          <CardTitle>리포지터리 커버리지 추이</CardTitle>
          <CardDescription>
            시간에 따른 작업 리포지터리 수와 집중도 변화를 확인할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="monthly">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="monthly">월간</TabsTrigger>
              <TabsTrigger value="weekly">주간 (샘플)</TabsTrigger>
            </TabsList>

            <TabsContent value="monthly" className="space-y-4">
              <div>
                <h4 className="mb-4 text-sm font-medium">월별 작업 리포지터리 수</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar dataKey="리포수" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div>
                <h4 className="mb-4 text-sm font-medium">월별 집중도 점수 (%)</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="집중도"
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--chart-2))" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <p className="mt-2 text-xs text-muted-foreground">
                  * 집중도 점수: 가장 많이 작업한 리포의 비율 (높을수록 단일 프로젝트 집중)
                </p>
              </div>
            </TabsContent>

            <TabsContent value="weekly" className="space-y-4">
              <div>
                <h4 className="mb-4 text-sm font-medium">주별 작업 리포지터리 수 (4주마다)</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={weeklyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar dataKey="리포수" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div>
                <h4 className="mb-4 text-sm font-medium">주별 집중도 점수 (4주마다)</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={weeklyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="집중도"
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--chart-2))" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 작업 스타일 설명 */}
      <Card>
        <CardHeader>
          <CardTitle>작업 스타일 분석</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-1">
                전문가형
              </Badge>
              <p className="text-sm text-muted-foreground">
                평균 주간 리포 1-2개, 집중도 70% 이상. 단일 프로젝트에 깊이 있게 집중하는 스타일입니다.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-1">
                제너럴리스트형
              </Badge>
              <p className="text-sm text-muted-foreground">
                평균 주간 리포 4개 이상, 집중도 40% 미만. 여러 프로젝트를 동시에 진행하는 스타일입니다.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-1">
                균형형
              </Badge>
              <p className="text-sm text-muted-foreground">
                위 두 스타일의 중간. 2-3개 프로젝트를 적절히 분산하여 작업하는 스타일입니다.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
