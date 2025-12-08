import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  BarChart3,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

// 임시 데이터
const analysisRuns = [
  {
    id: "1",
    orgName: "studiobaton",
    year: 2024,
    status: "DONE",
    createdAt: new Date("2024-12-01"),
    finishedAt: new Date("2024-12-01"),
    userCount: 5,
    totalCommits: 1234,
    totalWorkUnits: 48,
  },
  {
    id: "2",
    orgName: "studiobaton",
    year: 2023,
    status: "DONE",
    createdAt: new Date("2023-12-15"),
    finishedAt: new Date("2023-12-15"),
    userCount: 4,
    totalCommits: 987,
    totalWorkUnits: 36,
  },
  {
    id: "3",
    orgName: "studiobaton",
    year: 2024,
    status: "FAILED",
    createdAt: new Date("2024-11-20"),
    finishedAt: null,
    userCount: 5,
    totalCommits: 0,
    totalWorkUnits: 0,
    error: "Rate limit exceeded",
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

export default function AnalysisListPage() {
  return (
    <div className="container py-8 px-4">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">분석 목록</h1>
          <p className="mt-2 text-muted-foreground">
            실행한 분석 내역을 확인하고 관리합니다.
          </p>
        </div>
        <Button asChild>
          <Link href="/analysis/new">
            <Plus className="mr-2 h-4 w-4" />
            새 분석 실행
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>분석 기록</CardTitle>
          <CardDescription>
            조직별, 연도별 분석 실행 기록입니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analysisRuns.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>조직 / 연도</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">사용자</TableHead>
                  <TableHead className="text-right">커밋</TableHead>
                  <TableHead className="text-right">작업 묶음</TableHead>
                  <TableHead>실행일</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysisRuns.map((run) => {
                  const status = statusConfig[run.status as keyof typeof statusConfig];
                  const StatusIcon = status.icon;
                  return (
                    <TableRow key={run.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{run.orgName}</span>
                          <span className="text-muted-foreground">{run.year}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{run.userCount}명</TableCell>
                      <TableCell className="text-right">
                        {run.totalCommits.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">{run.totalWorkUnits}</TableCell>
                      <TableCell>
                        {format(run.createdAt, "yyyy.MM.dd", { locale: ko })}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/analysis/${run.id}`}>
                            상세
                            <ArrowRight className="ml-1 h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <BarChart3 className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="mb-4 text-muted-foreground">아직 분석 기록이 없습니다.</p>
              <Button asChild>
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

