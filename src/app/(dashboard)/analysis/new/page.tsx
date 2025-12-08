"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import {
  Play,
  ChevronDown,
  Users,
  Calendar,
  Building2,
  Loader2,
} from "lucide-react";

// 임시 데이터
const organizations = [
  { login: "studiobaton", name: "Studio Baton" },
];

const members = [
  { login: "user1", name: "홍길동" },
  { login: "user2", name: "김철수" },
  { login: "user3", name: "이영희" },
  { login: "user4", name: "박민수" },
  { login: "user5", name: "최지영" },
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function NewAnalysisPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // 폼 상태
  const [selectedOrg, setSelectedOrg] = useState("");
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [llmModel, setLlmModel] = useState<"gpt-4o" | "claude-3-5-sonnet">("gpt-4o");
  const [includeArchived, setIncludeArchived] = useState(false);

  const allSelected = selectedUsers.length === members.length;

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
        throw new Error("분석 시작에 실패했습니다.");
      }

      const data = await response.json();
      toast.success("분석이 시작되었습니다!");
      router.push(`/analysis/${data.runId}`);
    } catch (error) {
      console.error("Analysis start error:", error);
      toast.error("분석 시작에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container max-w-2xl py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">새 분석 실행</h1>
        <p className="mt-2 text-muted-foreground">
          조직과 연도를 선택하고 분석할 팀원을 지정하세요.
        </p>
      </div>

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
                  <SelectItem key={org.login} value={org.login}>
                    {org.name} (@{org.login})
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

          <Separator />

          {/* 사용자 선택 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                분석 대상 사용자
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
              >
                {allSelected ? "전체 해제" : "전체 선택"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {members.map((member) => (
                <div
                  key={member.login}
                  className="flex items-center space-x-2 rounded-lg border p-3"
                >
                  <Checkbox
                    id={member.login}
                    checked={selectedUsers.includes(member.login)}
                    onCheckedChange={() => handleUserToggle(member.login)}
                  />
                  <label
                    htmlFor={member.login}
                    className="flex-1 cursor-pointer text-sm"
                  >
                    <span className="font-medium">{member.name}</span>
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
          </div>

          <Separator />

          {/* 고급 옵션 */}
          <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                고급 옵션
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${
                    isAdvancedOpen ? "rotate-180" : ""
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
            disabled={isLoading || !selectedOrg || selectedUsers.length === 0}
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
    </div>
  );
}

