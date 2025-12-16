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
import {
  RefreshCw,
  Settings,
  GitCommit,
  Users,
  FolderGit2,
  GitPullRequest,
  ArrowRight,
  TrendingUp,
  Code2,
  Activity,
  Calendar,
} from "lucide-react";

interface OrgStats {
  totalCommits: number;
  totalAdditions: number;
  totalDeletions: number;
  totalPullRequests: number;
  totalContributors: number;
  activeRepos: number;
  totalRepos: number;
}

interface ContributorSummary {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  isOrgMember: boolean;
  stats: {
    commits: number;
    additions: number;
    deletions: number;
    pullRequests: number;
    contributedRepos: number;
  };
  analysisStatus: string | null;
}

interface MonthlyActivity {
  month: number;
  commits: number;
  additions: number;
  deletions: number;
}

interface DashboardData {
  orgLogin: string;
  year: number;
  availableYears: number[];
  stats: OrgStats;
  monthlyActivity: MonthlyActivity[];
  contributors: ContributorSummary[];
}

export default function OrganizationDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = params.login as string;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentYear = searchParams.get("year")
    ? parseInt(searchParams.get("year")!, 10)
    : new Date().getFullYear();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/organizations/${login}/dashboard?year=${currentYear}`);
        if (!res.ok) {
          throw new Error("Failed to fetch dashboard data");
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [login, currentYear]);

  const handleYearChange = (year: string) => {
    router.push(`/organizations/${login}?year=${year}`);
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !data) {
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

  const monthNames = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

  return (
    <div className="container py-8 px-4">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{login}</h1>
          <p className="mt-2 text-muted-foreground">조직 대시보드</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={currentYear.toString()} onValueChange={handleYearChange}>
            <SelectTrigger className="w-[130px]">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue placeholder="연도 선택" />
            </SelectTrigger>
            <SelectContent>
              {data.availableYears.length > 0 ? (
                data.availableYears.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}년
                  </SelectItem>
                ))
              ) : (
                <SelectItem value={currentYear.toString()}>{currentYear}년</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button variant="outline" asChild>
            <Link href={`/organizations/${login}/sync`}>
              <RefreshCw className="mr-2 h-4 w-4" />
              동기화
            </Link>
          </Button>
          <Button variant="outline" size="icon" asChild>
            <Link href={`/organizations/${login}/settings`}>
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
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
            <p className="text-2xl font-bold">{data.stats.totalCommits.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{currentYear}년 전체</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pull Requests</CardTitle>
            <GitPullRequest className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.stats.totalPullRequests.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{currentYear}년 전체</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">코드 변경</CardTitle>
            <Code2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              <span className="text-green-600">+{(data.stats.totalAdditions / 1000).toFixed(1)}k</span>
              {" / "}
              <span className="text-red-600">-{(data.stats.totalDeletions / 1000).toFixed(1)}k</span>
            </p>
            <p className="text-xs text-muted-foreground">추가 / 삭제 라인</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">활성 리포</CardTitle>
            <FolderGit2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {data.stats.activeRepos} / {data.stats.totalRepos}
            </p>
            <p className="text-xs text-muted-foreground">커밋이 있는 리포</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Activity Chart */}
      {data.monthlyActivity.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              월별 활동
            </CardTitle>
            <CardDescription>{currentYear}년 월별 커밋 추이</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-40">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                const activity = data.monthlyActivity.find((m) => m.month === month);
                const commits = activity?.commits || 0;
                const maxCommits = Math.max(...data.monthlyActivity.map((m) => m.commits), 1);
                const height = (commits / maxCommits) * 100;

                return (
                  <div key={month} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-primary/80 rounded-t transition-all hover:bg-primary"
                      style={{ height: `${Math.max(height, 2)}%` }}
                      title={`${commits.toLocaleString()} 커밋`}
                    />
                    <span className="text-xs text-muted-foreground">{monthNames[month - 1]}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contributors Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              기여자 ({data.contributors.length})
            </CardTitle>
            <CardDescription>조직 멤버 중 {currentYear}년 기여자 목록</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {data.contributors.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.contributors.map((contributor) => (
                <Link
                  key={contributor.login}
                  href={`/organizations/${login}/contributors/${contributor.login}`}
                  className="block"
                >
                  <Card className="hover:border-primary/50 transition-all hover:shadow-md">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={contributor.avatarUrl || undefined} />
                          <AvatarFallback>
                            {contributor.login.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold truncate">{contributor.name || contributor.login}</p>
                            {contributor.analysisStatus === "COMPLETED" && (
                              <Badge variant="secondary" className="text-xs">분석완료</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">@{contributor.login}</p>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-lg font-bold">{contributor.stats.commits}</p>
                          <p className="text-xs text-muted-foreground">커밋</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold">{contributor.stats.pullRequests}</p>
                          <p className="text-xs text-muted-foreground">PR</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold">{contributor.stats.contributedRepos}</p>
                          <p className="text-xs text-muted-foreground">리포</p>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <span className="text-sm text-primary flex items-center gap-1">
                          상세 보기
                          <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">기여자가 없습니다</p>
              <p className="text-sm text-muted-foreground mb-4">
                {currentYear}년에 커밋이 있는 조직 멤버가 없습니다.
              </p>
              <Button asChild>
                <Link href={`/organizations/${login}/sync`}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  커밋 동기화 시작
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card className="hover:border-primary/50 transition-colors">
          <Link href={`/organizations/${login}/sync`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">커밋 동기화</CardTitle>
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold">새 데이터 수집</p>
              <p className="text-xs text-muted-foreground">연도별 커밋 데이터를 수집합니다</p>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <Link href={`/organizations/${login}/pulls`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pull Requests</CardTitle>
              <GitPullRequest className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold">{data.stats.totalPullRequests}개</p>
              <p className="text-xs text-muted-foreground">PR 목록 및 통계 확인</p>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <Link href={`/organizations/${login}/settings`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">조직 설정</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold">관리</p>
              <p className="text-xs text-muted-foreground">저장소, 멤버 및 설정을 관리합니다</p>
            </CardContent>
          </Link>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="container py-8 px-4">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-32 mt-2" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-24" />
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

      <Card className="mb-8">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
