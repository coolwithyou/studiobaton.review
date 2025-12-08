import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch, Shield, Lock } from "lucide-react";
import { isAuthenticated } from "@/lib/session";

export default async function LoginPage() {
  // 이미 로그인된 경우 대시보드로 리다이렉트
  if (await isAuthenticated()) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <GitBranch className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Code Review에 로그인</CardTitle>
          <CardDescription>
            GitHub 계정으로 로그인하여 팀의 코드 기여를 분석하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" size="lg" asChild>
            <Link href="/api/auth/github">
              <GitBranch className="mr-2 h-5 w-5" />
              GitHub로 계속하기
            </Link>
          </Button>

          <div className="space-y-3 rounded-lg bg-muted p-4 text-sm">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium">안전한 OAuth 인증</p>
                <p className="text-muted-foreground">
                  비밀번호를 저장하지 않습니다. GitHub에서 직접 인증합니다.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium">읽기 전용 접근</p>
                <p className="text-muted-foreground">
                  코드를 수정하거나 삭제하지 않습니다. 읽기 권한만 요청합니다.
                </p>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            로그인하면{" "}
            <Link href="/terms" className="underline hover:text-foreground">
              이용약관
            </Link>
            과{" "}
            <Link href="/privacy" className="underline hover:text-foreground">
              개인정보처리방침
            </Link>
            에 동의하는 것으로 간주합니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

