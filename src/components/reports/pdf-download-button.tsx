"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";

interface PdfDownloadButtonProps {
  reportId: string;
  userLogin: string;
  year: number;
}

export function PdfDownloadButton({ reportId, userLogin, year }: PdfDownloadButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/pdf`);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "PDF 생성에 실패했습니다.");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${userLogin}-${year}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("PDF가 다운로드되었습니다.");
    } catch (error) {
      console.error("PDF download error:", error);
      toast.error(
        error instanceof Error ? error.message : "PDF 다운로드에 실패했습니다."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button variant="outline" onClick={handleDownload} disabled={isGenerating}>
      {isGenerating ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-2 h-4 w-4" />
      )}
      PDF 다운로드
    </Button>
  );
}

