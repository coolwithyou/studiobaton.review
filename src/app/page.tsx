import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { getUser } from "@/lib/session";
import {
  GitBranch,
  Database,
  Users,
  FileCode,
  RefreshCw,
  Shield,
  FolderGit2,
  CheckCircle2,
} from "lucide-react";

const features = [
  {
    icon: GitBranch,
    title: "커밋 데이터 수집",
    description: "조직의 모든 저장소에서 커밋 히스토리를 자동으로 수집하고 저장합니다.",
  },
  {
    icon: Database,
    title: "체계적인 데이터 관리",
    description: "커밋, 파일 변경, PR 정보를 구조화하여 효율적으로 관리합니다.",
  },
  {
    icon: FolderGit2,
    title: "다중 저장소 지원",
    description: "조직의 모든 저장소를 한 번에 관리하고 통합된 뷰를 제공합니다.",
  },
  {
    icon: RefreshCw,
    title: "자동 동기화",
    description: "연도별로 커밋 데이터를 자동으로 수집하고 최신 상태를 유지합니다.",
  },
  {
    icon: Shield,
    title: "안전한 접근",
    description: "GitHub App을 통한 안전한 인증과 최소 권한 원칙을 따릅니다.",
  },
  {
    icon: Users,
    title: "팀 협업",
    description: "조직 멤버를 관리하고 기여자별 커밋 통계를 확인할 수 있습니다.",
  },
];

const steps = [
  {
    step: 1,
    title: "GitHub 연동",
    description: "GitHub App을 조직에 설치하여 저장소 접근 권한을 부여합니다.",
  },
  {
    step: 2,
    title: "커밋 수집",
    description: "연도를 선택하고 커밋 동기화를 시작합니다. 진행 상황을 실시간으로 확인할 수 있습니다.",
  },
  {
    step: 3,
    title: "데이터 관리",
    description: "수집된 커밋 데이터와 통계를 확인하고 관리합니다.",
  },
];

export default async function HomePage() {
  const user = await getUser();

  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user} />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-20 md:py-32">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px]" />
          <div className="container px-4">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-4 inline-flex items-center rounded-full border px-4 py-1.5 text-sm">
                <FileCode className="mr-2 h-4 w-4" />
                GitHub 커밋 데이터 수집 시스템
              </div>
              <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
                조직의 커밋 데이터를
                <br />
                <span className="text-primary">체계적으로</span> 관리하세요
              </h1>
              <p className="mb-8 text-lg text-muted-foreground md:text-xl">
                조직을 연동하면 모든 저장소의 커밋 히스토리를 자동으로 수집하고
                <br className="hidden sm:inline" />
                구조화된 데이터로 저장하여 다양한 분석에 활용할 수 있습니다.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
                {user ? (
                  <Button size="lg" asChild>
                    <Link href="/dashboard">
                      <Database className="mr-2 h-5 w-5" />
                      대시보드로 이동
                    </Link>
                  </Button>
                ) : (
                  <Button size="lg" asChild>
                    <Link href="/login">
                      <GitBranch className="mr-2 h-5 w-5" />
                      GitHub로 시작하기
                    </Link>
                  </Button>
                )}
                <Button size="lg" variant="outline" asChild>
                  <Link href="/help">자세히 알아보기</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="border-t bg-muted/30 py-20">
          <div className="container px-4">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="mb-4 text-3xl font-bold">주요 기능</h2>
              <p className="text-muted-foreground">
                조직의 모든 커밋 데이터를 안전하게 수집하고 효율적으로 관리합니다.
              </p>
            </div>
            <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card key={feature.title} className="border-0 bg-background">
                    <CardHeader>
                      <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-sm">
                        {feature.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-20">
          <div className="container px-4">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="mb-4 text-3xl font-bold">사용 방법</h2>
              <p className="text-muted-foreground">
                3단계만으로 조직의 커밋 데이터 수집을 시작할 수 있습니다.
              </p>
            </div>
            <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-3">
              {steps.map((item) => (
                <div key={item.step} className="text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                    {item.step}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="border-t bg-muted/30 py-20">
          <div className="container px-4">
            <div className="mx-auto max-w-2xl text-center">
              <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-primary" />
              <h2 className="mb-4 text-3xl font-bold">지금 시작하세요</h2>
              <p className="mb-8 text-muted-foreground">
                무료로 시작하고, 조직의 커밋 데이터를 체계적으로 관리하세요.
              </p>
              {!user && (
                <Button size="lg" asChild>
                  <Link href="/login">
                    <GitBranch className="mr-2 h-5 w-5" />
                    GitHub로 시작하기
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
