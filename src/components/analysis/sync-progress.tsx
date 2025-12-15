"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  GitBranch,
  Clock,
  StopCircle,
  RefreshCw,
} from "lucide-react";

interface SyncProgressProps {
  syncJobId: string;
  orgLogin: string;
  year: number;
  onComplete?: () => void;
}

interface SyncProgress {
  totalRepos: number;
  completedRepos: number;
  failedRepos: number;
  totalCommits: number;
  currentRepo?: string;
  currentCommit?: {
    sha: string;
    message: string;
    author: string;
    index: number;
    total: number;
  };
  repoProgress?: Array<{
    repoName: string;
    status: "pending" | "syncing" | "done" | "failed";
    commits?: number;
    error?: string;
  }>;
}

interface SyncData {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  progress: SyncProgress | null;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export function SyncProgress({
  syncJobId,
  orgLogin,
  year,
  onComplete,
}: SyncProgressProps) {
  const [syncData, setSyncData] = useState<SyncData | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const isRunning = syncData?.status === "IN_PROGRESS" || syncData?.status === "PENDING";
  const isFinished = syncData?.status === "COMPLETED" || syncData?.status === "FAILED";
  const percentage = syncData?.progress
    ? Math.round((syncData.progress.completedRepos / syncData.progress.totalRepos) * 100) || 0
    : 0;

  useEffect(() => {
    if (!isPolling || !syncJobId) return;

    const fetchProgress = async () => {
      try {
        const res = await fetch(`/api/commits/sync/${orgLogin}/${year}`);
        if (!res.ok) {
          console.error("Failed to fetch sync progress");
          return;
        }

        const data: SyncData = await res.json();
        setSyncData(data);

        if (data.status === "COMPLETED") {
          toast.success("커밋 동기화가 완료되었습니다!", {
            description: `${data.progress?.totalCommits || 0}개의 커밋이 동기화되었습니다.`,
          });
          setIsPolling(false);
          onComplete?.();
        } else if (data.status === "FAILED") {
          toast.error("커밋 동기화에 실패했습니다.", {
            description: data.error || "자세한 내용은 로그를 확인해주세요.",
          });
          setIsPolling(false);
        }
      } catch (err) {
        console.error("Error fetching sync progress:", err);
      }
    };

    // 즉시 한 번 실행
    fetchProgress();

    // 3초마다 폴링
    const interval = setInterval(fetchProgress, 3000);

    return () => clearInterval(interval);
  }, [syncJobId, orgLogin, year, isPolling, onComplete]);

  const handleCancel = async () => {
    if (!confirm("동기화를 중단하시겠습니까?")) return;

    setIsCancelling(true);
    try {
      const res = await fetch(`/api/commits/sync/${orgLogin}/${year}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to cancel sync");

      toast.success("동기화가 중단되었습니다.");
      setIsPolling(false);
    } catch (err) {
      console.error("Error cancelling sync:", err);
      toast.error("중단에 실패했습니다.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRetry = async () => {
    if (!confirm("동기화를 다시 시작하시겠습니까? 기존 커밋 데이터는 유지됩니다.")) return;

    setIsRetrying(true);
    try {
      const res = await fetch("/api/commits/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgLogin, year }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start sync");
      }

      toast.success("동기화가 다시 시작되었습니다.");
      setIsPolling(true); // 폴링 재시작
    } catch (err) {
      console.error("Error retrying sync:", err);
      toast.error("동기화 재시작에 실패했습니다.");
    } finally {
      setIsRetrying(false);
    }
  };

  if (!syncData) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          {isRunning ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : syncData.status === "COMPLETED" ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <XCircle className="h-5 w-5 text-destructive" />
          )}
          커밋 동기화 진행 상황
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              syncData.status === "COMPLETED"
                ? "default"
                : syncData.status === "FAILED"
                  ? "destructive"
                  : "secondary"
            }
          >
            {syncData.status === "PENDING" && "대기 중"}
            {syncData.status === "IN_PROGRESS" && "진행 중"}
            {syncData.status === "COMPLETED" && "완료"}
            {syncData.status === "FAILED" && "실패"}
          </Badge>
          {isRunning && (
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
          {isFinished && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetry}
              disabled={isRetrying}
            >
              {isRetrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-1 hidden sm:inline">다시 동기화</span>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 백그라운드 안내 */}
        {isRunning && (
          <Alert>
            <AlertDescription>
              동기화는 백그라운드에서 진행됩니다. 이 페이지를 닫아도 동기화는 계속됩니다.
            </AlertDescription>
          </Alert>
        )}

        {/* 전체 진행률 */}
        {syncData.progress && syncData.progress.totalRepos > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">전체 진행률</span>
              <span className="text-muted-foreground">
                {syncData.progress.completedRepos} / {syncData.progress.totalRepos} 저장소
              </span>
            </div>
            <Progress value={percentage} className="h-2" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{percentage}% 완료</span>
              <span>총 {syncData.progress.totalCommits.toLocaleString()}개 커밋</span>
            </div>
          </div>
        )}

        {/* 현재 작업 중인 저장소 */}
        {isRunning && syncData.progress?.currentRepo && (
          <div className="rounded-lg border p-3 bg-muted/50">
            <p className="text-sm font-medium">현재 동기화 중:</p>
            <p className="text-sm text-muted-foreground mt-1">
              {syncData.progress.currentRepo}
            </p>
          </div>
        )}

        {/* 현재 처리 중인 커밋 */}
        {isRunning && syncData.progress?.currentCommit && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                커밋 처리 중
              </p>
              <span className="text-xs text-blue-700 dark:text-blue-300">
                {syncData.progress.currentCommit.index} / {syncData.progress.currentCommit.total}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <code className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 font-mono">
                  {syncData.progress.currentCommit.sha}
                </code>
                <span className="text-blue-700 dark:text-blue-300">
                  by {syncData.progress.currentCommit.author}
                </span>
              </div>
              <p className="text-sm text-blue-800 dark:text-blue-200 truncate">
                {syncData.progress.currentCommit.message}
              </p>
            </div>
            <Progress
              value={(syncData.progress.currentCommit.index / syncData.progress.currentCommit.total) * 100}
              className="h-1 bg-blue-200 dark:bg-blue-900"
            />
          </div>
        )}

        {/* 저장소별 상태 */}
        {syncData.progress?.repoProgress && syncData.progress.repoProgress.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">저장소별 상태</h4>
            <div className="max-h-64 overflow-y-auto space-y-1 border rounded-lg p-2">
              {syncData.progress.repoProgress.map((repo) => (
                <div
                  key={repo.repoName}
                  className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    {repo.status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : repo.status === "failed" ? (
                      <XCircle className="h-4 w-4 text-destructive" />
                    ) : repo.status === "syncing" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <GitBranch className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate max-w-[250px]">{repo.repoName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {repo.commits !== undefined && (
                      <span className="text-xs">{repo.commits} commits</span>
                    )}
                    {repo.error && (
                      <span
                        className="text-xs text-destructive truncate max-w-[100px]"
                        title={repo.error}
                      >
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
        {syncData.error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{syncData.error}</p>
          </div>
        )}

        {/* 완료 안내 */}
        {syncData.status === "COMPLETED" && (
          <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-300">
              커밋 동기화가 완료되었습니다. 이제 분석을 시작할 수 있습니다.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
