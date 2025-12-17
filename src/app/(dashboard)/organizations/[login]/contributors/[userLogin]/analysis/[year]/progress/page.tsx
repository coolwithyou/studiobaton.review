"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  GitCommit,
  Code2,
  FolderGit2,
  Calendar,
  TrendingUp,
  Sparkles,
  FileCode,
  Target,
  Award,
  RefreshCw,
  Pause,
  Play,
  Trash2,
} from "lucide-react";

interface PhaseInfo {
  key: string;
  step: number;
  label: string;
  description: string;
  status: "completed" | "in_progress" | "pending";
  details: any;
}

interface SampledWorkUnit {
  id: string;
  title: string | null;
  summary: string | null;
  workType: string | null;
  impactScore: number;
  repo: {
    fullName: string;
    name: string;
    language: string | null;
  };
  commitCount: number;
  startDate: string;
  endDate: string;
  codeQuality: any;
  analyzed: boolean;
}

interface AnalysisStatusData {
  id: string;
  orgLogin: string;
  orgName: string;
  userLogin: string;
  year: number;
  status: string;
  phase: string | null;
  progress: {
    currentStep: number;
    totalSteps: number;
    message: string;
    percentage: number;
  };
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  phases: PhaseInfo[];
  aiStages: Record<number, any>;
  sampledWorkUnits: SampledWorkUnit[];
  stats: {
    totalWorkUnits: number;
    sampledWorkUnits: number;
    analyzedWorkUnits: number;
    fetchedDiffs: number;
    reports: number;
  };
}

const POLL_INTERVAL = 3000; // 3초마다 폴링

export default function AnalysisProgressPage() {
  const params = useParams();
  const router = useRouter();

  const orgLogin = params.login as string;
  const userLogin = params.userLogin as string;
  const year = parseInt(params.year as string, 10);

  const [data, setData] = useState<AnalysisStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [pauseLoading, setPauseLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 분석 ID 조회
  const fetchAnalysisId = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/organizations/${orgLogin}/contributors/${userLogin}/analysis`
      );
      if (!res.ok) throw new Error("분석 정보 조회 실패");
      
      const analysisData = await res.json();
      const yearAnalysis = analysisData.analyses.find((a: any) => a.year === year);
      
      if (yearAnalysis?.analysisId) {
        setAnalysisId(yearAnalysis.analysisId);
        return yearAnalysis.analysisId;
      }
      return null;
    } catch (err) {
      console.error("Failed to fetch analysis ID:", err);
      return null;
    }
  }, [orgLogin, userLogin, year]);

  // 상태 조회
  const fetchStatus = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`/api/analysis/${runId}/status`);
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "상태 조회 실패");
      }
      
      const statusData: AnalysisStatusData = await res.json();
      setData(statusData);
      setError(null);

      // 완료되면 결과 페이지로 이동
      if (statusData.status === "COMPLETED") {
        setTimeout(() => {
          router.push(`/organizations/${orgLogin}/contributors/${userLogin}/analysis/${year}`);
        }, 2000);
      }

      return statusData;
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
      return null;
    }
  }, [orgLogin, userLogin, year, router]);

  // 초기 로딩 및 폴링
  useEffect(() => {
    let pollTimer: NodeJS.Timeout;
    let mounted = true;

    const init = async () => {
      setLoading(true);
      const id = await fetchAnalysisId();
      
      if (id && mounted) {
        await fetchStatus(id);
        setLoading(false);

        // 폴링 시작 (완료/실패 전까지, 일시 정지 상태에서도 계속)
        const poll = async () => {
          if (!mounted) return;
          
          const status = await fetchStatus(id);
          // PAUSED 상태에서도 폴링 유지 (재개 후 상태 변화 감지)
          if (status && status.status !== "COMPLETED" && status.status !== "FAILED") {
            pollTimer = setTimeout(poll, POLL_INTERVAL);
          }
        };

        pollTimer = setTimeout(poll, POLL_INTERVAL);
      } else {
        setError("분석이 시작되지 않았습니다.");
        setLoading(false);
      }
    };

    init();

    return () => {
      mounted = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [fetchAnalysisId, fetchStatus]);

  const togglePhase = (phaseKey: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phaseKey)) {
        next.delete(phaseKey);
      } else {
        next.add(phaseKey);
      }
      return next;
    });
  };

  // 일시 정지
  const handlePause = async () => {
    if (!analysisId) return;
    
    setPauseLoading(true);
    try {
      const res = await fetch(`/api/analysis/${analysisId}/pause`, {
        method: "POST",
      });
      
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "일시 정지 실패");
      }
      
      // 상태 새로고침
      await fetchStatus(analysisId);
    } catch (err) {
      console.error("Pause error:", err);
      setError(err instanceof Error ? err.message : "일시 정지 실패");
    } finally {
      setPauseLoading(false);
    }
  };

  // 재개
  const handleResume = async () => {
    if (!analysisId) return;

    setPauseLoading(true);
    try {
      const res = await fetch(`/api/analysis/${analysisId}/resume`, {
        method: "POST",
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "재개 실패");
      }

      // 상태 새로고침
      await fetchStatus(analysisId);
    } catch (err) {
      console.error("Resume error:", err);
      setError(err instanceof Error ? err.message : "재개 실패");
    } finally {
      setPauseLoading(false);
    }
  };

  // 삭제
  const handleDelete = async () => {
    if (!analysisId) return;

    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/analysis/${analysisId}/delete`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "삭제 실패");
      }

      // 삭제 완료 후 기여자 페이지로 이동
      router.push(`/organizations/${orgLogin}/contributors/${userLogin}`);
    } catch (err) {
      console.error("Delete error:", err);
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return <ProgressSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="container py-8 px-4 max-w-4xl">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href={`/organizations/${orgLogin}/contributors/${userLogin}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            돌아가기
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
            <p className="text-lg font-medium text-destructive">{error || "데이터를 불러올 수 없습니다."}</p>
            <Button className="mt-4" onClick={() => window.location.reload()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              다시 시도
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isCompleted = data.status === "COMPLETED";
  const isFailed = data.status === "FAILED";
  const isPaused = data.status === "PAUSED";
  const isInProgress = data.status === "IN_PROGRESS";

  return (
    <div className="container py-8 px-4 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href={`/organizations/${orgLogin}/contributors/${userLogin}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            기여자 상세로 돌아가기
          </Link>
        </Button>

        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-lg">
              {userLogin.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">{userLogin} - {year}년 분석</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant={
                  isCompleted ? "default" :
                  isFailed ? "destructive" :
                  isPaused ? "outline" :
                  "secondary"
                }
              >
                {isCompleted && <CheckCircle2 className="mr-1 h-3 w-3" />}
                {isFailed && <AlertCircle className="mr-1 h-3 w-3" />}
                {isPaused && <Pause className="mr-1 h-3 w-3" />}
                {isInProgress && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {isCompleted ? "분석 완료" : isFailed ? "분석 실패" : isPaused ? "일시 정지됨" : "분석 중"}
              </Badge>
              {data.startedAt && (
                <span className="text-sm text-muted-foreground">
                  시작: {new Date(data.startedAt).toLocaleTimeString("ko-KR")}
                </span>
              )}
            </div>
          </div>

          {/* 일시 정지/재개/삭제 버튼 */}
          <div className="ml-auto flex items-center gap-2">
            {isInProgress && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePause}
                disabled={pauseLoading}
              >
                {pauseLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Pause className="mr-2 h-4 w-4" />
                )}
                일시 정지
              </Button>
            )}
            {isPaused && (
              <Button
                variant="default"
                size="sm"
                onClick={handleResume}
                disabled={pauseLoading}
              >
                {pauseLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                재개
              </Button>
            )}
            {/* 삭제 버튼 (진행 중이 아닐 때만 표시) */}
            {!isInProgress && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={deleteLoading}
                  >
                    {deleteLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    삭제
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>분석 데이터 삭제</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="text-sm text-muted-foreground">
                        <p>{userLogin}의 {year}년 분석 데이터를 삭제하시겠습니까?</p>
                        <p className="mt-3">삭제되는 항목:</p>
                        <ul className="list-disc list-inside mt-2">
                          <li>WorkUnit {data?.stats.totalWorkUnits || 0}개</li>
                          <li>AI 리뷰 결과</li>
                          <li>연간 리포트</li>
                        </ul>
                        <p className="mt-3 text-destructive font-medium">
                          이 작업은 되돌릴 수 없습니다.
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      삭제
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      {/* 완료 시 결과 페이지 이동 안내 */}
      {isCompleted && (
        <Card className="mb-6 border-green-500/50 bg-green-500/10">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-300">분석이 완료되었습니다!</p>
                  <p className="text-sm text-muted-foreground">잠시 후 결과 페이지로 이동합니다...</p>
                </div>
              </div>
              <Button asChild>
                <Link href={`/organizations/${orgLogin}/contributors/${userLogin}/analysis/${year}`}>
                  결과 보기
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 실패 시 오류 표시 */}
      {isFailed && data.error && (
        <Card className="mb-6 border-destructive/50 bg-destructive/10">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-destructive flex-shrink-0" />
              <div>
                <p className="font-medium text-destructive">분석 실패</p>
                <p className="text-sm text-muted-foreground">{data.error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 일시 정지 상태 표시 */}
      {isPaused && (
        <Card className="mb-6 border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Pause className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                <div>
                  <p className="font-medium text-yellow-700 dark:text-yellow-300">분석이 일시 정지되었습니다</p>
                  <p className="text-sm text-muted-foreground">
                    현재 단계: {data.phase || "알 수 없음"}
                  </p>
                </div>
              </div>
              <Button onClick={handleResume} disabled={pauseLoading}>
                {pauseLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                분석 재개
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 전체 진행률 */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">전체 진행률</CardTitle>
          <CardDescription>{data.progress.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>단계 {data.progress.currentStep} / {data.progress.totalSteps}</span>
              <span className="font-medium">{data.progress.percentage}%</span>
            </div>
            <Progress value={data.progress.percentage} className="h-3" />
          </div>
        </CardContent>
      </Card>

      {/* 단계별 진행 상황 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">단계별 진행 상황</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.phases.map((phase, index) => (
            <Collapsible
              key={phase.key}
              open={expandedPhases.has(phase.key)}
              onOpenChange={() => togglePhase(phase.key)}
            >
              <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                {/* 상태 아이콘 */}
                <div className="mt-0.5">
                  {phase.status === "completed" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : phase.status === "in_progress" ? (
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                {/* 단계 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{phase.step}. {phase.label}</span>
                      {phase.status === "in_progress" && (
                        <Badge variant="secondary" className="text-xs">진행 중</Badge>
                      )}
                    </div>
                    {phase.details && (
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          {expandedPhases.has(phase.key) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{phase.description}</p>
                  
                  {/* 인라인 요약 정보 */}
                  {phase.details && phase.status !== "pending" && (
                    <PhaseInlineSummary phase={phase} />
                  )}
                </div>
              </div>

              {/* 확장 상세 정보 */}
              <CollapsibleContent>
                {phase.details && (
                  <PhaseDetails phase={phase} aiStages={data.aiStages} />
                )}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </CardContent>
      </Card>

      {/* 샘플링된 WorkUnit */}
      {data.sampledWorkUnits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              샘플링된 WorkUnit ({data.sampledWorkUnits.length}개)
            </CardTitle>
            <CardDescription>AI 분석 대상으로 선정된 대표 작업</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.sampledWorkUnits.map((wu, index) => (
                <div
                  key={wu.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                >
                  <span className="text-sm text-muted-foreground w-6">#{index + 1}</span>
                  
                  {/* 분석 상태 */}
                  {wu.analyzed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">
                        {wu.title || `${wu.repo.name} 작업`}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {wu.repo.name}
                      </Badge>
                      {wu.workType && (
                        <Badge variant="secondary" className="text-xs">
                          {wu.workType}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <GitCommit className="h-3 w-3" />
                        {wu.commitCount} 커밋
                      </span>
                      <span>Impact: {wu.impactScore.toFixed(1)}</span>
                      {wu.codeQuality && (
                        <span>품질: {wu.codeQuality.score}/10</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// 단계별 인라인 요약
function PhaseInlineSummary({ phase }: { phase: PhaseInfo }) {
  const { details } = phase;
  if (!details) return null;

  switch (phase.key) {
    case "METRICS":
      return (
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <GitCommit className="h-3 w-3" />
            {details.totalCommits?.toLocaleString()} 커밋
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {details.activeDays}일 활동
          </span>
          <span className="flex items-center gap-1">
            <FolderGit2 className="h-3 w-3" />
            {details.repoCount}개 리포
          </span>
        </div>
      );
    case "CLUSTERING":
      const { totalWorkUnits, prediction } = details;

      // 예측값이 없으면 기존 표시
      if (!prediction) {
        return (
          <div className="mt-2 text-xs text-muted-foreground">
            → {totalWorkUnits}개 WorkUnit 생성
          </div>
        );
      }

      // 진행률 계산 (expected 기준, 최대 100%)
      const progressPercent = Math.min(
        Math.round((totalWorkUnits / prediction.expected) * 100),
        100
      );

      return (
        <div className="mt-2 space-y-1.5">
          <div className="text-xs text-muted-foreground">
            → {totalWorkUnits}개 / {prediction.min}~{prediction.max}개 예상
          </div>
          <Progress value={progressPercent} className="h-1.5" />
        </div>
      );
    case "SCORING":
      return (
        <div className="mt-2 text-xs text-muted-foreground">
          → {details.scoredWorkUnits}개 스코어링 완료 (최고 점수: {details.topScore?.toFixed(1)})
        </div>
      );
    case "SAMPLING":
      return (
        <div className="mt-2 text-xs text-muted-foreground">
          → {details.sampledCount}개 / {details.totalWorkUnits}개 선정
        </div>
      );
    case "DIFF_FETCH":
      return (
        <div className="mt-2 text-xs text-muted-foreground">
          → {details.fetchedDiffs} / {details.totalCommits} Diff 조회 완료
        </div>
      );
    case "AI_ANALYSIS":
      if (!details.stages) return null;
      const completedStages = details.stages.filter((s: any) => s.completed).length;
      const { stage1Progress } = details;
      const hasStage1Progress = stage1Progress && stage1Progress.total > 0;

      // Stage 1 진행률 계산
      const stage1Percent = hasStage1Progress
        ? Math.min(Math.round((stage1Progress.completed / stage1Progress.total) * 100), 100)
        : 0;

      // 분석이 시작되지 않았는지 확인
      const notStartedYet = hasStage1Progress && stage1Progress.completed === 0 && stage1Progress.inProgress === 0;

      return (
        <div className="mt-2 space-y-2">
          <div className="text-xs text-muted-foreground">
            → AI 스테이지 {completedStages} / {details.stages.length} 완료
          </div>

          {hasStage1Progress ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  코드 분석: {stage1Progress.completed}/{stage1Progress.total}
                  {stage1Progress.inProgress > 0 && (
                    <span className="ml-1 text-primary">
                      ({stage1Progress.inProgress}개 병렬 분석 중)
                    </span>
                  )}
                  {stage1Progress.failed > 0 && (
                    <span className="ml-1 text-destructive">
                      (실패: {stage1Progress.failed})
                    </span>
                  )}
                </span>
                <span className="font-medium">{stage1Percent}%</span>
              </div>
              <Progress value={stage1Percent} className="h-1.5" />

              {/* 분석 시작 전 상태 */}
              {notStartedYet && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>AI 모델 연결 대기 중...</span>
                </div>
              )}

              {/* 최근 분석 결과 */}
              {stage1Progress.recentResults && stage1Progress.recentResults.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground">최근 분석:</p>
                  {stage1Progress.recentResults.slice(-3).reverse().map((r: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                      <span className="truncate flex-1">
                        {r.repoName.split('/')[1] || r.repoName}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {r.workType}
                      </Badge>
                      <span className="font-medium text-primary">{r.score}점</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // stage1Progress가 없을 때
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>AI 분석 준비 중...</span>
            </div>
          )}
        </div>
      );
    default:
      return null;
  }
}

// 단계별 상세 정보
function PhaseDetails({ phase, aiStages }: { phase: PhaseInfo; aiStages: Record<number, any> }) {
  const { details } = phase;
  if (!details) return null;

  return (
    <div className="ml-8 mt-2 p-4 rounded-lg bg-muted/50 space-y-3">
      {phase.key === "METRICS" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-background rounded-lg">
            <p className="text-2xl font-bold text-primary">{details.totalCommits?.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">총 커밋</p>
          </div>
          <div className="text-center p-3 bg-background rounded-lg">
            <p className="text-2xl font-bold text-green-500">+{(details.totalAdditions / 1000).toFixed(1)}k</p>
            <p className="text-xs text-muted-foreground">추가</p>
          </div>
          <div className="text-center p-3 bg-background rounded-lg">
            <p className="text-2xl font-bold text-red-500">-{(details.totalDeletions / 1000).toFixed(1)}k</p>
            <p className="text-xs text-muted-foreground">삭제</p>
          </div>
          <div className="text-center p-3 bg-background rounded-lg">
            <p className="text-2xl font-bold">{details.activeDays}</p>
            <p className="text-xs text-muted-foreground">활동일</p>
          </div>
        </div>
      )}

      {phase.key === "AI_ANALYSIS" && details.stages && (
        <div className="space-y-2">
          {details.stages.map((stage: any) => {
            // description이 객체인 경우 처리
            const descriptionText = typeof stage.description === 'object' && stage.description !== null
              ? (stage.description.description || stage.description.type || '')
              : (stage.description || '');
            
            return (
              <div key={stage.stage} className="flex items-center gap-3 p-2 rounded-lg bg-background">
                {stage.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="flex-1">
                  <span className="font-medium text-sm">Stage {stage.stage}: {stage.label}</span>
                  <p className="text-xs text-muted-foreground">{descriptionText}</p>
                </div>
                {stage.completed && aiStages[stage.stage]?.summary && (
                  <p className="text-xs text-muted-foreground max-w-xs truncate">
                    {aiStages[stage.stage].summary}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProgressSkeleton() {
  return (
    <div className="container py-8 px-4 max-w-4xl">
      <Skeleton className="h-8 w-48 mb-6" />
      
      <div className="flex items-center gap-4 mb-8">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div>
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-5 w-40 mt-1" />
        </div>
      </div>

      <Skeleton className="h-32 w-full mb-6" />
      
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

