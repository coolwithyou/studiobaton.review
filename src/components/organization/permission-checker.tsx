"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertCircle, Loader2, RefreshCcw } from "lucide-react";

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

export function PermissionChecker({ orgLogin }: { orgLogin: string }) {
  const [data, setData] = useState<PermissionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/github-app/permissions?orgLogin=${orgLogin}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to fetch permissions");
      }
      const permData = await res.json();
      setData(permData);
    } catch (err) {
      console.error("Error fetching permissions:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, [orgLogin]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={fetchPermissions} variant="outline">
              <RefreshCcw className="mr-2 h-4 w-4" />
              다시 시도
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* 전체 상태 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>전체 권한 상태</CardTitle>
            <Button onClick={fetchPermissions} variant="ghost" size="sm">
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-4 rounded-lg border">
              {data.hasAllRequired ? (
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              ) : (
                <XCircle className="h-8 w-8 text-destructive" />
              )}
              <div>
                <p className="font-medium">필수 권한</p>
                <p className="text-sm text-muted-foreground">
                  {data.hasAllRequired ? "모두 충족" : "일부 부족"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-lg border">
              {data.hasPRPermission ? (
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              ) : (
                <AlertCircle className="h-8 w-8 text-yellow-600" />
              )}
              <div>
                <p className="font-medium">PR 권한 (권장)</p>
                <p className="text-sm text-muted-foreground">
                  {data.hasPRPermission ? "사용 가능" : "권한 없음"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 상세 권한 */}
      <Card>
        <CardHeader>
          <CardTitle>권한 상세</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.checks.map((check) => (
              <div
                key={check.permission}
                className="flex items-start justify-between p-4 rounded-lg border"
              >
                <div className="flex items-start gap-3 flex-1">
                  {check.status === "ok" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  ) : check.status === "insufficient" ? (
                    <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">{check.permission}</p>
                      {check.permission === "pull_requests" && (
                        <Badge variant="outline" className="text-xs">
                          권장
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {check.description}
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">필요:</span>
                      <Badge variant="outline">{check.required}</Badge>
                      <span className="text-muted-foreground">현재:</span>
                      <Badge
                        variant={
                          check.granted === "none"
                            ? "destructive"
                            : check.status === "ok"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {check.granted}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div>
                  {check.status === "ok" ? (
                    <Badge variant="default" className="bg-green-600">
                      정상
                    </Badge>
                  ) : check.status === "insufficient" ? (
                    <Badge variant="secondary">부족</Badge>
                  ) : (
                    <Badge variant="destructive">없음</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* PR 권한 없을 때 안내 */}
      {!data.hasPRPermission && (
        <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
          <CardHeader>
            <CardTitle className="text-yellow-800 dark:text-yellow-300">
              Pull Request 권한 없음
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-2">
              Pull Request 권한이 없어도 기본 기능은 모두 사용할 수 있습니다.
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              단, 커밋 동기화 시 PR 정보는 수집되지 않습니다. PR 정보를 포함하려면 위의
              방법대로 권한을 추가해주세요.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
