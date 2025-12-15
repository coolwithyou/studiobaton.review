"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCcw,
  GitBranch,
  Info,
  StopCircle,
  Trash2,
  Sparkles,
  SkipForward,
  FileText,
  RotateCw,
  PlayCircle,
} from "lucide-react";
import Link from "next/link";
import { ResumeInfo } from "./resume-info";
import { RunStatus } from "@prisma/client";

interface RepoProgress {
  repoName: string;
  status: "pending" | "scanning" | "done" | "failed";
  commitCount?: number;
  error?: string;
}

interface ClusteringProgress {
  stage: "loading" | "clustering" | "saving";
  totalCommits: number;
  processedCommits: number;
  totalRepos: number;
  processedRepos: number;
  createdWorkUnits: number;
}

interface ProgressData {
  status: RunStatus;
  progress: {
    total: number;
    completed: number;
    failed: number;
    phase?: string;
    currentRepo?: string;
    message?: string;
    repoProgress?: RepoProgress[];
    clusteringProgress?: ClusteringProgress;
  } | null;
  error?: string;
}

interface AiConfirmInfo {
  summary: {
    totalCommits: number;
    totalWorkUnits: number;
    sampleSize: number;
    targetUsers: number;
  };
  tokenEstimate: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUSD: string;
  };
  llmModel: string;
}

interface ProgressMonitorProps {
  runId: string;
  initialStatus: RunStatus;
  initialProgress: {
    total: number;
    completed: number;
    failed: number;
    phase?: string;
  } | null;
  targetUser?: string;
}

const PHASES = [
  { key: "QUEUED", label: "대기 중", description: "분석 시작 대기" },
  { key: "BUILDING_UNITS", label: "Work Unit 생성", description: "커밋 클러스터링 및 분석 단위 생성" },
  { key: "AWAITING_AI_CONFIRMATION", label: "AI 리뷰 대기", description: "AI 리뷰 시작 확인 필요" },
  { key: "REVIEWING", label: "AI 리뷰", description: "AI 코드 리뷰 진행 중" },
  { key: "FINALIZING", label: "리포트 생성", description: "연간 리포트 생성 중" },
  { key: "DONE", label: "완료", description: "분석 완료" },
];

const statusLabels: Record<RunStatus, string> = {
  QUEUED: "대기 중",
  SCANNING_REPOS: "저장소 스캔 중",
  SCANNING_COMMITS: "커밋 수집 중",
  BUILDING_UNITS: "Work Unit 생성 중",
  AWAITING_AI_CONFIRMATION: "AI 리뷰 대기",
  REVIEWING: "AI 리뷰 중",
  FINALIZING: "리포트 생성 중",
  DONE: "완료",
  FAILED: "실패",
};

export function ProgressMonitor({
  runId,
  initialStatus,
  initialProgress,
  targetUser,
}: ProgressMonitorProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [progress, setProgress] = useState(initialProgress);
  const [repoProgress, setRepoProgress] = useState<RepoProgress[]>([]);
  const [currentMessage, setCurrentMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [aiConfirmInfo, setAiConfirmInfo] = useState<AiConfirmInfo | null>(null);
  const [isStartingAi, setIsStartingAi] = useState(false);
  const [showResumeInfo, setShowResumeInfo] = useState(false);
  const [clusteringProgress, setClusteringProgress] = useState<ClusteringProgress | null>(null);

  const isRunning = !["DONE", "FAILED", "AWAITING_AI_CONFIRMATION"].includes(status);
  const canCancel = ["QUEUED", "BUILDING_UNITS"].includes(status);
  const canDelete = ["FAILED", "QUEUED"].includes(status);

  const percentage = progress?.total
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  // 현재 단계의 인덱스
  const currentPhaseIndex = PHASES.findIndex((p) => p.key === status);

  useEffect(() => {
    if (!isPolling || status === "DONE" || status === "FAILED") return;

    const fetchProgress = async () => {
      try {
        const res = await fetch(`/api/analysis/${runId}`);
        if (!res.ok) throw new Error("Failed to fetch progress");

        const data: ProgressData = await res.json();
        setStatus(data.status);
        setProgress(data.progress);
        setRepoProgress(data.progress?.repoProgress || []);
        setCurrentMessage(data.progress?.message || null);
        setClusteringProgress(data.progress?.clusteringProgress || null);

        if (data.error) {
          setError(data.error);
        }

        if (data.status === "DONE") {
          toast.success("분석이 완료되었습니다!", {
            description: "리포트를 확인해보세요.",
          });
          setIsPolling(false);
        } else if (data.status === "FAILED") {
          toast.error("분석 중 오류가 발생했습니다.", {
            description: data.error || "자세한 내용은 로그를 확인해주세요.",
          });
          setIsPolling(false);
        } else if (data.status === "AWAITING_AI_CONFIRMATION") {
          // AI 컨펌 대기 상태 - 컨펌 정보 조회
          setIsPolling(false);
          fetchAiConfirmInfo();
        }
      } catch (err) {
        console.error("Error fetching progress:", err);
      }
    };

    // 즉시 한 번 실행
    fetchProgress();

    // 3초마다 폴링 (더 빠르게)
    const interval = setInterval(fetchProgress, 3000);

    return () => clearInterval(interval);
  }, [runId, isPolling, status]);

  // AI 컨펌 정보 조회
  const fetchAiConfirmInfo = async () => {
    try {
      const res = await fetch(`/api/analysis/${runId}/confirm-ai-review`);
      if (!res.ok) throw new Error("Failed to fetch AI confirm info");
      const data = await res.json();
      setAiConfirmInfo(data);
    } catch (err) {
      console.error("Error fetching AI confirm info:", err);
    }
  };

  // AI 리뷰 시작 확인 시 정보 조회
  useEffect(() => {
    if (status === "AWAITING_AI_CONFIRMATION" && !aiConfirmInfo) {
      fetchAiConfirmInfo();
    }
  }, [status]);

  const handleRetry = async (mode: "resume" | "retry" | "full" = "resume") => {
    try {
      const res = await fetch(`/api/analysis/${runId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });

      if (!res.ok) throw new Error("Failed to retry");

      const modeLabels = {
        resume: "이어서 진행",
        retry: "실패한 저장소만 재시도",
        full: "전체 재시작",
      };

      toast.success(`분석을 재시도합니다 (${modeLabels[mode]})`);
      setIsPolling(true);
      setStatus("QUEUED" as RunStatus);
      setError(null);
    } catch (err) {
      console.error("Error retrying:", err);
      toast.error("재시도에 실패했습니다.");
    }
  };

  const handleCancel = async () => {
    if (!confirm("분석을 중단하시겠습니까? 현재까지 수집된 데이터는 유지됩니다.")) return;

    setIsCancelling(true);
    try {
      const res = await fetch(`/api/analysis/${runId}/cancel`, {
        method: "POST",
      });

      if (!res.ok) throw new Error("Failed to cancel");

      toast.success("분석이 중단되었습니다.");
      setStatus("FAILED" as RunStatus);
      setError("Cancelled by user");
      setIsPolling(false);
    } catch (err) {
      console.error("Error cancelling:", err);
      toast.error("중단에 실패했습니다.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("분석 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/analysis/${runId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete");

      toast.success("분석이 삭제되었습니다.");
      router.push("/analysis");
    } catch (err) {
      console.error("Error deleting:", err);
      toast.error("삭제에 실패했습니다.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartAiReview = async (skipAi: boolean = false) => {
    setIsStartingAi(true);
    try {
      const res = await fetch(`/api/analysis/${runId}/confirm-ai-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipAiReview: skipAi }),
      });

      if (!res.ok) throw new Error("Failed to start AI review");

      toast.success(skipAi ? "AI 리뷰를 건너뛰고 리포트를 생성합니다." : "AI 리뷰가 시작되었습니다.");
      setStatus("REVIEWING" as RunStatus);
      setAiConfirmInfo(null);
      setIsPolling(true);
    } catch (err) {
      console.error("Error starting AI review:", err);
      toast.error("AI 리뷰 시작에 실패했습니다.");
    } finally {
      setIsStartingAi(false);
    }
  };

  return (
    <Card className="mb-8">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          {isRunning ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : status === "DONE" ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : status === "AWAITING_AI_CONFIRMATION" ? (
            <Sparkles className="h-5 w-5 text-yellow-600" />
          ) : (
            <XCircle className="h-5 w-5 text-destructive" />
          )}
          진행 상황
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              status === "DONE"
                ? "default"
                : status === "FAILED"
                  ? "destructive"
                  : status === "AWAITING_AI_CONFIRMATION"
                    ? "outline"
                    : "secondary"
            }
          >
            {statusLabels[status]}
          </Badge>
          {canCancel && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <StopCircle className="h-4 w-4" />
              )}
              <span className="ml-1 hidden sm:inline">중단</span>
            </Button>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              <span className="ml-1 hidden sm:inline">삭제</span>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 백그라운드 안내 */}
        {isRunning && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              분석은 백그라운드에서 진행됩니다. 이 페이지를 닫거나 다른 작업을 해도 분석은 계속됩니다.
            </AlertDescription>
          </Alert>
        )}

        {/* 단계 표시 */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium mb-3">분석 단계</h4>
          <div className="flex flex-wrap gap-2">
            {PHASES.filter(p => p.key !== "DONE").map((phase, index) => {
              const isCompleted = index < currentPhaseIndex;
              const isCurrent = phase.key === status;
              const isPending = index > currentPhaseIndex;

              return (
                <div
                  key={phase.key}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${isCurrent
                      ? "bg-primary text-primary-foreground"
                      : isCompleted
                        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                        : "bg-muted text-muted-foreground"
                    }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : isCurrent && status !== "AWAITING_AI_CONFIRMATION" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  {phase.label}
                </div>
              );
            })}
          </div>
        </div>

        {/* 현재 단계 상세 */}
        {currentMessage && (
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <span className="font-medium">현재 작업:</span> {currentMessage}
          </div>
        )}

        {/* Work Unit 생성 상세 진행률 */}
        {status === "BUILDING_UNITS" && clusteringProgress && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Work Unit 생성 진행 상황</h4>

            {/* 단계 1: 커밋 로딩 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    1
                  </span>
                  커밋 로딩
                </span>
                {clusteringProgress.stage === "loading" ? (
                  <Badge variant="secondary">
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    진행 중
                  </Badge>
                ) : (
                  <Badge variant="default">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    완료
                  </Badge>
                )}
              </div>
              {clusteringProgress.stage !== "loading" && (
                <div className="ml-8">
                  <Progress value={100} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {clusteringProgress.totalCommits.toLocaleString()}개 커밋 로드 완료
                  </p>
                </div>
              )}
            </div>

            {/* 단계 2: 클러스터링 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    2
                  </span>
                  저장소별 클러스터링
                </span>
                {clusteringProgress.stage === "clustering" ? (
                  <Badge variant="secondary">
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    진행 중
                  </Badge>
                ) : clusteringProgress.stage === "saving" ? (
                  <Badge variant="default">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    완료
                  </Badge>
                ) : (
                  <Badge variant="outline">대기</Badge>
                )}
              </div>
              {clusteringProgress.stage === "clustering" && clusteringProgress.totalRepos > 0 && (
                <div className="ml-8">
                  <Progress
                    value={(clusteringProgress.processedRepos / clusteringProgress.totalRepos) * 100}
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {clusteringProgress.processedRepos} / {clusteringProgress.totalRepos} 저장소
                    ({Math.round((clusteringProgress.processedRepos / clusteringProgress.totalRepos) * 100)}%)
                  </p>
                </div>
              )}
              {clusteringProgress.stage === "saving" && (
                <div className="ml-8">
                  <Progress value={100} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {clusteringProgress.totalRepos}개 저장소 클러스터링 완료
                  </p>
                </div>
              )}
            </div>

            {/* 단계 3: Work Unit 저장 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    3
                  </span>
                  Work Unit 저장
                </span>
                {clusteringProgress.stage === "saving" ? (
                  <Badge variant="secondary">
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    진행 중
                  </Badge>
                ) : (
                  <Badge variant="outline">대기</Badge>
                )}
              </div>
              {clusteringProgress.stage === "saving" && (
                <div className="ml-8">
                  <Progress value={80} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {clusteringProgress.createdWorkUnits.toLocaleString()}개 Work Unit 생성 중...
                  </p>
                </div>
              )}
            </div>

            {/* 통계 요약 */}
            <div className="border-t pt-4 mt-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <p className="text-muted-foreground">총 커밋</p>
                  <p className="text-lg font-semibold">{clusteringProgress.totalCommits.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">저장소</p>
                  <p className="text-lg font-semibold">{clusteringProgress.totalRepos}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">생성된 Work Unit</p>
                  <p className="text-lg font-semibold text-primary">{clusteringProgress.createdWorkUnits}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Work Unit 생성 완료 후 */}
        {status === "BUILDING_UNITS" && !clusteringProgress && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Work Unit 생성 진행 상황</h4>
            <div className="ml-2">
              <Progress value={50} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                작업을 준비하고 있습니다...
              </p>
            </div>
          </div>
        )}

        {/* 정량적 중간 리포트 링크 (AWAITING_AI_CONFIRMATION 상태) */}
        {status === "AWAITING_AI_CONFIRMATION" && targetUser && (
          <Alert>
            <FileText className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">정량적 분석 리포트를 확인하세요</p>
                <p className="text-sm">
                  AI 리뷰 없이도 수집된 커밋 데이터를 기반으로 풍부한 통계 리포트를 제공합니다.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="mt-3"
                >
                  <Link href={`/analysis/${runId}/interim-report?userLogin=${targetUser}`}>
                    <FileText className="mr-2 h-4 w-4" />
                    중간 리포트 보기
                  </Link>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* AI 컨펌 대기 상태 */}
        {status === "AWAITING_AI_CONFIRMATION" && aiConfirmInfo && (
          <div className="border rounded-lg p-4 space-y-4 bg-yellow-50 dark:bg-yellow-950/20">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
              <Sparkles className="h-5 w-5" />
              <h4 className="font-medium">AI 리뷰를 시작할 준비가 되었습니다</h4>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">수집된 커밋</p>
                <p className="font-medium text-lg">{aiConfirmInfo.summary.totalCommits.toLocaleString()}개</p>
              </div>
              <div>
                <p className="text-muted-foreground">생성된 Work Unit</p>
                <p className="font-medium text-lg">{aiConfirmInfo.summary.totalWorkUnits.toLocaleString()}개</p>
              </div>
              <div>
                <p className="text-muted-foreground">리뷰할 샘플</p>
                <p className="font-medium text-lg">{aiConfirmInfo.summary.sampleSize}개</p>
              </div>
              <div>
                <p className="text-muted-foreground">대상 사용자</p>
                <p className="font-medium text-lg">{aiConfirmInfo.summary.targetUsers}명</p>
              </div>
            </div>

            <div className="border-t pt-4 space-y-2">
              <p className="text-sm font-medium">예상 토큰 사용량</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">입력 토큰</p>
                  <p className="font-mono">{aiConfirmInfo.tokenEstimate.inputTokens.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">출력 토큰</p>
                  <p className="font-mono">{aiConfirmInfo.tokenEstimate.outputTokens.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">예상 비용</p>
                  <p className="font-mono">${aiConfirmInfo.tokenEstimate.estimatedCostUSD}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                * {aiConfirmInfo.llmModel} 기준, 실제 비용은 다를 수 있습니다.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => handleStartAiReview(false)}
                disabled={isStartingAi}
                className="flex-1"
              >
                {isStartingAi ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                AI 리뷰 시작
              </Button>
              <Button
                variant="outline"
                onClick={() => handleStartAiReview(true)}
                disabled={isStartingAi}
              >
                <SkipForward className="mr-2 h-4 w-4" />
                건너뛰기
              </Button>
            </div>
          </div>
        )}

        {/* 저장소별 진행 상태 */}
        {repoProgress.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">저장소별 상태</h4>
            <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2">
              {repoProgress.map((repo) => (
                <div
                  key={repo.repoName}
                  className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    {repo.status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : repo.status === "failed" ? (
                      <XCircle className="h-4 w-4 text-destructive" />
                    ) : repo.status === "scanning" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <GitBranch className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate max-w-[250px]">{repo.repoName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {repo.commitCount !== undefined && (
                      <span className="text-xs">
                        {repo.commitCount} commits
                      </span>
                    )}
                    {repo.error && (
                      <span className="text-xs text-destructive truncate max-w-[100px]" title={repo.error}>
                        Error
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 오류 메시지 */}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* 재시도 버튼 및 Resume 정보 */}
        {status === "FAILED" && (
          <div className="space-y-3">
            {!showResumeInfo ? (
              <div className="flex gap-2">
                <Button
                  onClick={() => handleRetry("resume")}
                  variant="default"
                  className="flex-1"
                >
                  <PlayCircle className="mr-2 h-4 w-4" />
                  이어서 진행
                </Button>
                <Button
                  onClick={() => setShowResumeInfo(true)}
                  variant="outline"
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <ResumeInfo runId={runId} onRetry={(mode) => {
                setShowResumeInfo(false);
                handleRetry(mode);
              }} />
            )}
          </div>
        )}

        {/* 완료 안내 */}
        {status === "DONE" && (
          <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-300">
              분석이 완료되었습니다. 아래에서 팀원별 리포트를 확인하세요.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
