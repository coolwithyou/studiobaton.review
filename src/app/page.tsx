import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { getUser } from "@/lib/session";
import {
  GitBranch,
  BarChart3,
  Users,
  FileCode,
  Sparkles,
  Shield,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";

const features = [
  {
    icon: GitBranch,
    title: "커밋 기반 분석",
    description: "PR 리뷰 없이도 커밋 히스토리만으로 의미 있는 기여도를 분석합니다.",
  },
  {
    icon: Sparkles,
    title: "AI 코드 리뷰",
    description: "GPT-4o/Claude가 대표 작업을 분석하여 강점, 리스크, 개선점을 제안합니다.",
  },
  {
    icon: BarChart3,
    title: "Work Unit 클러스터링",
    description: "개별 커밋이 아닌 '작업 단위'로 묶어 의미 있는 평가가 가능합니다.",
  },
  {
    icon: TrendingUp,
    title: "연도별 비교",
    description: "매년 같은 기준으로 분석하여 개인의 성장 추세를 추적합니다.",
  },
  {
    icon: Shield,
    title: "임팩트 스코어링",
    description: "LoC 외에 핵심 모듈, 핫스팟, 리스크 영역 등 맥락을 반영합니다.",
  },
  {
    icon: Users,
    title: "팀 협업",
    description: "매니저가 리포트를 검토/확정하고 팀 기준을 커스터마이징할 수 있습니다.",
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
    title: "분석 실행",
    description: "연도와 팀원을 선택하고 분석을 시작합니다. 진행률을 실시간으로 확인할 수 있습니다.",
  },
  {
    step: 3,
    title: "리포트 확인",
    description: "AI가 생성한 연간 리포트와 차트를 확인하고, 매니저 코멘트를 추가합니다.",
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
                GitHub 연간 코드 분석 시스템
              </div>
              <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
                팀원의 코드 기여를
                <br />
                <span className="text-primary">AI로 분석</span>하세요
              </h1>
              <p className="mb-8 text-lg text-muted-foreground md:text-xl">
                Organization과 연도만 입력하면, 전체 저장소를 순회하며
                <br className="hidden sm:inline" />
                커밋 기반으로 기여도와 코드 품질을 분석하여 연간 리포트를 생성합니다.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
                {user ? (
                  <Button size="lg" asChild>
                    <Link href="/dashboard">
                      <BarChart3 className="mr-2 h-5 w-5" />
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
                PR 리뷰 문화가 약한 팀도 커밋 기반으로 의미 있는 코드 분석이 가능합니다.
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
                3단계만으로 팀원의 연간 코드 기여 리포트를 생성할 수 있습니다.
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
                무료로 시작하고, 팀의 코드 기여를 체계적으로 관리하세요.
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
