import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import {
  RefreshCw,
  Settings,
  GitCommit,
  Users,
  FolderGit2,
  Calendar,
  GitPullRequest,
  ArrowRight,
} from "lucide-react";

async function getDashboardData(orgLogin: string, userId: string) {
  // 조직 조회 및 권한 확인
  const org = await db.organization.findUnique({
    where: { login: orgLogin },
    include: {
      members: {
        where: { userId },
      },
    },
  });

  if (!org) {
    notFound();
  }

  // 멤버십 확인
  if (org.members.length === 0) {
    redirect("/dashboard");
  }

  // 저장소 수
  const repoCount = await db.repository.count({
    where: { orgId: org.id },
  });

  // 멤버 수
  const memberCount = await db.organizationMember.count({
    where: { orgId: org.id },
  });

  // 전체 커밋 수
  const totalCommits = await db.commit.count({
    where: {
      repo: { orgId: org.id },
    },
  });

  // 고유 기여자 수
  const uniqueContributors = await db.commit.findMany({
    where: {
      repo: { orgId: org.id },
    },
    select: {
      authorLogin: true,
    },
    distinct: ["authorLogin"],
  });

  // PR 통계
  const totalPRs = await db.pullRequest.count({
    where: {
      repo: { orgId: org.id },
    },
  });

  const prsByState = await db.pullRequest.groupBy({
    by: ["state"],
    where: {
      repo: { orgId: org.id },
    },
    _count: {
      id: true,
    },
  });

  const prStats = {
    total: totalPRs,
    open: prsByState.find((p) => p.state === "open")?._count.id || 0,
    closed: prsByState.find((p) => p.state === "closed")?._count.id || 0,
    merged: prsByState.find((p) => p.state === "merged")?._count.id || 0,
  };

  // 최근 동기화 작업
  const recentSyncJobs = await db.commitSyncJob.findMany({
    where: {
      orgId: org.id,
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // 기여자별 커밋 수 (상위 10명)
  const topContributors = await db.commit.groupBy({
    by: ["authorLogin"],
    where: {
      repo: { orgId: org.id },
    },
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: "desc",
      },
    },
    take: 10,
  });

  // 최근 PR 5개
  const recentPRs = await db.pullRequest.findMany({
    where: {
      repo: { orgId: org.id },
    },
    include: {
      repo: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return {
    org,
    stats: {
      repoCount,
      memberCount,
      totalCommits,
      contributorCount: uniqueContributors.length,
    },
    prStats,
    recentSyncJobs,
    topContributors,
    recentPRs,
  };
}

export default async function OrganizationDashboardPage({
  params,
}: {
  params: Promise<{ login: string }>;
}) {
  const { login } = await params;
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }

  const { org, stats, prStats, recentSyncJobs, topContributors, recentPRs } = await getDashboardData(login, user.id);

  return (
    <div className="container py-8 px-4">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{org.name || org.login}</h1>
        <p className="mt-2 text-muted-foreground">
          조직의 커밋 및 PR 데이터를 수집하고 관리하세요.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">전체 커밋</CardTitle>
            <GitCommit className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.totalCommits.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">수집된 커밋 수</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pull Requests</CardTitle>
            <GitPullRequest className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{prStats.total.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              {prStats.merged} merged, {prStats.open} open
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">기여자</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.contributorCount}</p>
            <p className="text-xs text-muted-foreground">고유 기여자 수</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">저장소</CardTitle>
            <FolderGit2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.repoCount}</p>
            <p className="text-xs text-muted-foreground">전체 저장소 수</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">멤버</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.memberCount}</p>
            <p className="text-xs text-muted-foreground">조직 멤버 수</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Card className="hover:border-primary/50 transition-colors">
          <Link href={`/organizations/${login}/sync`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">커밋 동기화</CardTitle>
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">시작하기</p>
              <p className="text-xs text-muted-foreground">
                새로운 커밋 데이터를 수집합니다
              </p>
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
              <p className="text-2xl font-bold">{prStats.total}개</p>
              <p className="text-xs text-muted-foreground">
                PR 목록 및 통계 확인
              </p>
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
              <p className="text-2xl font-bold">관리</p>
              <p className="text-xs text-muted-foreground">
                저장소, 멤버 및 설정을 관리합니다
              </p>
            </CardContent>
          </Link>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Top Contributors */}
        {topContributors.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>주요 기여자</CardTitle>
              <CardDescription>커밋 수 기준 상위 기여자</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topContributors.slice(0, 5).map((contributor, index) => (
                  <div key={contributor.authorLogin} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-6">#{index + 1}</span>
                      <span className="font-medium">{contributor.authorLogin}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {contributor._count.id.toLocaleString()} 커밋
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent PRs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>최근 Pull Requests</CardTitle>
              <CardDescription>최근 생성된 PR 목록</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/organizations/${login}/pulls`}>
                전체 보기
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentPRs.length > 0 ? (
              <div className="space-y-3">
                {recentPRs.map((pr) => (
                  <div key={pr.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <GitPullRequest className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <p className="font-medium truncate">{pr.title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {pr.repo.name} #{pr.number} by {pr.authorLogin}
                      </p>
                    </div>
                    <Badge
                      variant={
                        pr.state === "merged"
                          ? "default"
                          : pr.state === "open"
                            ? "secondary"
                            : "outline"
                      }
                      className="ml-2 flex-shrink-0"
                    >
                      {pr.state}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                수집된 PR이 없습니다.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Sync Jobs */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>최근 동기화 기록</CardTitle>
          <CardDescription>커밋 동기화 작업 히스토리</CardDescription>
        </CardHeader>
        <CardContent>
          {recentSyncJobs.length > 0 ? (
            <div className="space-y-3">
              {recentSyncJobs.map((job) => {
                const progress = job.progress as { totalCommits?: number } | null;
                return (
                  <Link
                    key={job.id}
                    href={`/organizations/${login}/sync/${job.id}`}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{job.year}년</p>
                        <p className="text-sm text-muted-foreground">
                          {job.createdAt.toLocaleDateString("ko-KR", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium capitalize">{job.status}</p>
                      {progress?.totalCommits && (
                        <p className="text-xs text-muted-foreground">
                          {progress.totalCommits.toLocaleString()} 커밋
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <RefreshCw className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="mb-2 font-medium">아직 동기화 기록이 없습니다</p>
              <p className="mb-4 text-sm text-muted-foreground">
                첫 번째 커밋 동기화를 시작해보세요!
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
    </div>
  );
}
