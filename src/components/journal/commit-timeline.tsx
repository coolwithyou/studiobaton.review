"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DayCommits } from "@/types";
import { GitCommit, Plus, Minus, Calendar } from "lucide-react";
import { format, parseISO, getMonth } from "date-fns";
import { ko } from "date-fns/locale";

interface CommitTimelineProps {
  dayCommits: DayCommits[];
  year: number;
}

export function CommitTimeline({ dayCommits, year }: CommitTimelineProps) {
  // 월별로 그룹핑
  const commitsByMonth = useMemo(() => {
    const grouped = new Map<number, DayCommits[]>();

    dayCommits.forEach((day) => {
      const month = getMonth(parseISO(day.date)) + 1; // 1-12
      if (!grouped.has(month)) {
        grouped.set(month, []);
      }
      grouped.get(month)!.push(day);
    });

    return Array.from(grouped.entries()).sort((a, b) => b[0] - a[0]); // 최신순
  }, [dayCommits]);

  if (dayCommits.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <GitCommit className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">이 기간에는 커밋이 없습니다.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {commitsByMonth.map(([month, days]) => (
        <div key={month}>
          {/* 월 헤더 */}
          <div className="mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <h3 className="text-xl font-semibold">
              {year}년 {month}월
            </h3>
            <Badge variant="outline" className="ml-2">
              {days.reduce((sum, day) => sum + day.commits.length, 0)}개 커밋
            </Badge>
          </div>

          {/* 날짜별 커밋 */}
          <div className="space-y-4">
            {days.map((day) => (
              <Card key={day.date} className="border-l-4 border-l-primary">
                <CardContent className="pt-6">
                  {/* 날짜 헤더 */}
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-medium">
                        {format(parseISO(day.date), "M월 d일 (E)", { locale: ko })}
                      </span>
                      <Badge variant="secondary">{day.commits.length}개</Badge>
                    </div>
                  </div>

                  {/* 커밋 목록 */}
                  <div className="space-y-3">
                    {day.commits.map((commit, idx) => (
                      <div
                        key={`${commit.sha}-${idx}`}
                        className="rounded-lg border bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                      >
                        <div className="mb-2 flex items-start justify-between">
                          <div className="flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {commit.repoName}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(commit.committedAt), "HH:mm")}
                              </span>
                            </div>
                            <p className="text-sm font-medium leading-relaxed">
                              {commit.message.split("\n")[0]}
                            </p>
                          </div>
                        </div>

                        {/* 변경 통계 */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <GitCommit className="h-3 w-3" />
                            {commit.sha.substring(0, 7)}
                          </span>
                          {(commit.additions > 0 || commit.deletions > 0) && (
                            <>
                              <span className="flex items-center gap-1 text-green-600">
                                <Plus className="h-3 w-3" />
                                {commit.additions}
                              </span>
                              <span className="flex items-center gap-1 text-red-600">
                                <Minus className="h-3 w-3" />
                                {commit.deletions}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 월 구분선 */}
          {month !== commitsByMonth[commitsByMonth.length - 1][0] && (
            <Separator className="mt-8" />
          )}
        </div>
      ))}
    </div>
  );
}
