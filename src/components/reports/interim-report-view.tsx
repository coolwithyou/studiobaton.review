"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MonthlyCommitsChart } from "@/components/charts/monthly-commits-chart";
import { ActivityHeatmap } from "@/components/charts/activity-heatmap";
import { RepoDistributionChart } from "@/components/charts/repo-distribution-chart";
import { CommitSizeHistogram } from "@/components/charts/commit-size-histogram";
import { ImpactDistributionChart } from "@/components/charts/impact-distribution-chart";
import {
  GitCommit,
  Layers,
  TrendingUp,
  FileText,
  Award,
  Calendar,
  BarChart3,
  AlertTriangle,
  FileCheck,
} from "lucide-react";
import type { InterimReportData } from "@/lib/analysis/interim-stats";

interface InterimReportViewProps {
  data: InterimReportData;
}

export function InterimReportView({ data }: InterimReportViewProps) {
  const { summary, monthlyActivity, repoContribution, workPatterns, qualityIndicators, impactAnalysis, activityHeatmap } = data;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{data.userLogin}의 정량적 분석 리포트</h1>
          <p className="text-muted-foreground mt-1">
            {data.year}년 활동 분석 (AI 리뷰 전)
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          생성일: {new Date(data.generatedAt).toLocaleDateString("ko-KR")}
        </Badge>
      </div>

      {/* 요약 카드 섹션 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 커밋</CardTitle>
            <GitCommit className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalCommits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              일평균 {summary.avgDailyCommits}개
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Work Units</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalWorkUnits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              평균 {workPatterns.avgCommitsPerWorkUnit}개 커밋/유닛
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">코드 변경량</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {((summary.totalAdditions + summary.totalDeletions) / 1000).toFixed(1)}K
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-600">+{summary.totalAdditions.toLocaleString()}</span>{" "}
              <span className="text-red-600">-{summary.totalDeletions.toLocaleString()}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">평균 Impact</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.avgImpactScore}</div>
            <p className="text-xs text-muted-foreground">
              {summary.activeDays}일 활동
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 월별 활동 차트 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            월별 활동 추이
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyCommitsChart data={monthlyActivity} />
        </CardContent>
      </Card>

      {/* 활동 히트맵 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            활동 시간대 분석
          </CardTitle>
          <p className="text-sm text-muted-foreground">요일별 시간대별 커밋 분포</p>
        </CardHeader>
        <CardContent>
          <ActivityHeatmap data={activityHeatmap} />
        </CardContent>
      </Card>

      {/* 저장소 분포 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            저장소별 기여도
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RepoDistributionChart data={repoContribution} />
        </CardContent>
      </Card>

      {/* 작업 패턴 & 품질 지표 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 커밋 크기 분포 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              커밋 크기 분포
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              평균 {workPatterns.avgCommitSize.toLocaleString()} LoC/커밋
            </p>
          </CardHeader>
          <CardContent>
            <CommitSizeHistogram
              largeChanges={workPatterns.largeChanges}
              smallChanges={workPatterns.smallChanges}
              totalCommits={summary.totalCommits}
            />
          </CardContent>
        </Card>

        {/* 작업 타입 분포 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              커밋 타입 분포
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(workPatterns.commitTypes)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => {
                  const percentage = summary.totalCommits > 0
                    ? (count / summary.totalCommits) * 100
                    : 0;

                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium capitalize">{type}</span>
                        <span className="text-muted-foreground">
                          {count} ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 품질 지표 카드 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">테스트 파일</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{qualityIndicators.testFileRatio.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">변경 파일 중</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">문서화</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{qualityIndicators.docsRatio.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">문서 파일 비율</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Hotfix
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{qualityIndicators.hotfixRatio.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">긴급 수정 비율</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Revert
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{qualityIndicators.revertRatio.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">되돌림 비율</p>
          </CardContent>
        </Card>
      </div>

      {/* Impact 분석 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Impact Score 분포
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ImpactDistributionChart data={impactAnalysis.distribution} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>상위 Work Units</CardTitle>
            <p className="text-sm text-muted-foreground">
              Impact Score 기준 상위 10개
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[250px] overflow-y-auto">
              {impactAnalysis.topWorkUnits.map((wu, index) => (
                <div
                  key={wu.id}
                  className="flex items-start gap-3 p-2 rounded-lg border"
                >
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {wu.repoName}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {wu.primaryPaths[0]}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        Score: {wu.score.toFixed(1)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {wu.commitCount}개 커밋
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

