import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Settings, CheckCircle2, XCircle, ExternalLink } from "lucide-react";

// 임시 데이터 (실제로는 DB + GitHub API에서 조회)
const organizations = [
  {
    id: "1",
    login: "studiobaton",
    name: "Studio Baton",
    avatarUrl: null,
    hasInstallation: true,
    memberCount: 5,
    repoCount: 12,
  },
];

export default function OrganizationsPage() {
  const githubAppInstallUrl = `https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG}/installations/new`;

  return (
    <div className="container py-8 px-4">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">조직 관리</h1>
          <p className="mt-2 text-muted-foreground">
            GitHub App을 설치하여 조직의 저장소에 접근할 수 있습니다.
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

      {organizations.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => (
            <Card key={org.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-center gap-4">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={org.avatarUrl || undefined} />
                  <AvatarFallback>{org.login.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <CardTitle className="text-lg">{org.name || org.login}</CardTitle>
                  <CardDescription>@{org.login}</CardDescription>
                </div>
                {org.hasInstallation ? (
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
                  <span>{org.memberCount}명 멤버</span>
                  <span>{org.repoCount}개 저장소</span>
                </div>
                <div className="mt-4 flex gap-2">
                  {org.hasInstallation ? (
                    <>
                      <Button variant="outline" size="sm" className="flex-1" asChild>
                        <Link href={`/organizations/${org.login}`}>
                          <Settings className="mr-2 h-4 w-4" />
                          설정
                        </Link>
                      </Button>
                      <Button size="sm" className="flex-1" asChild>
                        <Link href={`/analysis/new?org=${org.login}`}>
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
          ))}
        </div>
      ) : (
        <Card>
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

