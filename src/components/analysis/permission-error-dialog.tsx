"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  RefreshCcw,
} from "lucide-react";

interface PermissionCheck {
  permission: string;
  required: "read" | "write";
  granted: "none" | "read" | "write";
  status: "ok" | "missing" | "insufficient";
  description: string;
}

interface PermissionData {
  orgLogin: string;
  installationId: number;
  hasAllRequired: boolean;
  hasPRPermission: boolean;
  checks: PermissionCheck[];
}

interface PermissionErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgLogin: string;
  missingPermission?: string;
}

export function PermissionErrorDialog({
  open,
  onOpenChange,
  orgLogin,
  missingPermission,
}: PermissionErrorDialogProps) {
  const [data, setData] = useState<PermissionData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/github-app/permissions?orgLogin=${orgLogin}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "권한 정보를 가져올 수 없습니다.");
      }
      const permData = await res.json();
      setData(permData);
    } catch (err) {
      console.error("Error fetching permissions:", err);
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open && orgLogin) {
      fetchPermissions();
    }
  }, [open, orgLogin]);

  const handleReauthorize = () => {
    if (!data?.installationId) return;

    // 조직의 installation 설정 페이지로 이동 (권한 승인 가능)
    const reauthorizeUrl = `https://github.com/organizations/${orgLogin}/settings/installations/${data.installationId}`;

    window.open(reauthorizeUrl, "_blank");
  };

  const handleRetry = () => {
    fetchPermissions();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertCircle className="h-6 w-6 text-destructive" />
            GitHub App 권한 부족
          </DialogTitle>
          <DialogDescription>
            커밋 동기화를 실행하기 위해 추가 권한이 필요합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {data && !isLoading && (
            <>
              {/* 권한 상태 목록 */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground">
                  필수 권한 상태
                </h3>
                <div className="space-y-2">
                  {data.checks.map((check) => {
                    const isMissing = check.permission === missingPermission;
                    const isRequired = check.permission !== "pull_requests";

                    return (
                      <div
                        key={check.permission}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${isMissing
                          ? "border-destructive/50 bg-destructive/5"
                          : ""
                          }`}
                      >
                        <div className="mt-0.5">
                          {check.status === "ok" ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          ) : check.status === "insufficient" ? (
                            <AlertCircle className="h-5 w-5 text-yellow-600" />
                          ) : (
                            <XCircle className="h-5 w-5 text-destructive" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <p className="font-medium">{check.permission}</p>
                            {!isRequired && (
                              <Badge variant="outline" className="text-xs">
                                권장
                              </Badge>
                            )}
                            {isMissing && (
                              <Badge variant="destructive" className="text-xs">
                                필요
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {check.description}
                          </p>
                          <div className="flex items-center gap-2 text-xs flex-wrap">
                            <span className="text-muted-foreground">필요:</span>
                            <Badge variant="outline" className="text-xs">
                              {check.required}
                            </Badge>
                            <span className="text-muted-foreground">현재:</span>
                            <Badge
                              variant={
                                check.granted === "none"
                                  ? "destructive"
                                  : check.status === "ok"
                                    ? "default"
                                    : "secondary"
                              }
                              className="text-xs"
                            >
                              {check.granted}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 재인증 가이드 */}
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="space-y-3">
                  <div>
                    <p className="font-semibold mb-2">권한 추가 및 승인 방법:</p>
                    <ol className="list-decimal list-inside space-y-2 text-sm ml-2">
                      <li>
                        <span className="font-medium">앱 개발자가 권한을 추가한 경우:</span>
                        <ul className="list-disc list-inside ml-4 mt-1 space-y-1 text-muted-foreground">
                          <li>아래 버튼을 클릭하여 조직 설정 페이지로 이동합니다.</li>
                          <li>노란색 배너에서 "Review request" 또는 "승인 요청 검토"를 클릭합니다.</li>
                          <li>새로운 권한 목록을 확인하고 "Accept new permissions" 버튼을 클릭합니다.</li>
                        </ul>
                      </li>
                      <li className="mt-2">
                        <span className="font-medium">직접 권한을 추가하는 경우:</span>
                        <ul className="list-disc list-inside ml-4 mt-1 space-y-1 text-muted-foreground">
                          <li>GitHub App 관리 페이지에서 권한을 추가합니다.</li>
                          <li>저장 후 위의 승인 절차를 진행합니다.</li>
                        </ul>
                      </li>
                      <li className="mt-2">
                        승인 완료 후 이 페이지로 돌아와 "권한 확인" 버튼을 클릭합니다.
                      </li>
                    </ol>
                  </div>
                  <div className="p-2 bg-yellow-50 dark:bg-yellow-950 rounded-md border border-yellow-200 dark:border-yellow-800">
                    <p className="text-xs text-yellow-800 dark:text-yellow-200">
                      <strong>중요:</strong> GitHub App의 권한을 변경하면 조직 관리자의 승인이 필요합니다.
                      승인하지 않으면 새로운 권한을 사용할 수 없습니다.
                    </p>
                  </div>
                </AlertDescription>
              </Alert>

              {/* PR 권한 안내 */}
              {!data.hasPRPermission && (
                <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-700 dark:text-yellow-400">
                    <p className="font-semibold mb-1">Pull Request 권한 안내</p>
                    <p className="text-sm">
                      Pull Request 권한이 없어도 기본 커밋 동기화는 가능하지만, PR
                      정보는 수집되지 않습니다. PR 정보를 포함하려면 pull_requests
                      읽기 권한을 추가해주세요.
                    </p>
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleRetry}
            disabled={isLoading}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            권한 확인
          </Button>
          <Button
            variant="default"
            onClick={handleReauthorize}
            disabled={!data?.installationId}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            조직 설정에서 권한 승인하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

