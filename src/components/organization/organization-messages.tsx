"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

const messages: Record<string, { type: "success" | "error"; text: string }> = {
  app_installed: { type: "success", text: "GitHub App이 성공적으로 설치되었습니다!" },
  app_updated: { type: "success", text: "GitHub App이 업데이트되었습니다." },
  app_uninstalled: { type: "success", text: "GitHub App이 제거되었습니다." },
  missing_installation_id: { type: "error", text: "설치 정보를 찾을 수 없습니다." },
  invalid_installation: { type: "error", text: "유효하지 않은 설치입니다." },
  installation_failed: { type: "error", text: "설치 중 오류가 발생했습니다. 다시 시도해주세요." },
  auth_required: { type: "error", text: "로그인이 필요합니다." },
};

export function OrganizationMessages() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const message = searchParams.get("message");
    const error = searchParams.get("error");
    const orgLogin = searchParams.get("org");

    if (message && messages[message]) {
      const msg = messages[message];
      if (msg.type === "success") {
        toast.success(msg.text, {
          description: orgLogin ? `조직: ${orgLogin}` : undefined,
        });
      }
    }

    if (error && messages[error]) {
      const msg = messages[error];
      toast.error(msg.text);
    }

    // URL에서 파라미터 제거 (히스토리 업데이트)
    if (message || error) {
      const url = new URL(window.location.href);
      url.searchParams.delete("message");
      url.searchParams.delete("error");
      url.searchParams.delete("org");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

  return null;
}

