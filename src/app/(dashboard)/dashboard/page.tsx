import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Settings, CheckCircle2, XCircle, ExternalLink, Loader2 } from "lucide-react";
import { getUser } from "@/lib/session";
import { getUserOrganizations } from "@/lib/github";
import { db } from "@/lib/db";
import { OrganizationMessages } from "@/components/organization/organization-messages";
import { UnregisteredOrgCard } from "@/components/organization/unregistered-org-card";

interface DbOrganization {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  installationId: number | null;
  _count: {
    repos: number;
    members: number;
  };
}

interface GitHubOrg {
  id: number;
  login: string;
  avatarUrl: string;
  description: string | null;
}

async function getOrganizationsData() {
  const user = await getUser();
  if (!user) return { dbOrgs: [], githubOrgs: [] };

  // 1. DB에서 사용자가 속한 조직 조회
  const dbOrgs = await db.organization.findMany({
    where: {
      members: {
        some: { userId: user.id },
      },
    },
    include: {
      _count: {
        select: { repos: true, members: true },
      },
    },
    orderBy: { login: "asc" },
  });

  // 조직이 1개만 있으면 자동으로 해당 조직 대시보드로 리다이렉트
  if (dbOrgs.length === 1) {
    redirect(`/organizations/${dbOrgs[0].login}`);
  }

  // 2. GitHub API로 사용자의 조직 목록 조회 (미등록 조직 표시용)
  let githubOrgs: GitHubOrg[] = [];
  try {
    githubOrgs = await getUserOrganizations(user.accessToken);
  } catch (error) {
    console.error("Error fetching GitHub orgs:", error);
  }

  return { dbOrgs, githubOrgs };
}

function OrganizationCard({ org }: { org: DbOrganization }) {
  const hasInstallation = !!org.installationId;
  const githubAppInstallUrl = `https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || "code-review-app"}/installations/new`;

  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="flex flex-row items-center gap-4">
        <Avatar className="h-12 w-12">
          <AvatarImage src={org.avatarUrl || undefined} />
          <AvatarFallback>{org.login.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <CardTitle className="text-lg">{org.name || org.login}</CardTitle>
          <CardDescription>@{org.login}</CardDescription>
        </div>
        {hasInstallation ? (
          <Badge variant="outline" className="text-green-600">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            연결됨
          </Badge>
        ) : (
          <Badge variant="outline" className="text-destructive">
            <XCircle className="mr-1 h-3 w-3" />
            미연결
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{org._count.members}명 멤버</span>
          <span>{org._count.repos}개 저장소</span>
        </div>
        <div className="mt-4 flex gap-2">
          {hasInstallation ? (
            <>
              <Button variant="outline" size="sm" className="flex-1" asChild>
                <Link href={`/organizations/${org.login}/settings`}>
                  <Settings className="mr-2 h-4 w-4" />
                  설정
                </Link>
              </Button>
              <Button size="sm" className="flex-1" asChild>
                <Link href={`/organizations/${org.login}/analysis/new`}>
                  분석 시작
                </Link>
              </Button>
            </>
          ) : (
            <Button size="sm" className="w-full" asChild>
              <a href={githubAppInstallUrl} target="_blank" rel="noopener noreferrer">
                GitHub App 설치
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


async function OrganizationsList() {
  const { dbOrgs, githubOrgs } = await getOrganizationsData();
  const registeredLogins = new Set(dbOrgs.map((org) => org.login));
  const unregisteredOrgs = githubOrgs.filter((org) => !registeredLogins.has(org.login));
  const githubAppInstallUrl = `https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || "code-review-app"}/installations/new`;

  return (
    <>
      {dbOrgs.length > 0 ? (
        <>
          <h2 className="mb-4 text-lg font-semibold">조직 선택</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
            {dbOrgs.map((org) => (
              <OrganizationCard key={org.id} org={org} />
            ))}
          </div>
        </>
      ) : (
        <Card className="mb-8">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="mb-4 rounded-full bg-muted p-4">
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">등록된 조직이 없습니다</h3>
            <p className="mb-4 text-center text-muted-foreground">
              GitHub App을 설치하여 조직을 등록하세요.
            </p>
            <Button asChild>
              <a href={githubAppInstallUrl} target="_blank" rel="noopener noreferrer">
                <Plus className="mr-2 h-4 w-4" />
                조직 추가하기
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {unregisteredOrgs.length > 0 && (
        <>
          <h2 className="mb-4 text-lg font-semibold text-muted-foreground">
            GitHub에서 가져온 조직 (미등록)
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {unregisteredOrgs.map((org) => (
              <UnregisteredOrgCard key={org.id} org={org} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default async function DashboardPage() {
  const githubAppInstallUrl = `https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || "code-review-app"}/installations/new`;

  return (
    <div className="container py-8 px-4">
      {/* 메시지 표시 (설치 성공/실패 등) */}
      <OrganizationMessages />

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">대시보드</h1>
          <p className="mt-2 text-muted-foreground">
            조직을 선택하여 분석을 시작하세요.
          </p>
        </div>
        <Button asChild>
          <a href={githubAppInstallUrl} target="_blank" rel="noopener noreferrer">
            <Plus className="mr-2 h-4 w-4" />
            조직 추가
            <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>

      <Suspense fallback={<LoadingState />}>
        <OrganizationsList />
      </Suspense>

      {/* 안내 섹션 */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>GitHub App 설치 안내</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="mb-2 text-2xl font-bold">1</div>
              <h4 className="mb-1 font-medium">App 설치</h4>
              <p className="text-sm text-muted-foreground">
                GitHub App 설치 페이지에서 조직을 선택합니다.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="mb-2 text-2xl font-bold">2</div>
              <h4 className="mb-1 font-medium">권한 승인</h4>
              <p className="text-sm text-muted-foreground">
                저장소 읽기 권한만 요청합니다. 코드 수정 권한은 없습니다.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="mb-2 text-2xl font-bold">3</div>
              <h4 className="mb-1 font-medium">분석 시작</h4>
              <p className="text-sm text-muted-foreground">
                설치 완료 후 바로 코드 분석을 시작할 수 있습니다.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
