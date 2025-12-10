import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import {
  ArrowLeft,
  Building2,
  GitBranch,
  Users,
  Settings,
  BarChart3,
  CheckCircle2,
  XCircle,
  Lock,
  Globe,
  Archive,
} from "lucide-react";
import { OrganizationSettingsForm } from "@/components/organization/organization-settings-form";
import { OrganizationMembersList } from "@/components/organization/organization-members-list";

interface OrgSettings {
  criticalPaths?: Array<{ pattern: string; weight: number }>;
  excludedRepos?: string[];
  defaultLlmModel?: string;
  teamStandards?: string;
}

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ login: string }>;
}) {
  const { login } = await params;
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  const org = await db.organization.findUnique({
    where: { login },
    include: {
      members: {
        where: { userId: user.id },
      },
      repos: {
        orderBy: { name: "asc" },
      },
      _count: {
        select: { repos: true, members: true, analysisRuns: true },
      },
    },
  });

  if (!org) {
    notFound();
  }

  // 멤버십 확인
  if (org.members.length === 0) {
    notFound();
  }

  const isAdmin = org.members[0].role === "ADMIN";
  const settings = (org.settings as OrgSettings) || {};

  return (
    <div className="container py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href="/organizations">
            <ArrowLeft className="mr-2 h-4 w-4" />
            조직 목록
          </Link>
        </Button>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={org.avatarUrl || undefined} />
              <AvatarFallback className="text-xl">
                {org.login.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold">{org.name || org.login}</h1>
              <p className="text-muted-foreground">@{org.login}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {org.installationId ? (
              <Badge variant="outline" className="text-green-600">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                App 연결됨
              </Badge>
            ) : (
              <Badge variant="outline" className="text-destructive">
                <XCircle className="mr-1 h-3 w-3" />
                App 미연결
              </Badge>
            )}
            {isAdmin && (
              <Badge variant="secondary">
                <Settings className="mr-1 h-3 w-3" />
                관리자
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">저장소</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{org._count.repos}개</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">멤버</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{org._count.members}명</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">분석 횟수</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{org._count.analysisRuns}회</div>
          </CardContent>
        </Card>
        <Card className="hover:border-primary/50 transition-colors">
          <Link href={`/analysis/new?org=${org.login}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">새 분석</CardTitle>
              <BarChart3 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">시작하기 →</div>
            </CardContent>
          </Link>
        </Card>
      </div>

      {/* 탭 콘텐츠 */}
      <Tabs defaultValue="repos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="repos">
            <GitBranch className="mr-2 h-4 w-4" />
            저장소
          </TabsTrigger>
          <TabsTrigger value="members">
            <Users className="mr-2 h-4 w-4" />
            멤버
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="settings">
              <Settings className="mr-2 h-4 w-4" />
              설정
            </TabsTrigger>
          )}
        </TabsList>

        {/* 저장소 탭 */}
        <TabsContent value="repos">
          <Card>
            <CardHeader>
              <CardTitle>저장소 목록</CardTitle>
              <CardDescription>
                GitHub App으로 접근 가능한 저장소입니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {org.repos.length > 0 ? (
                <div className="space-y-2">
                  {org.repos.map((repo) => (
                    <div
                      key={repo.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <GitBranch className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{repo.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {repo.description || "설명 없음"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {repo.language && (
                          <Badge variant="outline">{repo.language}</Badge>
                        )}
                        {repo.isArchived && (
                          <Badge variant="secondary">
                            <Archive className="mr-1 h-3 w-3" />
                            아카이브
                          </Badge>
                        )}
                        {repo.isPrivate ? (
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Globe className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  저장소가 없습니다.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 멤버 탭 */}
        <TabsContent value="members">
          <OrganizationMembersList orgLogin={org.login} />
        </TabsContent>

        {/* 설정 탭 (관리자만) */}
        {isAdmin && (
          <TabsContent value="settings">
            <OrganizationSettingsForm
              orgLogin={org.login}
              initialSettings={settings}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

