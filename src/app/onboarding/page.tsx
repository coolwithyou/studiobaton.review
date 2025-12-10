"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Github,
  Building2,
  Users,
  BarChart3,
  Sparkles,
  ExternalLink,
  Loader2,
} from "lucide-react";

const TOTAL_STEPS = 5;

interface StepProps {
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
}

function WelcomeStep({ onNext }: StepProps) {
  return (
    <div className="text-center space-y-6">
      <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
        <Sparkles className="h-10 w-10 text-primary" />
      </div>
      <div>
        <h2 className="text-2xl font-bold">Code Review에 오신 것을 환영합니다!</h2>
        <p className="mt-2 text-muted-foreground">
          팀의 코드 기여를 분석하고 AI 기반 연간 리포트를 생성하세요.
          몇 가지 간단한 설정만으로 시작할 수 있습니다.
        </p>
      </div>
      <div className="grid gap-4 text-left max-w-md mx-auto">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
          <div>
            <p className="font-medium">커밋 기반 분석</p>
            <p className="text-sm text-muted-foreground">
              PR 리뷰 없이도 커밋만으로 의미 있는 분석
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
          <div>
            <p className="font-medium">AI 코드 리뷰</p>
            <p className="text-sm text-muted-foreground">
              GPT-4o/Claude가 강점과 개선점을 분석
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
          <div>
            <p className="font-medium">연간 리포트</p>
            <p className="text-sm text-muted-foreground">
              팀원별 성과를 체계적으로 정리
            </p>
          </div>
        </div>
      </div>
      <Button onClick={onNext} size="lg">
        시작하기
        <ChevronRight className="ml-2 h-5 w-5" />
      </Button>
    </div>
  );
}

function InstallAppStep({ onNext, onBack }: StepProps) {
  const githubAppInstallUrl = `https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || "code-review-app"}/installations/new`;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Github className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">GitHub App 설치</h2>
        <p className="mt-2 text-muted-foreground">
          조직의 저장소에 접근하려면 GitHub App을 설치해야 합니다.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                1
              </div>
              <div>
                <p className="font-medium">Install 버튼 클릭</p>
                <p className="text-sm text-muted-foreground">
                  아래 버튼을 클릭하면 GitHub으로 이동합니다.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                2
              </div>
              <div>
                <p className="font-medium">조직 선택</p>
                <p className="text-sm text-muted-foreground">
                  분석할 조직을 선택하세요.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                3
              </div>
              <div>
                <p className="font-medium">권한 승인</p>
                <p className="text-sm text-muted-foreground">
                  읽기 전용 권한만 요청합니다. 코드 수정 권한은 없습니다.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col items-center gap-4">
        <Button asChild size="lg">
          <a href={githubAppInstallUrl} target="_blank" rel="noopener noreferrer">
            <Github className="mr-2 h-5 w-5" />
            GitHub App 설치하기
            <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
        <p className="text-sm text-muted-foreground">
          설치 완료 후 아래 버튼을 클릭하세요.
        </p>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          이전
        </Button>
        <Button onClick={onNext}>
          설치 완료, 다음으로
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface Organization {
  id: string;
  login: string;
  name: string | null;
  hasInstallation: boolean;
}

function SelectOrgStep({ onNext, onBack }: StepProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        const res = await fetch("/api/organizations");
        const data = await res.json();
        setOrganizations(data.organizations?.filter((o: Organization) => o.hasInstallation) || []);
      } catch (error) {
        console.error("Error fetching orgs:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrgs();
  }, []);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Building2 className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">조직 확인</h2>
        <p className="mt-2 text-muted-foreground">
          GitHub App이 설치된 조직이 표시됩니다.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : organizations.length > 0 ? (
        <div className="space-y-2">
          {organizations.map((org) => (
            <div
              key={org.id}
              className={`flex items-center justify-between rounded-lg border p-4 cursor-pointer transition-colors ${
                selectedOrg === org.login
                  ? "border-primary bg-primary/5"
                  : "hover:border-primary/50"
              }`}
              onClick={() => setSelectedOrg(org.login)}
            >
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{org.name || org.login}</p>
                  <p className="text-sm text-muted-foreground">@{org.login}</p>
                </div>
              </div>
              {selectedOrg === org.login && (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              )}
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground mb-4">
              아직 설치된 조직이 없습니다.
            </p>
            <Button variant="outline" onClick={onBack}>
              GitHub App 설치로 돌아가기
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          이전
        </Button>
        <Button onClick={onNext} disabled={!selectedOrg && organizations.length > 0}>
          다음
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function FirstAnalysisStep({ onNext, onBack }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <BarChart3 className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">첫 분석 실행</h2>
        <p className="mt-2 text-muted-foreground">
          이제 첫 번째 분석을 실행할 준비가 되었습니다!
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">분석 과정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">
              1
            </div>
            <div>
              <p className="font-medium">저장소 스캔</p>
              <p className="text-sm text-muted-foreground">
                조직의 모든 저장소를 스캔합니다.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">
              2
            </div>
            <div>
              <p className="font-medium">커밋 수집</p>
              <p className="text-sm text-muted-foreground">
                선택한 연도의 커밋을 수집합니다.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-600">
              3
            </div>
            <div>
              <p className="font-medium">AI 분석</p>
              <p className="text-sm text-muted-foreground">
                AI가 코드를 분석하고 피드백을 생성합니다.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-600">
              4
            </div>
            <div>
              <p className="font-medium">리포트 생성</p>
              <p className="text-sm text-muted-foreground">
                팀원별 연간 리포트가 생성됩니다.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground text-center">
        분석은 조직 규모에 따라 5-15분 정도 소요됩니다.
      </p>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          이전
        </Button>
        <Button onClick={onNext}>
          다음
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function CompletionStep({ onSkip }: StepProps) {
  const router = useRouter();

  const handleGoToAnalysis = () => {
    router.push("/analysis/new");
  };

  const handleGoToDashboard = () => {
    router.push("/dashboard");
  };

  return (
    <div className="text-center space-y-6">
      <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
      </div>
      <div>
        <h2 className="text-2xl font-bold">준비 완료!</h2>
        <p className="mt-2 text-muted-foreground">
          모든 설정이 완료되었습니다. 이제 첫 분석을 시작해보세요.
        </p>
      </div>

      <div className="flex flex-col gap-3 max-w-xs mx-auto">
        <Button onClick={handleGoToAnalysis} size="lg">
          <BarChart3 className="mr-2 h-5 w-5" />
          첫 분석 시작하기
        </Button>
        <Button variant="outline" onClick={handleGoToDashboard}>
          대시보드로 이동
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        도움이 필요하시면{" "}
        <Link href="/help" className="text-primary hover:underline">
          도움말
        </Link>
        을 참고하세요.
      </p>
    </div>
  );
}

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const router = useRouter();

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    router.push("/dashboard");
  };

  const progress = (currentStep / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container max-w-2xl py-8 px-4">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              {currentStep} / {TOTAL_STEPS}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSkip}>
              건너뛰기
            </Button>
          </div>
          <Progress value={progress} />
        </div>

        {/* Content */}
        <Card>
          <CardContent className="pt-6">
            {currentStep === 1 && <WelcomeStep onNext={handleNext} />}
            {currentStep === 2 && (
              <InstallAppStep onNext={handleNext} onBack={handleBack} />
            )}
            {currentStep === 3 && (
              <SelectOrgStep onNext={handleNext} onBack={handleBack} />
            )}
            {currentStep === 4 && (
              <FirstAnalysisStep onNext={handleNext} onBack={handleBack} />
            )}
            {currentStep === 5 && (
              <CompletionStep onNext={handleNext} onSkip={handleSkip} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

