"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";
import { SyncStatus } from "@prisma/client";

interface SyncProgressProps {
  syncJobId: string;
  orgLogin: string;
  year: number;
}

interface SyncJobData {
  id: string;
  status: SyncStatus;
  progress: {
    totalRepos?: number;
    completedRepos?: number;
    failedRepos?: number;
    totalCommits?: number;
  } | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export function SyncProgress({ syncJobId, orgLogin, year }: SyncProgressProps) {
  const [syncJob, setSyncJob] = useState<SyncJobData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSyncJob = async () => {
      try {
        const response = await fetch(`/api/commits/sync/status?syncJobId=${syncJobId}`);
        if (response.ok) {
          const data = await response.json();
          setSyncJob(data);
        }
      } catch (error) {
        console.error("Failed to fetch sync job:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSyncJob();

    // Poll every 2 seconds if in progress
    const interval = setInterval(() => {
      if (syncJob?.status === "IN_PROGRESS") {
        fetchSyncJob();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [syncJobId, syncJob?.status]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!syncJob) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">동기화 작업을 찾을 수 없습니다.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const progress = syncJob.progress || {};
  const totalRepos = progress.totalRepos || 0;
  const completedRepos = progress.completedRepos || 0;
  const failedRepos = progress.failedRepos || 0;
  const totalCommits = progress.totalCommits || 0;
  const progressPercentage = totalRepos > 0 ? Math.round((completedRepos / totalRepos) * 100) : 0;

  const statusConfig = {
    PENDING: { label: "대기 중", icon: Loader2, color: "text-yellow-600", variant: "secondary" as const },
    IN_PROGRESS: { label: "진행 중", icon: Loader2, color: "text-blue-600", variant: "default" as const },
    COMPLETED: { label: "완료", icon: CheckCircle2, color: "text-green-600", variant: "default" as const },
    FAILED: { label: "실패", icon: XCircle, color: "text-red-600", variant: "destructive" as const },
  };

  const config = statusConfig[syncJob.status];
  const StatusIcon = config.icon;
  const isInProgress = syncJob.status === "IN_PROGRESS";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>동기화 상태</CardTitle>
              <CardDescription>{year}년 커밋 데이터 동기화</CardDescription>
            </div>
            <Badge variant={config.variant}>
              <StatusIcon className={`mr-1 h-3 w-3 ${isInProgress ? "animate-spin" : ""}`} />
              {config.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isInProgress && totalRepos > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">진행률</span>
                <span className="font-medium">{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} />
              <p className="text-sm text-muted-foreground">
                {completedRepos} / {totalRepos} 저장소 완료
              </p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground mb-1">전체 저장소</p>
              <p className="text-2xl font-bold">{totalRepos}</p>
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground mb-1">완료</p>
              <p className="text-2xl font-bold text-green-600">{completedRepos}</p>
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground mb-1">실패</p>
              <p className="text-2xl font-bold text-red-600">{failedRepos}</p>
            </div>
          </div>

          {totalCommits > 0 && (
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground mb-1">수집된 커밋</p>
              <p className="text-2xl font-bold">{totalCommits.toLocaleString()}</p>
            </div>
          )}

          {syncJob.error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
              <p className="text-sm font-medium text-destructive mb-1">에러</p>
              <p className="text-sm text-destructive/80">{syncJob.error}</p>
            </div>
          )}

          {syncJob.startedAt && (
            <div className="text-sm text-muted-foreground">
              <p>시작 시간: {new Date(syncJob.startedAt).toLocaleString("ko-KR")}</p>
              {syncJob.finishedAt && (
                <p>완료 시간: {new Date(syncJob.finishedAt).toLocaleString("ko-KR")}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isInProgress && (
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                동기화가 진행 중입니다. 페이지를 닫아도 백그라운드에서 계속 실행됩니다.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

