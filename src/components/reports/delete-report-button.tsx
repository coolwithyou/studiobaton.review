"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DeleteReportButtonProps {
  reportId: string;
  isAdmin: boolean;
  orgLogin: string;
  userName: string;
}

export function DeleteReportButton({
  reportId,
  isAdmin,
  orgLogin,
  userName,
}: DeleteReportButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // 관리자가 아니면 버튼 숨김
  if (!isAdmin) {
    return null;
  }

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "리포트 삭제에 실패했습니다.");
      }

      toast.success("리포트가 삭제되었습니다. 분석을 다시 시작할 수 있습니다.");
      
      // 조직 페이지로 리다이렉트
      router.push(data.redirectUrl || `/organizations/${orgLogin}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "오류가 발생했습니다.");
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          리포트 삭제
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>리포트를 삭제하시겠습니까?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              <strong>{userName}</strong>의 리포트와 관련된 모든 분석 데이터가 삭제됩니다.
            </p>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li>연간 리포트</li>
              <li>작업 단위 (Work Units)</li>
              <li>AI 분석 결과</li>
              <li>Job 실행 로그</li>
            </ul>
            <p className="text-sm mt-3">
              삭제 후 조직 페이지에서 새로운 분석을 시작할 수 있습니다.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                삭제 중...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                삭제
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

