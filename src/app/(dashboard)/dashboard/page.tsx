import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getUser } from "@/lib/session";
import {
  Plus,
  Building2,
  BarChart3,
  FileText,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

// 임시 데이터 (실제로는 DB에서 가져옴)
const recentRuns = [
  {
    id: "1",
    orgName: "studiobaton",
    year: 2024,
    status: "DONE",
    createdAt: "2024-12-01",
    userCount: 5,
  },
  {
    id: "2",
    orgName: "studiobaton",
    year: 2023,
    status: "DONE",
    createdAt: "2023-12-15",
    userCount: 4,
  },
];

const statusConfig = {
  QUEUED: { label: "대기중", variant: "secondary" as const, icon: Clock },
  SCANNING_REPOS: { label: "저장소 스캔", variant: "default" as const, icon: Clock },
  SCANNING_COMMITS: { label: "커밋 수집", variant: "default" as const, icon: Clock },
  BUILDING_UNITS: { label: "분석중", variant: "default" as const, icon: Clock },
  REVIEWING: { label: "AI 리뷰", variant: "default" as const, icon: Clock },
  FINALIZING: { label: "완료 중", variant: "default" as const, icon: Clock },
  DONE: { label: "완료", variant: "outline" as const, icon: CheckCircle2 },
  FAILED: { label: "실패", variant: "destructive" as const, icon: AlertCircle },
};

export default async function DashboardPage() {
  const user = await getUser();

  return (
    <div className="container py-8 px-4">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">안녕하세요, {user?.name || user?.login}님</h1>
        <p className="mt-2 text-muted-foreground">
          팀의 코드 기여를 분석하고 연간 리포트를 생성하세요.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Card className="hover:border-primary/50 transition-colors">
          <Link href="/analysis/new">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">새 분석 실행</CardTitle>
              <Plus className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">시작하기</p>
              <p className="text-xs text-muted-foreground">
                조직과 연도를 선택하여 분석을 시작합니다
              </p>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <Link href="/organizations">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">조직 관리</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">조직 설정</p>
              <p className="text-xs text-muted-foreground">
                GitHub App 설치 및 팀 설정을 관리합니다
              </p>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <Link href="/reports">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">리포트 조회</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">리포트</p>
              <p className="text-xs text-muted-foreground">
                생성된 연간 리포트를 확인합니다
              </p>
            </CardContent>
          </Link>
        </Card>
      </div>

      {/* Recent Analysis Runs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>최근 분석</CardTitle>
            <CardDescription>최근 실행한 분석 목록입니다.</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/analysis">
              전체 보기
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentRuns.length > 0 ? (
            <div className="space-y-4">
              {recentRuns.map((run) => {
                const status = statusConfig[run.status as keyof typeof statusConfig];
                const StatusIcon = status.icon;
                return (
                  <Link
                    key={run.id}
                    href={`/analysis/${run.id}`}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <BarChart3 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {run.orgName} - {run.year}년 분석
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {run.userCount}명 분석 · {run.createdAt}
                        </p>
                      </div>
                    </div>
                    <Badge variant={status.variant}>
                      <StatusIcon className="mr-1 h-3 w-3" />
                      {status.label}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <BarChart3 className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">아직 분석 기록이 없습니다.</p>
              <Button className="mt-4" asChild>
                <Link href="/analysis/new">
                  <Plus className="mr-2 h-4 w-4" />
                  첫 분석 시작하기
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

