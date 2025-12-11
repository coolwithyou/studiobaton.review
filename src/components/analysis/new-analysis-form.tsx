"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Play,
  ChevronDown,
  Users,
  Calendar,
  Building2,
  Loader2,
  AlertCircle,
  Plus,
  GitBranch,
  RefreshCcw,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface Organization {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  installationId: number | null;
}

interface Member {
  login: string;
  avatarUrl: string;
  name: string | null;
  email: string | null;
  aliases: string[];
  hasData: boolean;
}

interface NewAnalysisFormProps {
  organizations: Organization[];
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

export function NewAnalysisForm({ organizations }: NewAnalysisFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialOrg = searchParams.get("org") || "";

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // 폼 상태
  const [selectedOrg, setSelectedOrg] = useState(initialOrg);
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [llmModel, setLlmModel] = useState<"gpt-4o" | "claude-3-5-sonnet">("gpt-4o");
  const [includeArchived, setIncludeArchived] = useState(false);

  // 멤버 목록
  const [members, setMembers] = useState<Member[]>([]);
  const [membersError, setMembersError] = useState<string | null>(null);

  // 동기화 상태
  const [syncStatus, setSyncStatus] = useState<"PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | null>(null);
  const [syncJobId, setSyncJobId] = useState<string | null>(null);
  const [isLoadingSync, setIsLoadingSync] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // 권한 상태
  const [permissionStatus, setPermissionStatus] = useState<{
    hasAllRequired: boolean;
    hasPRPermission: boolean;
  } | null>(null);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);

  const allSelected = members.length > 0 && selectedUsers.length === members.length;

  // 조직 + 연도 선택 시 동기화 상태 조회
  useEffect(() => {
    if (!selectedOrg || !selectedYear) {
      setSyncStatus(null);
      setSyncJobId(null);
      return;
    }

    const checkSyncStatus = async () => {
      setIsLoadingSync(true);
      try {
        const res = await fetch(`/api/commits/sync/${selectedOrg}/${selectedYear}`);
        if (res.ok) {
          const data = await res.json();
          setSyncStatus(data.status);
          setSyncJobId(data.id);
        } else if (res.status === 404) {
          // 동기화 작업이 없음
          setSyncStatus(null);
          setSyncJobId(null);
        }
      } catch (error) {
        console.error("Error checking sync status:", error);
        setSyncStatus(null);
        setSyncJobId(null);
      } finally {
        setIsLoadingSync(false);
      }
    };

    checkSyncStatus();
  }, [selectedOrg, selectedYear]);

  // 조직 선택 시 멤버 목록 조회
  useEffect(() => {
    if (!selectedOrg) {
      setMembers([]);
      setSelectedUsers([]);
      return;
    }

    const fetchMembers = async () => {
      setIsLoadingMembers(true);
      setMembersError(null);
      setMembers([]);
      setSelectedUsers([]);

      try {
        const res = await fetch(`/api/organizations/${selectedOrg}/members`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "멤버 조회 실패");
        }
        const data = await res.json();
        setMembers(data.members);
      } catch (error) {
        console.error("Error fetching members:", error);
        setMembersError(error instanceof Error ? error.message : "멤버 조회 실패");
      } finally {
        setIsLoadingMembers(false);
      }
    };

    fetchMembers();
  }, [selectedOrg]);

  // 조직 선택 시 권한 상태 조회
  useEffect(() => {
    if (!selectedOrg) {
      setPermissionStatus(null);
      return;
    }

    const checkPermissions = async () => {
      setIsLoadingPermissions(true);
      try {
        const res = await fetch(`/api/github-app/permissions?orgLogin=${selectedOrg}`);
        if (res.ok) {
          const data = await res.json();
          setPermissionStatus({
            hasAllRequired: data.hasAllRequired,
            hasPRPermission: data.hasPRPermission,
          });
        } else {
          setPermissionStatus(null);
        }
      } catch (error) {
        console.error("Error checking permissions:", error);
        setPermissionStatus(null);
      } finally {
        setIsLoadingPermissions(false);
      }
    };

    checkPermissions();
  }, [selectedOrg]);

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(members.map((m) => m.login));
    }
  };

  const handleUserToggle = (login: string) => {
    setSelectedUsers((prev) =>
      prev.includes(login)
        ? prev.filter((u) => u !== login)
        : [...prev, login]
    );
  };

  const handleStartSync = async () => {
    if (!selectedOrg || !selectedYear) {
      toast.error("조직과 연도를 선택해주세요.");
      return;
    }

    setIsSyncing(true);
    try {
      const res = await fetch("/api/commits/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgLogin: selectedOrg,
          year: parseInt(selectedYear),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        
        // 권한 에러 처리
        if (data.permissionError) {
          toast.error(data.error, {
            description: "권한 설정 페이지에서 Pull requests 권한을 추가해주세요.",
            duration: 5000,
          });
          return;
        }
        
        throw new Error(data.error || "동기화 시작 실패");
      }

      const data = await res.json();
      setSyncJobId(data.syncJobId);
      setSyncStatus("IN_PROGRESS");
      toast.success("커밋 동기화가 시작되었습니다.");
    } catch (error) {
      console.error("Error starting sync:", error);
      toast.error(error instanceof Error ? error.message : "동기화 시작 실패");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedOrg) {
      toast.error("조직을 선택해주세요.");
      return;
    }

    if (selectedUsers.length === 0) {
      toast.error("분석할 사용자를 선택해주세요.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/analysis/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgLogin: selectedOrg,
          year: parseInt(selectedYear),
          userLogins: selectedUsers,
          options: {
            llmModel,
            includeArchived,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();

        // 동기화 필요 에러
        if (data.syncRequired) {
          toast.error("해당 연도의 커밋 동기화가 필요합니다.", {
            description: "먼저 커밋 동기화를 완료해주세요.",
          });
          return;
        }

        // 409 에러: 기존 분석이 진행 중
        if (response.status === 409 && data.runId) {
          const statusMessages: Record<string, string> = {
            QUEUED: "대기 중",
            SCANNING_REPOS: "저장소 스캔 중",
            SCANNING_COMMITS: "커밋 수집 중",
            BUILDING_UNITS: "Work Unit 생성 중",
            AWAITING_AI_CONFIRMATION: "AI 리뷰 대기 중",
            REVIEWING: "AI 리뷰 중",
            FINALIZING: "리포트 생성 중",
          };

          const statusText = statusMessages[data.currentStatus] || "진행 중";

          toast.info(
            `${selectedYear}년 분석이 이미 ${statusText}입니다. 해당 페이지로 이동합니다.`,
            { duration: 3000 }
          );

          router.push(`/analysis/${data.runId}`);
          return;
        }

        throw new Error(data.error || "분석 시작에 실패했습니다.");
      }

      const data = await response.json();
      toast.success("분석이 시작되었습니다!");
      router.push(`/analysis/${data.runId}`);
    } catch (error) {
      console.error("Analysis start error:", error);
      toast.error(error instanceof Error ? error.message : "분석 시작에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  if (organizations.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">등록된 조직이 없습니다</h3>
          <p className="mb-4 text-center text-muted-foreground">
            분석을 시작하려면 먼저 GitHub App을 조직에 설치해주세요.
          </p>
          <Button asChild>
            <Link href="/organizations">
              <Plus className="mr-2 h-4 w-4" />
              조직 등록하기
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>분석 설정</CardTitle>
        <CardDescription>
          분석할 조직, 연도, 대상 사용자를 선택합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 조직 선택 */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            조직
          </Label>
          <Select value={selectedOrg} onValueChange={setSelectedOrg}>
            <SelectTrigger>
              <SelectValue placeholder="조직 선택" />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((org) => (
                <SelectItem key={org.id} value={org.login}>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={org.avatarUrl || undefined} />
                      <AvatarFallback className="text-xs">
                        {org.login.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {org.name || org.login} (@{org.login})
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 연도 선택 */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            연도
          </Label>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}년
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 커밋 동기화 상태 */}
        {selectedOrg && selectedYear && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                <span className="font-medium">커밋 동기화</span>
              </div>
              {isLoadingSync ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : syncStatus === "COMPLETED" ? (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  완료
                </Badge>
              ) : syncStatus === "IN_PROGRESS" ? (
                <Badge variant="secondary">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  진행 중
                </Badge>
              ) : syncStatus === "FAILED" ? (
                <Badge variant="destructive">
                  <XCircle className="mr-1 h-3 w-3" />
                  실패
                </Badge>
              ) : (
                <Badge variant="outline">미완료</Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              {syncStatus === "COMPLETED"
                ? `${selectedYear}년 커밋이 동기화되었습니다. 분석을 시작할 수 있습니다.`
                : syncStatus === "IN_PROGRESS"
                  ? "커밋 동기화가 진행 중입니다. 완료될 때까지 기다려주세요."
                  : syncStatus === "FAILED"
                    ? "동기화에 실패했습니다. 다시 시도해주세요."
                    : `${selectedYear}년 커밋을 먼저 동기화해야 분석을 시작할 수 있습니다.`}
            </p>

            {syncStatus !== "COMPLETED" && syncStatus !== "IN_PROGRESS" && (
              <Button
                onClick={handleStartSync}
                disabled={isSyncing}
                variant="outline"
                className="w-full"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    동기화 시작 중...
                  </>
                ) : (
                  <>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    커밋 동기화 시작
                  </>
                )}
              </Button>
            )}

            {syncStatus === "IN_PROGRESS" && syncJobId && (
              <Link href={`/sync/${syncJobId}`}>
                <Button variant="ghost" size="sm" className="w-full">
                  진행 상황 보기 →
                </Button>
              </Link>
            )}
          </div>
        )}

        <Separator />

        {/* 사용자 선택 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              분석 대상 사용자
            </Label>
            {members.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
              >
                {allSelected ? "전체 해제" : "전체 선택"}
              </Button>
            )}
          </div>

          {!selectedOrg && (
            <p className="text-sm text-muted-foreground">
              조직을 선택하면 멤버 목록이 표시됩니다.
            </p>
          )}

          {isLoadingMembers && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {membersError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <p className="text-sm text-destructive">{membersError}</p>
            </div>
          )}

          {members.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {members.map((member) => (
                  <div
                    key={member.login}
                    className="flex items-center space-x-3 rounded-lg border p-3"
                  >
                    <Checkbox
                      id={member.login}
                      checked={selectedUsers.includes(member.login)}
                      onCheckedChange={() => handleUserToggle(member.login)}
                    />
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={member.avatarUrl} />
                      <AvatarFallback>
                        {member.login.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <label
                      htmlFor={member.login}
                      className="flex-1 cursor-pointer text-sm"
                    >
                      <span className="font-medium">
                        {member.name || member.login}
                      </span>
                      <span className="ml-1 text-muted-foreground">
                        @{member.login}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedUsers.length}명 선택됨
              </p>
            </>
          )}
        </div>

        <Separator />

        {/* 고급 옵션 */}
        <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              고급 옵션
              <ChevronDown
                className={`h-4 w-4 transition-transform ${isAdvancedOpen ? "rotate-180" : ""
                  }`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>LLM 모델</Label>
              <Select
                value={llmModel}
                onValueChange={(v) => setLlmModel(v as typeof llmModel)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o">GPT-4o (OpenAI)</SelectItem>
                  <SelectItem value="claude-3-5-sonnet">
                    Claude 3.5 Sonnet (Anthropic)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="includeArchived"
                checked={includeArchived}
                onCheckedChange={(checked) =>
                  setIncludeArchived(checked as boolean)
                }
              />
              <label htmlFor="includeArchived" className="text-sm">
                아카이브된 저장소 포함
              </label>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* 실행 버튼 */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmit}
          disabled={isLoading || !selectedOrg || selectedUsers.length === 0 || syncStatus !== "COMPLETED"}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              분석 시작 중...
            </>
          ) : (
            <>
              <Play className="mr-2 h-5 w-5" />
              분석 시작
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

