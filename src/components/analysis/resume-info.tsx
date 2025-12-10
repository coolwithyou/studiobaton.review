"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  RefreshCcw,
  RotateCw,
  Trash2,
  Info,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

interface ResumeState {
  mode: string;
  completedRepos: string[];
  failedRepos: string[];
  pendingRepos: string[];
  totalRepos: string[];
  canResume: boolean;
  currentPhase: string;
  stats: {
    totalCommits: number;
    totalWorkUnits: number;
    scannedRepos: number;
  };
}

interface ResumeInfoProps {
  runId: string;
  onRetry: (mode: "resume" | "retry" | "full") => void;
}

export function ResumeInfo({ runId, onRetry }: ResumeInfoProps) {
  const [resumeState, setResumeState] = useState<ResumeState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchResumeState = async () => {
      try {
        const res = await fetch(`/api/analysis/${runId}/resume-state`);
        if (!res.ok) return;
        const data = await res.json();
        setResumeState(data);
      } catch (error) {
        console.error("Failed to fetch resume state:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchResumeState();
  }, [runId]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!resumeState || !resumeState.canResume) {
    return null;
  }

  const hasProgress = resumeState.stats.totalCommits > 0 || resumeState.stats.scannedRepos > 0;

  return (
    <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
          <Info className="h-5 w-5" />
          이전 분석 데이터 발견
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            중단되었던 분석의 데이터가 남아있습니다. 이어서 진행하면 시간과 API 호출을 절약할 수 있습니다.
          </AlertDescription>
        </Alert>

        {/* 기존 데이터 통계 */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-center p-3 bg-white dark:bg-gray-900 rounded-lg">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <CheckCircle2 className="h-4 w-4" />
              <span>완료</span>
            </div>
            <div className="text-2xl font-bold text-green-600">
              {resumeState.completedRepos.length}
            </div>
            <div className="text-xs text-muted-foreground">저장소</div>
          </div>

          <div className="text-center p-3 bg-white dark:bg-gray-900 rounded-lg">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <XCircle className="h-4 w-4" />
              <span>실패</span>
            </div>
            <div className="text-2xl font-bold text-red-600">
              {resumeState.failedRepos.length}
            </div>
            <div className="text-xs text-muted-foreground">저장소</div>
          </div>

          <div className="text-center p-3 bg-white dark:bg-gray-900 rounded-lg">
            <div className="text-muted-foreground mb-1">수집된 커밋</div>
            <div className="text-2xl font-bold text-blue-600">
              {resumeState.stats.totalCommits.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">개</div>
          </div>
        </div>

        {/* 재시작 옵션 */}
        <div className="space-y-2">
          <p className="text-sm font-medium">재시작 방법 선택:</p>
          <div className="grid gap-2">
            <Button
              onClick={() => onRetry("resume")}
              variant="default"
              className="justify-start"
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              <div className="flex-1 text-left">
                <div className="font-medium">이어서 진행 (권장)</div>
                <div className="text-xs opacity-80">
                  수집된 {resumeState.stats.totalCommits}개 커밋 유지, 미완료 부분만 진행
                </div>
              </div>
              <Badge variant="secondary">빠름</Badge>
            </Button>

            {resumeState.failedRepos.length > 0 && (
              <Button
                onClick={() => onRetry("retry")}
                variant="outline"
                className="justify-start"
              >
                <RotateCw className="mr-2 h-4 w-4" />
                <div className="flex-1 text-left">
                  <div className="font-medium">실패한 저장소만 재시도</div>
                  <div className="text-xs opacity-80">
                    {resumeState.failedRepos.length}개 저장소만 다시 스캔
                  </div>
                </div>
              </Button>
            )}

            <Button
              onClick={() => onRetry("full")}
              variant="destructive"
              className="justify-start"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <div className="flex-1 text-left">
                <div className="font-medium">전체 재시작</div>
                <div className="text-xs opacity-80">
                  모든 데이터 삭제 후 처음부터 다시
                </div>
              </div>
              <Badge variant="secondary">느림</Badge>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

