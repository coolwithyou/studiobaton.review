"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SyncProgress } from "@/components/analysis/sync-progress";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Play,
  Clock,
  AlertCircle,
} from "lucide-react";

interface SyncJob {
  id: string;
  year: number;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  progress: any;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

interface SyncJobManagerProps {
  orgLogin: string;
  orgName: string;
  existingJobs: SyncJob[];
}

export function SyncJobManager({ orgLogin, orgName, existingJobs }: SyncJobManagerProps) {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [isStarting, setIsStarting] = useState(false);
  const [activeSyncJobId, setActiveSyncJobId] = useState<string | null>(
    existingJobs.find((job) => job.status === "IN_PROGRESS")?.id || null
  );

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  const handleStartSync = async () => {
    setIsStarting(true);
    try {
      const res = await fetch("/api/commits/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgLogin, year: selectedYear }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.permissionError) {
          toast.error("권한이 부족합니다", {
            description: data.error,
          });
        } else {
          throw new Error(data.error || "Failed to start sync");
        }
        return;
      }

      toast.success("동기화가 시작되었습니다!", {
        description: `${selectedYear}년 커밋 동기화가 시작되었습니다.`,
      });

      setActiveSyncJobId(data.syncJobId);

      // 페이지 새로고침하여 목록 업데이트
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      console.error("Error starting sync:", err);
      toast.error("동기화 시작에 실패했습니다.");
    } finally {
      setIsStarting(false);
    }
  };

  const existingJobForYear = existingJobs.find((job) => job.year === selectedYear);
  const canStart = !existingJobForYear ||
    (existingJobForYear.status !== "IN_PROGRESS" &&
      existingJobForYear.status !== "PENDING");

  const activeJob = existingJobs.find((job) => job.id === activeSyncJobId);

  return (
    <div className="space-y-6">
      {/* 새 동기화 시작 */}
      <Card>
        <CardHeader>
          <CardTitle>동기화 시작</CardTitle>
          <CardDescription>
            연도를 선택하여 커밋 동기화를 시작하거나 재실행합니다
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label htmlFor="year">연도 선택</Label>
              <select
                id="year"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}년
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleStartSync}
              disabled={isStarting || !canStart}
              className="min-w-[120px]"
            >
              {isStarting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  시작 중...
                </>
              ) : existingJobForYear && existingJobForYear.status !== "IN_PROGRESS" ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  다시 동기화
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  동기화 시작
                </>
              )}
            </Button>
          </div>

          {existingJobForYear && existingJobForYear.status === "IN_PROGRESS" && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                {selectedYear}년 동기화가 현재 진행 중입니다.
              </AlertDescription>
            </Alert>
          )}

          {existingJobForYear && existingJobForYear.status === "COMPLETED" && (
            <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700 dark:text-green-300">
                {selectedYear}년 동기화가 완료되었습니다. 다시 동기화하면 새로운 커밋이 추가됩니다.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* 진행 중인 동기화 표시 */}
      {activeJob && (activeJob.status === "IN_PROGRESS" || activeJob.status === "PENDING") && (
        <SyncProgress
          syncJobId={activeJob.id}
          orgLogin={orgLogin}
          year={activeJob.year}
          onComplete={() => {
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }}
        />
      )}

      {/* 동기화 기록 */}
      <Card>
        <CardHeader>
          <CardTitle>동기화 기록</CardTitle>
          <CardDescription>최근 동기화 작업 목록입니다</CardDescription>
        </CardHeader>
        <CardContent>
          {existingJobs.length > 0 ? (
            <div className="space-y-3">
              {existingJobs.map((job) => {
                const isActive = job.status === "IN_PROGRESS" || job.status === "PENDING";
                const progress = job.progress as any;

                return (
                  <div
                    key={job.id}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        {job.status === "COMPLETED" ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : job.status === "FAILED" ? (
                          <XCircle className="h-5 w-5 text-destructive" />
                        ) : job.status === "IN_PROGRESS" ? (
                          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                        ) : (
                          <Clock className="h-5 w-5 text-yellow-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{job.year}년 커밋 동기화</p>
                        <p className="text-sm text-muted-foreground">
                          {job.createdAt.toLocaleDateString("ko-KR", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {job.error && (
                          <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {job.error}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {progress && (
                        <div className="text-right text-sm text-muted-foreground">
                          <p>
                            {progress.completedRepos || 0} / {progress.totalRepos || 0} 저장소
                          </p>
                          <p>{(progress.totalCommits || 0).toLocaleString()} 커밋</p>
                        </div>
                      )}
                      <Badge
                        variant={
                          job.status === "COMPLETED"
                            ? "default"
                            : job.status === "FAILED"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {job.status === "PENDING" && "대기 중"}
                        {job.status === "IN_PROGRESS" && "진행 중"}
                        {job.status === "COMPLETED" && "완료"}
                        {job.status === "FAILED" && "실패"}
                      </Badge>
                      {!isActive && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedYear(job.year);
                            handleStartSync();
                          }}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <RefreshCw className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="mb-2 font-medium">아직 동기화 기록이 없습니다</p>
              <p className="text-sm text-muted-foreground">
                연도를 선택하여 첫 번째 동기화를 시작해보세요!
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
