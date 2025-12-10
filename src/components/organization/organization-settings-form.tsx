"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Save, Loader2, FolderCog, Sparkles, FileText } from "lucide-react";

interface CriticalPath {
  pattern: string;
  weight: number;
}

interface OrgSettings {
  criticalPaths?: CriticalPath[];
  excludedRepos?: string[];
  defaultLlmModel?: string;
  teamStandards?: string;
}

interface OrganizationSettingsFormProps {
  orgLogin: string;
  initialSettings: OrgSettings;
}

export function OrganizationSettingsForm({
  orgLogin,
  initialSettings,
}: OrganizationSettingsFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [criticalPaths, setCriticalPaths] = useState<CriticalPath[]>(
    initialSettings.criticalPaths || []
  );
  const [defaultLlmModel, setDefaultLlmModel] = useState(
    initialSettings.defaultLlmModel || "gpt-4o"
  );
  const [teamStandards, setTeamStandards] = useState(
    initialSettings.teamStandards || ""
  );

  const handleAddPath = () => {
    setCriticalPaths([...criticalPaths, { pattern: "", weight: 2.0 }]);
  };

  const handleRemovePath = (index: number) => {
    setCriticalPaths(criticalPaths.filter((_, i) => i !== index));
  };

  const handlePathChange = (
    index: number,
    field: "pattern" | "weight",
    value: string | number
  ) => {
    const updated = [...criticalPaths];
    if (field === "pattern") {
      updated[index].pattern = value as string;
    } else {
      updated[index].weight = value as number;
    }
    setCriticalPaths(updated);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/organizations/${orgLogin}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            criticalPaths: criticalPaths.filter((p) => p.pattern.trim()),
            defaultLlmModel,
            teamStandards,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "저장에 실패했습니다.");
      }

      toast.success("설정이 저장되었습니다.");
    } catch (error) {
      console.error("Save error:", error);
      toast.error(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 핵심 모듈 경로 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderCog className="h-5 w-5" />
            핵심 모듈 경로
          </CardTitle>
          <CardDescription>
            임팩트 스코어 계산 시 가중치를 부여할 경로 패턴을 설정합니다.
            예: src/auth, src/payment, core/
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {criticalPaths.map((path, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="flex-1">
                <Input
                  placeholder="경로 패턴 (예: src/auth)"
                  value={path.pattern}
                  onChange={(e) => handlePathChange(index, "pattern", e.target.value)}
                />
              </div>
              <div className="w-32">
                <Select
                  value={path.weight.toString()}
                  onValueChange={(v) => handlePathChange(index, "weight", parseFloat(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1.5">1.5x</SelectItem>
                    <SelectItem value="2">2x</SelectItem>
                    <SelectItem value="2.5">2.5x</SelectItem>
                    <SelectItem value="3">3x</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemovePath(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={handleAddPath}>
            <Plus className="mr-2 h-4 w-4" />
            경로 추가
          </Button>
        </CardContent>
      </Card>

      {/* 기본 LLM 모델 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI 설정
          </CardTitle>
          <CardDescription>
            AI 리뷰에 사용할 기본 LLM 모델을 선택합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>기본 LLM 모델</Label>
            <Select value={defaultLlmModel} onValueChange={setDefaultLlmModel}>
              <SelectTrigger className="w-64">
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
        </CardContent>
      </Card>

      {/* 팀 코딩 기준 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            팀 코딩 기준
          </CardTitle>
          <CardDescription>
            AI 리뷰 시 참고할 팀 코딩 컨벤션이나 기준을 작성합니다.
            이 내용은 AI 프롬프트에 포함됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="예:
- TypeScript strict 모드 사용
- 함수형 컴포넌트 우선
- 테스트 커버리지 80% 이상 목표
- PR 리뷰 필수
..."
            value={teamStandards}
            onChange={(e) => setTeamStandards(e.target.value)}
            rows={8}
          />
        </CardContent>
      </Card>

      {/* 저장 버튼 */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          설정 저장
        </Button>
      </div>
    </div>
  );
}

