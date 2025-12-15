"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DayCommits } from "@/types";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { GitCommit, Plus, Minus } from "lucide-react";

interface CommitsCardProps {
  year: number;
  month: number;
  selectedWeek: number | null;
  commits: DayCommits[];
}

export function CommitsCard({
  year,
  month,
  selectedWeek,
  commits,
}: CommitsCardProps) {
  const totalCommits = commits.reduce((sum, day) => sum + day.commits.length, 0);

  console.log(`[commits-card] Week ${selectedWeek}: ${commits.length} days, ${totalCommits} commits`);

  if (!selectedWeek) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>커밋 목록</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            주차를 선택하면 커밋 목록이 표시됩니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (commits.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{selectedWeek}주차 커밋</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            이 주차에는 커밋이 없습니다.
          </p>
          <p className="text-xs text-muted-foreground text-center">
            (디버그: UI에서 필터링된 커밋이 0개입니다)
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{selectedWeek}주차 커밋</CardTitle>
          <Badge variant="outline">
            {commits.reduce((sum, day) => sum + day.commits.length, 0)}개
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-6">
            {commits.map((day) => (
              <div key={day.date}>
                {/* 날짜 헤더 */}
                <div className="mb-3 flex items-center gap-2">
                  <h4 className="text-sm font-medium">
                    {format(parseISO(day.date), "M월 d일 (E)", { locale: ko })}
                  </h4>
                  <Badge variant="secondary" className="text-xs">
                    {day.commits.length}
                  </Badge>
                </div>

                {/* 커밋 목록 */}
                <div className="space-y-3">
                  {day.commits.map((commit, idx) => (
                    <div
                      key={`${commit.sha}-${idx}`}
                      className="rounded-lg border bg-muted/30 p-3"
                    >
                      <div className="flex items-start gap-3">
                        <GitCommit className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          {/* 리포지토리 */}
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {commit.repoName}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(commit.committedAt), "HH:mm")}
                            </span>
                          </div>

                          {/* 커밋 메시지 */}
                          <p className="text-sm leading-relaxed mb-2">
                            {commit.message.split("\n")[0]}
                          </p>

                          {/* 변경 통계 */}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{commit.sha.substring(0, 7)}</span>
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
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

