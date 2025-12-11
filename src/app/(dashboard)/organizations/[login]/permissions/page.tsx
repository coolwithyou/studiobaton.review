import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  Shield,
} from "lucide-react";
import Link from "next/link";
import { PermissionChecker } from "@/components/organization/permission-checker";

export default async function OrganizationPermissionsPage({
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
    },
  });

  if (!org) {
    notFound();
  }

  if (org.members.length === 0) {
    notFound();
  }

  const isAdmin = org.members[0].role === "ADMIN";

  return (
    <div className="container py-8 px-4">
      <div className="mb-8">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href={`/organizations/${login}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            조직으로 돌아가기
          </Link>
        </Button>

        <div className="flex items-center gap-3 mb-4">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">GitHub App 권한 확인</h1>
            <p className="text-muted-foreground">
              {org.name || org.login} (@{org.login})
            </p>
          </div>
        </div>
      </div>

      {!org.installationId ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            GitHub App이 설치되지 않았습니다. 먼저 앱을 설치해주세요.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              시스템이 정상적으로 작동하려면 아래 권한이 필요합니다. 권한이 부족한 경우
              GitHub App 설정에서 권한을 추가해주세요.
            </AlertDescription>
          </Alert>

          <PermissionChecker orgLogin={login} />

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>권한 설정 방법</CardTitle>
              <CardDescription>
                GitHub App 권한을 변경하는 방법입니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h3 className="font-medium">1. GitHub 설정 페이지로 이동</h3>
                <p className="text-sm text-muted-foreground">
                  조직 관리자만 권한을 변경할 수 있습니다.
                </p>
                <Button variant="outline" asChild>
                  <a
                    href={`https://github.com/organizations/${login}/settings/installations`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    GitHub 조직 설정 열기
                  </a>
                </Button>
              </div>

              <div className="space-y-2">
                <h3 className="font-medium">2. GitHub App 찾기</h3>
                <p className="text-sm text-muted-foreground">
                  "Installed GitHub Apps" 섹션에서 이 앱을 찾아 "Configure" 클릭
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-medium">3. 권한 수정</h3>
                <p className="text-sm text-muted-foreground">
                  "Permissions" 섹션에서 필요한 권한 활성화:
                </p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-4">
                  <li>
                    <strong>Contents</strong>: Read-only (필수) - 커밋 정보 읽기
                  </li>
                  <li>
                    <strong>Metadata</strong>: Read-only (필수) - 저장소 메타데이터
                  </li>
                  <li>
                    <strong>Pull requests</strong>: Read-only (권장) - PR 정보 읽기
                  </li>
                  <li>
                    <strong>Members</strong>: Read-only (필수) - 조직 멤버 목록
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="font-medium">4. 변경 사항 저장</h3>
                <p className="text-sm text-muted-foreground">
                  "Save" 버튼을 클릭하여 권한 변경 사항을 저장합니다.
                </p>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  권한 변경 후 이 페이지를 새로고침하여 변경 사항을 확인하세요.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
