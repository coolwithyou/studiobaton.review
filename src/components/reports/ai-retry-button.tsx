"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface AiRetryButtonProps {
  reportId: string;
  isFinalized: boolean;
}

interface AiStatus {
  totalSampled: number;
  reviewed: number;
  pending: number;
  lastReviewedAt?: string;
  canRetry: boolean;
}

export function AiRetryButton({ reportId, isFinalized }: AiRetryButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [llmModel, setLlmModel] = useState<string>("claude-sonnet-4-5");

  // AI 상태 조회
  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/reports/${reportId}/retry-ai`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (error) {
      console.error("Failed to fetch AI status:", error);
    }
  };

  useEffect(() => {
    if (open) {
      fetchStatus();
    }
  }, [open, reportId]);

  const handleRetry = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/retry-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llmModel }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "AI 분석 재시도에 실패했습니다.");
      }

      toast.success("AI 분석이 시작되었습니다. 잠시 후 페이지를 새로고침해주세요.");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (isFinalized) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          AI 분석 재시도
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI 분석 재시도
          </DialogTitle>
          <DialogDescription>
            선택한 LLM 모델로 대표 작업들의 AI 분석을 다시 수행합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 현재 상태 */}
          {status && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">샘플링된 작업</span>
                <Badge variant="secondary">{status.totalSampled}개</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">분석 완료</span>
                <div className="flex items-center gap-2">
                  {status.reviewed === status.totalSampled ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                  )}
                  <Badge variant={status.reviewed === status.totalSampled ? "default" : "outline"}>
                    {status.reviewed}/{status.totalSampled}
                  </Badge>
                </div>
              </div>
              {status.lastReviewedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">마지막 분석</span>
                  <span className="text-sm">
                    {new Date(status.lastReviewedAt).toLocaleDateString("ko-KR", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* LLM 모델 선택 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">LLM 모델</label>
            <Select value={llmModel} onValueChange={setLlmModel}>
              <SelectTrigger>
                <SelectValue placeholder="모델 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude-sonnet-4-5">
                  Claude Sonnet 4.5 (Anthropic)
                </SelectItem>
                <SelectItem value="gpt-4o">
                  GPT-4o (OpenAI)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              기존 AI 분석 결과를 삭제하고 새로 분석합니다.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button onClick={handleRetry} disabled={loading}>
            {loading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                분석 중...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                AI 분석 시작
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
