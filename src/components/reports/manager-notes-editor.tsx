"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";
import {
  Edit2,
  Save,
  X,
  CheckCircle2,
  Unlock,
  Loader2,
  MessageSquare,
} from "lucide-react";

interface ManagerNotesEditorProps {
  reportId: string;
  initialNotes: string | null;
  isFinalized: boolean;
  finalizedAt?: string | null;
  finalizedBy?: string | null;
  isAdmin: boolean;
  onUpdate?: () => void;
}

export function ManagerNotesEditor({
  reportId,
  initialNotes,
  isFinalized: initialIsFinalized,
  finalizedAt: initialFinalizedAt,
  finalizedBy: initialFinalizedBy,
  isAdmin,
  onUpdate,
}: ManagerNotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes || "");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isFinalized, setIsFinalized] = useState(initialIsFinalized);
  const [finalizedAt, setFinalizedAt] = useState(initialFinalizedAt);
  const [finalizedBy, setFinalizedBy] = useState(initialFinalizedBy);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/manager-notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "저장에 실패했습니다.");
      }

      toast.success("매니저 코멘트가 저장되었습니다.");
      setIsEditing(false);
      onUpdate?.();
    } catch (error) {
      console.error("Save error:", error);
      toast.error(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinalize = async () => {
    setIsFinalizing(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/finalize`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "확정에 실패했습니다.");
      }

      const data = await res.json();
      setIsFinalized(true);
      setFinalizedAt(data.finalizedAt);
      setFinalizedBy(data.finalizedBy);
      toast.success("리포트가 확정되었습니다.");
      onUpdate?.();
    } catch (error) {
      console.error("Finalize error:", error);
      toast.error(error instanceof Error ? error.message : "확정에 실패했습니다.");
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleUnfinalize = async () => {
    setIsFinalizing(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/finalize`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "확정 취소에 실패했습니다.");
      }

      setIsFinalized(false);
      setFinalizedAt(null);
      setFinalizedBy(null);
      toast.success("리포트 확정이 취소되었습니다.");
      onUpdate?.();
    } catch (error) {
      console.error("Unfinalize error:", error);
      toast.error(error instanceof Error ? error.message : "확정 취소에 실패했습니다.");
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleCancel = () => {
    setNotes(initialNotes || "");
    setIsEditing(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            매니저 코멘트
          </CardTitle>
          <CardDescription>
            팀원에게 전달할 피드백과 코멘트를 작성하세요.
          </CardDescription>
        </div>
        {isFinalized ? (
          <Badge variant="default" className="bg-green-600">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            확정됨
          </Badge>
        ) : (
          <Badge variant="secondary">수정 가능</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 확정 정보 */}
        {isFinalized && finalizedAt && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
            <p>
              {new Date(finalizedAt).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              에 {finalizedBy}님이 확정
            </p>
          </div>
        )}

        {/* 코멘트 에디터 */}
        {isEditing ? (
          <div className="space-y-3">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="팀원에게 전달할 피드백을 작성하세요..."
              rows={6}
              className="resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                <X className="mr-2 h-4 w-4" />
                취소
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                저장
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {notes ? (
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="whitespace-pre-wrap text-sm">{notes}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                <p className="text-sm">아직 작성된 코멘트가 없습니다.</p>
              </div>
            )}

            {/* 버튼들 */}
            <div className="flex flex-wrap gap-2">
              {!isFinalized && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit2 className="mr-2 h-4 w-4" />
                  {notes ? "수정" : "작성"}
                </Button>
              )}

              {isAdmin && !isFinalized && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" disabled={isFinalizing}>
                      {isFinalizing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      리포트 확정
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>리포트를 확정하시겠습니까?</AlertDialogTitle>
                      <AlertDialogDescription>
                        확정된 리포트는 더 이상 수정할 수 없습니다.
                        필요한 경우 관리자가 확정을 취소할 수 있습니다.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction onClick={handleFinalize}>
                        확정
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {isAdmin && isFinalized && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={isFinalizing}>
                      {isFinalizing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Unlock className="mr-2 h-4 w-4" />
                      )}
                      확정 취소
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>확정을 취소하시겠습니까?</AlertDialogTitle>
                      <AlertDialogDescription>
                        확정을 취소하면 리포트를 다시 수정할 수 있습니다.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction onClick={handleUnfinalize}>
                        확정 취소
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

