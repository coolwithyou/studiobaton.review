"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Calendar, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { SyncStatus } from "@prisma/client";
import { toast } from "sonner";

interface SyncJob {
  id: string;
  year: number;
  status: SyncStatus;
  progress: {
    totalRepos?: number;
    completedRepos?: number;
    failedRepos?: number;
    totalCommits?: number;
  } | null;
  createdAt: Date;
}

interface SyncJobManagerProps {
  orgLogin: string;
  orgName: string;
  existingJobs: SyncJob[];
}

export function SyncJobManager({ orgLogin, orgName, existingJobs }: SyncJobManagerProps) {
  const router = useRouter();
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);

  const handleStartSync = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (year < 2000 || year > new Date().getFullYear()) {
      toast.error("유효한 연도를 입력하세요 (2000 ~ 현재)");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/commits/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgLogin, year }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("커밋 동기화가 시작되었습니다");
        router.push(`/organizations/${orgLogin}/sync/${data.syncJobId}`);
        router.refresh();
      } else {
        toast.error(data.error || "동기화 시작에 실패했습니다");
      }
    } catch (error) {
      console.error("Start sync error:", error);
      toast.error("동기화 시작 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  const statusConfig = {
    PENDING: { label: "대기 중", icon: Loader2, color: "text-yellow-600", variant: "secondary" as const },
    IN_PROGRESS: { label: "진행 중", icon: Loader2, color: "text-blue-600", variant: "default" as const },
    COMPLETED: { label: "완료", icon: CheckCircle2, color: "text-green-600", variant: "default" as const },
    FAILED: { label: "실패", icon: XCircle, color: "text-red-600", variant: "destructive" as const },
  };

  return (
    <div className="space-y-6">
      {/* 새 동기화 시작 */}
      <Card>
        <CardHeader>
          <CardTitle>새 동기화 시작</CardTitle>
          <CardDescription>연도를 선택하여 커밋 데이터를 수집합니다</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleStartSync} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="year">연도</Label>
              <Input
                id="year"
                type="number"
                min={2000}
                max={new Date().getFullYear()}
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                placeholder="예: 2024"
                required
              />
              <p className="text-sm text-muted-foreground">
                2000년부터 {new Date().getFullYear()}년까지 선택할 수 있습니다
              </p>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  시작 중...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  동기화 시작
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 동기화 기록 */}
      <Card>
        <CardHeader>
          <CardTitle>동기화 기록</CardTitle>
          <CardDescription>최근 동기화 작업 목록</CardDescription>
        </CardHeader>
        <CardContent>
          {existingJobs.length > 0 ? (
            <div className="space-y-3">
              {existingJobs.map((job) => {
                const config = statusConfig[job.status];
                const StatusIcon = config.icon;
                const isInProgress = job.status === "IN_PROGRESS";
                const progress = job.progress || {};

                return (
                  <button
                    key={job.id}
                    onClick={() => router.push(`/organizations/${orgLogin}/sync/${job.id}`)}
                    className="w-full flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-4">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{job.year}년</p>
                        <p className="text-sm text-muted-foreground">
                          {job.createdAt.toLocaleDateString("ko-KR", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {progress.totalCommits && (
                        <div className="text-right text-sm text-muted-foreground">
                          <p>{progress.totalCommits.toLocaleString()} 커밋</p>
                          {progress.totalRepos && (
                            <p>{progress.completedRepos || 0}/{progress.totalRepos} 저장소</p>
                          )}
                        </div>
                      )}
                      <Badge variant={config.variant}>
                        <StatusIcon className={`mr-1 h-3 w-3 ${isInProgress ? "animate-spin" : ""}`} />
                        {config.label}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <RefreshCw className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="mb-2 font-medium">아직 동기화 기록이 없습니다</p>
              <p className="text-sm text-muted-foreground">
                위 양식에서 첫 번째 동기화를 시작해보세요
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

