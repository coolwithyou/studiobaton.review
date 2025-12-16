"use client";

import { useMemo } from "react";
import { DayCommits } from "@/types";
import { CommitDotMatrix } from "../visualization/commit-dot-matrix";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitBranch, GitCommit, Calendar, TrendingUp } from "lucide-react";

interface JournalHomeViewProps {
  year: number;
  commits: DayCommits[];
}

export function JournalHomeView({ year, commits }: JournalHomeViewProps) {
  // 통계 계산
  const stats = useMemo(() => {
    const totalCommits = commits.reduce((sum, day) => sum + day.commits.length, 0);
    const activeDays = commits.length;
    
    const repoSet = new Set<string>();
    let totalAdditions = 0;
    let totalDeletions = 0;

    commits.forEach((day) => {
      day.commits.forEach((commit) => {
        repoSet.add(commit.repoFullName);
        totalAdditions += commit.additions;
        totalDeletions += commit.deletions;
      });
    });

    const activeRepos = repoSet.size;
    const avgCommitsPerDay = activeDays > 0 ? (totalCommits / activeDays).toFixed(1) : "0";

    // 월별 분포 계산
    const monthlyDistribution = new Map<number, number>();
    commits.forEach((day) => {
      const month = new Date(day.date).getMonth() + 1;
      monthlyDistribution.set(month, (monthlyDistribution.get(month) || 0) + day.commits.length);
    });

    const mostActiveMonth = Array.from(monthlyDistribution.entries())
      .sort((a, b) => b[1] - a[1])[0];

    return {
      totalCommits,
      activeDays,
      activeRepos,
      avgCommitsPerDay,
      totalAdditions,
      totalDeletions,
      mostActiveMonth: mostActiveMonth ? mostActiveMonth[0] : null,
      mostActiveMonthCommits: mostActiveMonth ? mostActiveMonth[1] : 0,
    };
  }, [commits]);

  const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 섹션 */}
      <div className="p-6 border-b bg-gradient-to-r from-background to-muted/20">
        <h2 className="text-2xl font-bold mb-2">커밋 분포 분석</h2>
        <p className="text-sm text-muted-foreground">
          {year}년 동안의 커밋을 리포지토리별로 시각화합니다
        </p>
      </div>

      {/* 통계 카드 그리드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-6 border-b">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <GitCommit className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-medium">총 커밋</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCommits}</div>
            <p className="text-xs text-muted-foreground mt-1">
              일평균 {stats.avgCommitsPerDay}개
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-medium">활동 리포지토리</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeRepos}</div>
            <p className="text-xs text-muted-foreground mt-1">
              프로젝트
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-medium">활동 일수</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeDays}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {((stats.activeDays / 365) * 100).toFixed(1)}% 활동률
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-medium">코드 변경</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-green-500">
                +{stats.totalAdditions.toLocaleString()}
              </span>
              <span className="text-lg font-bold text-red-500">
                -{stats.totalDeletions.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              총 변경 라인
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Dot Matrix 시각화 영역 */}
      <div className="flex-1 relative min-h-0">
        {commits.length > 0 ? (
          <CommitDotMatrix commits={commits} year={year} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <GitCommit className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">커밋 데이터가 없습니다</p>
            </div>
          </div>
        )}
      </div>

      {/* 하단 인사이트 */}
      {stats.mostActiveMonth && (
        <div className="p-4 border-t bg-muted/20">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary">인사이트</Badge>
            <span className="text-muted-foreground">
              가장 활발했던 달은 <strong>{MONTH_NAMES[stats.mostActiveMonth - 1]}</strong>로 
              총 <strong>{stats.mostActiveMonthCommits}개</strong>의 커밋이 있었습니다.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

