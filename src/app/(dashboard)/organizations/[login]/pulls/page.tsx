import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import {
  ArrowLeft,
  GitPullRequest,
  GitMerge,
  XCircle,
  Clock,
  ExternalLink,
  Users,
  FolderGit2,
} from "lucide-react";

async function getPRData(orgLogin: string, userId: string) {
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

  // PR 상태별 카운트
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
    total: prsByState.reduce((acc, p) => acc + p._count.id, 0),
    open: prsByState.find((p) => p.state === "open")?._count.id || 0,
    closed: prsByState.find((p) => p.state === "closed")?._count.id || 0,
    merged: prsByState.find((p) => p.state === "merged")?._count.id || 0,
  };

  // 작성자별 PR 수 (상위 10명)
  const topAuthors = await db.pullRequest.groupBy({
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

  // 저장소별 PR 수 (상위 10개)
  const prsByRepo = await db.pullRequest.groupBy({
    by: ["repoId"],
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

  // 저장소 이름 조회
  const repoIds = prsByRepo.map((p) => p.repoId);
  const repos = await db.repository.findMany({
    where: { id: { in: repoIds } },
    select: { id: true, name: true },
  });

  const repoMap = new Map(repos.map((r) => [r.id, r.name]));
  const topRepos = prsByRepo.map((p) => ({
    repoId: p.repoId,
    repoName: repoMap.get(p.repoId) || "Unknown",
    count: p._count.id,
  }));

  // 전체 PR 목록 (최신순, 100개 제한)
  const allPRs = await db.pullRequest.findMany({
    where: {
      repo: { orgId: org.id },
    },
    include: {
      repo: {
        select: { name: true, fullName: true },
      },
      _count: {
        select: { commits: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // 상태별 PR 목록
  const openPRs = allPRs.filter((pr) => pr.state === "open");
  const mergedPRs = allPRs.filter((pr) => pr.state === "merged");
  const closedPRs = allPRs.filter((pr) => pr.state === "closed");

  return {
    org,
    prStats,
    topAuthors,
    topRepos,
    allPRs,
    openPRs,
    mergedPRs,
    closedPRs,
  };
}

function PRCard({ pr, orgLogin }: { pr: any; orgLogin: string }) {
  const stateConfig = {
    open: { icon: Clock, color: "text-green-600", bgColor: "bg-green-500/10" },
    merged: { icon: GitMerge, color: "text-purple-600", bgColor: "bg-purple-500/10" },
    closed: { icon: XCircle, color: "text-red-600", bgColor: "bg-red-500/10" },
  };

  const config = stateConfig[pr.state as keyof typeof stateConfig] || stateConfig.closed;
  const StateIcon = config.icon;

  return (
    <div className="flex items-start gap-4 rounded-lg border p-4 hover:bg-muted/50 transition-colors">
      <div className={`p-2 rounded-lg ${config.bgColor}`}>
        <StateIcon className={`h-5 w-5 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="font-medium truncate">{pr.title}</h4>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-medium">{pr.repo.name}</span>
              {" "}#{pr.number} · {pr.authorLogin}
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
          >
            {pr.state}
          </Badge>
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span>{pr._count.commits} 커밋</span>
          <span>{pr.baseBranch} ← {pr.headBranch}</span>
          <span>
            {new Date(pr.createdAt).toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
          {pr.mergedAt && (
            <span className="text-purple-600">
              {new Date(pr.mergedAt).toLocaleDateString("ko-KR")} 병합됨
            </span>
          )}
        </div>
      </div>
      <a
        href={`https://github.com/${pr.repo.fullName}/pull/${pr.number}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-primary"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}

export default async function PullRequestsPage({
  params,
}: {
  params: Promise<{ login: string }>;
}) {
  const { login } = await params;
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }

  const { org, prStats, topAuthors, topRepos, allPRs, openPRs, mergedPRs, closedPRs } = await getPRData(login, user.id);

  return (
    <div className="container py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href={`/organizations/${login}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            대시보드로
          </Link>
        </Button>

        <h1 className="text-3xl font-bold">Pull Requests</h1>
        <p className="mt-2 text-muted-foreground">
          {org.name || org.login} 조직의 PR 현황 및 통계
        </p>
      </div>

      {/* Stats Overview */}
      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">전체 PR</CardTitle>
            <GitPullRequest className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{prStats.total.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Open</CardTitle>
            <Clock className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{prStats.open.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Merged</CardTitle>
            <GitMerge className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-purple-600">{prStats.merged.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Closed</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{prStats.closed.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Authors & Repos */}
      <div className="mb-8 grid gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              PR 작성자 순위
            </CardTitle>
            <CardDescription>PR 수 기준 상위 작성자</CardDescription>
          </CardHeader>
          <CardContent>
            {topAuthors.length > 0 ? (
              <div className="space-y-3">
                {topAuthors.map((author, index) => (
                  <div key={author.authorLogin} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-6">#{index + 1}</span>
                      <span className="font-medium">{author.authorLogin}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {author._count.id.toLocaleString()} PRs
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">데이터가 없습니다.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderGit2 className="h-5 w-5" />
              저장소별 PR
            </CardTitle>
            <CardDescription>PR 수 기준 상위 저장소</CardDescription>
          </CardHeader>
          <CardContent>
            {topRepos.length > 0 ? (
              <div className="space-y-3">
                {topRepos.map((repo, index) => (
                  <div key={repo.repoId} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-6">#{index + 1}</span>
                      <span className="font-medium">{repo.repoName}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {repo.count.toLocaleString()} PRs
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">데이터가 없습니다.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* PR List by Status */}
      <Card>
        <CardHeader>
          <CardTitle>PR 목록</CardTitle>
          <CardDescription>상태별 PR 목록 (최근 100개)</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList>
              <TabsTrigger value="all">
                전체 ({allPRs.length})
              </TabsTrigger>
              <TabsTrigger value="open">
                Open ({openPRs.length})
              </TabsTrigger>
              <TabsTrigger value="merged">
                Merged ({mergedPRs.length})
              </TabsTrigger>
              <TabsTrigger value="closed">
                Closed ({closedPRs.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              {allPRs.length > 0 ? (
                <div className="space-y-3">
                  {allPRs.map((pr) => (
                    <PRCard key={pr.id} pr={pr} orgLogin={login} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <GitPullRequest className="mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="font-medium">수집된 PR이 없습니다</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    커밋 동기화를 실행하면 PR도 함께 수집됩니다.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="open">
              {openPRs.length > 0 ? (
                <div className="space-y-3">
                  {openPRs.map((pr) => (
                    <PRCard key={pr.id} pr={pr} orgLogin={login} />
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-12">열린 PR이 없습니다.</p>
              )}
            </TabsContent>

            <TabsContent value="merged">
              {mergedPRs.length > 0 ? (
                <div className="space-y-3">
                  {mergedPRs.map((pr) => (
                    <PRCard key={pr.id} pr={pr} orgLogin={login} />
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-12">병합된 PR이 없습니다.</p>
              )}
            </TabsContent>

            <TabsContent value="closed">
              {closedPRs.length > 0 ? (
                <div className="space-y-3">
                  {closedPRs.map((pr) => (
                    <PRCard key={pr.id} pr={pr} orgLogin={login} />
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-12">닫힌 PR이 없습니다.</p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

