"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  GitCommit,
  GitPullRequest,
  Code2,
  Activity,
  Calendar,
  FolderGit2,
  Clock,
  TrendingUp,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";

interface ContributorStats {
  totalCommits: number;
  totalAdditions: number;
  totalDeletions: number;
  totalFilesChanged: number;
  totalPullRequests: number;
  mergedPullRequests: number;
  contributedRepos: number;
  activeDays: number;
  averageCommitsPerDay: number;
  largestCommit: {
    sha: string;
    message: string;
    additions: number;
    deletions: number;
    repoFullName: string;
  } | null;
}

interface MonthlyCommits {
  month: number;
  commits: number;
  additions: number;
  deletions: number;
}

interface RepoContribution {
  repoId: string;
  repoFullName: string;
  repoName: string;
  language: string | null;
  commits: number;
  additions: number;
  deletions: number;
  percentage: number;
}

interface DayOfWeekActivity {
  day: number;
  commits: number;
}

interface HourlyActivity {
  hour: number;
  commits: number;
}

interface StatsData {
  orgLogin: string;
  userLogin: string;
  year: number;
  availableYears: number[];
  user: {
    login: string;
    name: string | null;
    avatarUrl: string | null;
    email: string | null;
  };
  stats: ContributorStats;
  monthlyCommits: MonthlyCommits[];
  repoContributions: RepoContribution[];
  dayOfWeekActivity: DayOfWeekActivity[];
  hourlyActivity: HourlyActivity[];
}

interface YearAnalysis {
  year: number;
  syncStatus: string;
  analysisId: string | null;
  analysisStatus: string | null;
  phase: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  hasReport: boolean;
}

interface AnalysisData {
  orgLogin: string;
  userLogin: string;
  analyses: YearAnalysis[];
}

export default function ContributorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const orgLogin = params.login as string;
  const userLogin = params.userLogin as string;

  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysisLoading, setAnalysisLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentYear = searchParams.get("year")
    ? parseInt(searchParams.get("year")!, 10)
    : new Date().getFullYear();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [statsRes, analysisRes] = await Promise.all([
          fetch(`/api/organizations/${orgLogin}/contributors/${userLogin}/stats?year=${currentYear}`),
          fetch(`/api/organizations/${orgLogin}/contributors/${userLogin}/analysis`),
        ]);

        if (!statsRes.ok) throw new Error("Failed to fetch stats");
        if (!analysisRes.ok) throw new Error("Failed to fetch analysis data");

        const [stats, analysis] = await Promise.all([statsRes.json(), analysisRes.json()]);
        setStatsData(stats);
        setAnalysisData(analysis);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [orgLogin, userLogin, currentYear]);

  const handleYearChange = (year: string) => {
    router.push(`/organizations/${orgLogin}/contributors/${userLogin}?year=${year}`);
  };

  const handleStartAnalysis = async (year: number) => {
    setAnalysisLoading(year);
    try {
      const res = await fetch(`/api/organizations/${orgLogin}/contributors/${userLogin}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start analysis");
      }

      // Refresh analysis data
      const analysisRes = await fetch(`/api/organizations/${orgLogin}/contributors/${userLogin}/analysis`);
      if (analysisRes.ok) {
        const analysis = await analysisRes.json();
        setAnalysisData(analysis);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "분석 시작 실패");
    } finally {
      setAnalysisLoading(null);
    }
  };

  if (loading) {
    return <ContributorSkeleton />;
  }

  if (error || !statsData) {
    return (
      <div className="container py-8 px-4">
        <div className="text-center">
          <p className="text-destructive">{error || "데이터를 불러올 수 없습니다."}</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const monthNames = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

  return (
    <div className="container py-8 px-4">
      {/* Back Button & Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href={`/organizations/${orgLogin}?year=${currentYear}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            조직 대시보드로 돌아가기
          </Link>
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={statsData.user.avatarUrl || undefined} />
              <AvatarFallback className="text-xl">
                {statsData.user.login.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold">{statsData.user.name || statsData.user.login}</h1>
              <p className="text-muted-foreground">@{statsData.user.login}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={currentYear.toString()} onValueChange={handleYearChange}>
              <SelectTrigger className="w-[130px]">
                <Calendar className="mr-2 h-4 w-4" />
                <SelectValue placeholder="연도 선택" />
              </SelectTrigger>
              <SelectContent>
                {statsData.availableYears.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}년
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://github.com/${statsData.user.login}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                GitHub
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="mb-8 grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">커밋</CardTitle>
            <GitCommit className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{statsData.stats.totalCommits.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              일평균 {statsData.stats.averageCommitsPerDay}개
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pull Requests</CardTitle>
            <GitPullRequest className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{statsData.stats.totalPullRequests}</p>
            <p className="text-xs text-muted-foreground">
              {statsData.stats.mergedPullRequests} merged
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">코드 변경</CardTitle>
            <Code2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              <span className="text-green-600">+{(statsData.stats.totalAdditions / 1000).toFixed(1)}k</span>
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="text-red-600">-{(statsData.stats.totalDeletions / 1000).toFixed(1)}k</span> 삭제
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">활동일</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{statsData.stats.activeDays}일</p>
            <p className="text-xs text-muted-foreground">
              {statsData.stats.contributedRepos}개 리포 기여
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Monthly Commit Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              월별 커밋
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-32">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                const activity = statsData.monthlyCommits.find((m) => m.month === month);
                const commits = activity?.commits || 0;
                const maxCommits = Math.max(...statsData.monthlyCommits.map((m) => m.commits), 1);
                const height = (commits / maxCommits) * 100;

                return (
                  <div key={month} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-primary/80 rounded-t transition-all hover:bg-primary"
                      style={{ height: `${Math.max(height, 2)}%` }}
                      title={`${commits.toLocaleString()} 커밋`}
                    />
                    <span className="text-xs text-muted-foreground">{month}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Day of Week Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              요일별 활동
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Array.from({ length: 7 }, (_, i) => {
                const activity = statsData.dayOfWeekActivity.find((d) => d.day === i);
                const commits = activity?.commits || 0;
                const maxCommits = Math.max(...statsData.dayOfWeekActivity.map((d) => d.commits), 1);
                const width = (commits / maxCommits) * 100;

                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-6 text-sm text-muted-foreground">{dayNames[i]}</span>
                    <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full bg-primary/80 rounded-full transition-all"
                        style={{ width: `${Math.max(width, 2)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm">{commits}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Repository Contributions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderGit2 className="h-5 w-5" />
              리포별 기여
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {statsData.repoContributions.slice(0, 5).map((repo) => (
                <div key={repo.repoId} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{repo.repoName}</span>
                    <span className="text-sm text-muted-foreground">{repo.commits}개</span>
                  </div>
                  <Progress value={repo.percentage} className="h-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Year Analysis Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              연도별 AI 분석
            </CardTitle>
            <CardDescription>연도별 개발 활동에 대한 AI 분석 결과</CardDescription>
          </CardHeader>
          <CardContent>
            {analysisData && analysisData.analyses.length > 0 ? (
              <div className="space-y-3">
                {analysisData.analyses.map((analysis) => (
                  <div
                    key={analysis.year}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{analysis.year}년</span>
                      {analysis.analysisStatus && (
                        <Badge
                          variant={
                            analysis.analysisStatus === "COMPLETED"
                              ? "default"
                              : analysis.analysisStatus === "IN_PROGRESS"
                                ? "secondary"
                                : analysis.analysisStatus === "FAILED"
                                  ? "destructive"
                                  : "outline"
                          }
                        >
                          {analysis.analysisStatus === "COMPLETED" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                          {analysis.analysisStatus === "IN_PROGRESS" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          {analysis.analysisStatus === "FAILED" && <XCircle className="mr-1 h-3 w-3" />}
                          {analysis.analysisStatus === "COMPLETED"
                            ? "완료"
                            : analysis.analysisStatus === "IN_PROGRESS"
                              ? analysis.phase || "진행중"
                              : analysis.analysisStatus === "FAILED"
                                ? "실패"
                                : analysis.analysisStatus}
                        </Badge>
                      )}
                    </div>
                    <div>
                      {analysis.analysisStatus === "COMPLETED" && analysis.hasReport ? (
                        <Button size="sm" asChild>
                          <Link
                            href={`/organizations/${orgLogin}/contributors/${userLogin}/analysis/${analysis.year}`}
                          >
                            결과 보기
                          </Link>
                        </Button>
                      ) : analysis.analysisStatus === "IN_PROGRESS" ? (
                        <Button size="sm" disabled>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          분석 중...
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStartAnalysis(analysis.year)}
                          disabled={analysisLoading === analysis.year}
                        >
                          {analysisLoading === analysis.year ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="mr-2 h-4 w-4" />
                          )}
                          분석 시작
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">분석 가능한 연도가 없습니다.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  먼저 커밋 동기화를 완료해주세요.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ContributorSkeleton() {
  return (
    <div className="container py-8 px-4">
      <Skeleton className="h-8 w-48 mb-6" />

      <div className="flex items-center gap-4 mb-8">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-5 w-24 mt-1" />
        </div>
      </div>

      <div className="mb-8 grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-3 w-16 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

