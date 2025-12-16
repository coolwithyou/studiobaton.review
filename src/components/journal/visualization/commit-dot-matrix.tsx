"use client";

import { useMemo, useState } from "react";
import { DayCommits } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CommitDotMatrixProps {
  commits: DayCommits[];
  year: number;
}

interface RepoCommitData {
  repoFullName: string;
  repoName: string;
  commits: Array<{
    sha: string;
    message: string;
    date: string;
    additions: number;
    deletions: number;
  }>;
  color: string;
}

const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

// 색상 팔레트 (다양한 구분 가능한 색상)
const COLOR_PALETTE = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#f97316", // orange
  "#14b8a6", // teal
  "#6366f1", // indigo
  "#84cc16", // lime
  "#f43f5e", // rose
  "#0ea5e9", // sky
  "#a855f7", // violet
  "#22c55e", // green-500
  "#eab308", // yellow
];

export function CommitDotMatrix({ commits, year }: CommitDotMatrixProps) {
  const [viewMode, setViewMode] = useState<"year" | "month">("year");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [hoveredRepo, setHoveredRepo] = useState<string | null>(null);
  const [hoveredDot, setHoveredDot] = useState<{
    message: string;
    repo: string;
    date: string;
    additions: number;
    deletions: number;
  } | null>(null);

  // 리포지토리별 커밋 집계
  const repoData = useMemo(() => {
    const repoMap = new Map<string, RepoCommitData>();

    commits.forEach((dayCommit) => {
      const commitDate = new Date(dayCommit.date);
      const commitMonth = commitDate.getMonth() + 1;

      // 월별 필터링
      if (viewMode === "month" && commitMonth !== selectedMonth) {
        return;
      }

      dayCommit.commits.forEach((commit) => {
        const existing = repoMap.get(commit.repoFullName);
        if (existing) {
          existing.commits.push({
            sha: commit.sha,
            message: commit.message,
            date: dayCommit.date,
            additions: commit.additions,
            deletions: commit.deletions,
          });
        } else {
          repoMap.set(commit.repoFullName, {
            repoFullName: commit.repoFullName,
            repoName: commit.repoFullName.split('/').pop() || commit.repoFullName,
            commits: [{
              sha: commit.sha,
              message: commit.message,
              date: dayCommit.date,
              additions: commit.additions,
              deletions: commit.deletions,
            }],
            color: "",
          });
        }
      });
    });

    // 커밋 수 기준으로 정렬하고 색상 할당
    const sorted = Array.from(repoMap.values())
      .sort((a, b) => b.commits.length - a.commits.length)
      .map((repo, index) => ({
        ...repo,
        color: COLOR_PALETTE[index % COLOR_PALETTE.length],
      }));

    return sorted;
  }, [commits, viewMode, selectedMonth]);

  // 전체 커밋을 flat하게 펼치고 리포지토리별로 그룹화
  const allCommitDots = useMemo(() => {
    const dots: Array<{
      id: string;
      repo: string;
      repoName: string;
      color: string;
      message: string;
      date: string;
      additions: number;
      deletions: number;
    }> = [];

    repoData.forEach((repo) => {
      repo.commits.forEach((commit) => {
        dots.push({
          id: commit.sha,
          repo: repo.repoFullName,
          repoName: repo.repoName,
          color: repo.color,
          message: commit.message,
          date: commit.date,
          additions: commit.additions,
          deletions: commit.deletions,
        });
      });
    });

    return dots;
  }, [repoData]);

  const totalCommits = allCommitDots.length;

  // 그리드 레이아웃 계산 (적절한 행/열 수)
  const gridColumns = 20; // 한 줄에 20개
  const gridRows = Math.ceil(totalCommits / gridColumns);

  const handlePrevMonth = () => {
    setSelectedMonth((prev) => (prev > 1 ? prev - 1 : 12));
  };

  const handleNextMonth = () => {
    setSelectedMonth((prev) => (prev < 12 ? prev + 1 : 1));
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-auto">
      {/* 컨트롤 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          <Button
            variant={viewMode === "year" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("year")}
          >
            연간 뷰
          </Button>
          <Button
            variant={viewMode === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("month")}
          >
            월별 뷰
          </Button>
        </div>

        {viewMode === "month" && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handlePrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Badge variant="secondary" className="px-3 py-1 text-sm min-w-[60px] text-center">
              {MONTH_NAMES[selectedMonth - 1]}
            </Badge>
            <Button variant="ghost" size="icon" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          총 <strong>{totalCommits}</strong>개 커밋
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="flex-1 flex gap-8">
        {/* 왼쪽: 범례 */}
        <div className="w-64 flex-shrink-0">
          <h3 className="text-sm font-semibold mb-3">리포지토리</h3>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {repoData.map((repo) => (
              <div
                key={repo.repoFullName}
                className={`
                  flex items-center gap-2 p-2 rounded-md cursor-pointer transition-all
                  ${hoveredRepo === repo.repoFullName ? "bg-muted scale-105" : "hover:bg-muted/50"}
                `}
                onMouseEnter={() => setHoveredRepo(repo.repoFullName)}
                onMouseLeave={() => setHoveredRepo(null)}
              >
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: repo.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{repo.repoName}</div>
                  <div className="text-xs text-muted-foreground">
                    {repo.commits.length}개
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 오른쪽: Dot Matrix */}
        <div className="flex-1 relative">
          {totalCommits > 0 ? (
            <div className="relative">
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
                  maxWidth: "800px",
                }}
              >
                {allCommitDots.map((dot, index) => (
                  <div
                    key={`${dot.id}-${index}`}
                    className={`
                      w-6 h-6 rounded-full cursor-pointer transition-all
                      ${hoveredRepo === dot.repo ? "scale-125 ring-2 ring-white" : ""}
                      ${hoveredRepo && hoveredRepo !== dot.repo ? "opacity-30" : "opacity-100"}
                    `}
                    style={{
                      backgroundColor: dot.color,
                    }}
                    onMouseEnter={(e) => {
                      setHoveredDot({
                        message: dot.message,
                        repo: dot.repoName,
                        date: dot.date,
                        additions: dot.additions,
                        deletions: dot.deletions,
                      });
                    }}
                    onMouseLeave={() => setHoveredDot(null)}
                    title={`${dot.repoName}: ${dot.message}`}
                  />
                ))}
              </div>

              {/* 툴팁 */}
              {hoveredDot && (
                <div className="fixed pointer-events-none z-50" style={{
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%, -50%)"
                }}>
                  <div className="bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg max-w-xs">
                    <div className="font-semibold text-sm mb-1">{hoveredDot.repo}</div>
                    <div className="text-xs text-muted-foreground mb-2">
                      {new Date(hoveredDot.date).toLocaleDateString("ko-KR")}
                    </div>
                    <div className="text-xs mb-2 line-clamp-2">{hoveredDot.message}</div>
                    <div className="flex gap-3 text-xs">
                      <span className="text-green-500">+{hoveredDot.additions}</span>
                      <span className="text-red-500">-{hoveredDot.deletions}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              커밋 데이터가 없습니다
            </div>
          )}
        </div>
      </div>

      {/* 하단 설명 */}
      <div className="mt-6 pt-4 border-t">
        <p className="text-xs text-muted-foreground text-center">
          각 원은 하나의 커밋을 나타냅니다. 마우스를 올려 상세 정보를 확인하세요.
        </p>
      </div>
    </div>
  );
}

