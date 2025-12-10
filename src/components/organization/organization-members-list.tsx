"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Mail, Plus, X, Save } from "lucide-react";

interface Member {
  login: string;
  avatarUrl: string;
  name: string | null;
  email: string | null;
  aliases: string[];
  hasData: boolean;
}

interface OrganizationMembersListProps {
  orgLogin: string;
}

export function OrganizationMembersList({ orgLogin }: OrganizationMembersListProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await fetch(`/api/organizations/${orgLogin}/members`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "멤버 조회 실패");
        }
        const data = await res.json();
        setMembers(data.members);
      } catch (err) {
        setError(err instanceof Error ? err.message : "멤버 조회 실패");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMembers();
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
        <CardContent className="py-12 text-center">
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>멤버 목록</CardTitle>
        <CardDescription>
          조직의 GitHub 멤버 목록입니다. 이메일 alias를 설정하여 커밋 작성자를 정확히 매핑할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {members.map((member) => (
            <MemberRow key={member.login} member={member} orgLogin={orgLogin} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MemberRow({ member, orgLogin }: { member: Member; orgLogin: string }) {
  const [aliases, setAliases] = useState(member.aliases);
  const [newAlias, setNewAlias] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleAddAlias = () => {
    if (!newAlias.trim()) return;
    if (!newAlias.includes("@")) {
      toast.error("올바른 이메일 형식을 입력해주세요.");
      return;
    }
    if (aliases.includes(newAlias)) {
      toast.error("이미 등록된 이메일입니다.");
      return;
    }
    setAliases([...aliases, newAlias.trim()]);
    setNewAlias("");
  };

  const handleRemoveAlias = (alias: string) => {
    setAliases(aliases.filter((a) => a !== alias));
  };

  const handleSaveAliases = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/github-users/${member.login}/aliases`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aliases }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "저장에 실패했습니다.");
      }

      toast.success("이메일 alias가 저장되었습니다.");
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Save aliases error:", error);
      toast.error(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarImage src={member.avatarUrl} />
          <AvatarFallback>{member.login.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">{member.name || member.login}</p>
          <p className="text-sm text-muted-foreground">@{member.login}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {member.aliases.length > 0 && (
          <Badge variant="outline">
            <Mail className="mr-1 h-3 w-3" />
            {member.aliases.length} alias
          </Badge>
        )}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              이메일 설정
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>이메일 Alias 설정</DialogTitle>
              <DialogDescription>
                @{member.login}의 커밋에 사용된 이메일 주소를 등록합니다.
                서로 다른 이메일로 커밋한 경우에도 같은 사용자로 인식됩니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* 등록된 alias 목록 */}
              <div className="space-y-2">
                {aliases.map((alias) => (
                  <div
                    key={alias}
                    className="flex items-center justify-between rounded-lg bg-muted px-3 py-2"
                  >
                    <span className="text-sm">{alias}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveAlias(alias)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {aliases.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    등록된 이메일이 없습니다.
                  </p>
                )}
              </div>

              {/* 새 alias 추가 */}
              <div className="flex gap-2">
                <Input
                  placeholder="email@example.com"
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddAlias()}
                />
                <Button variant="outline" onClick={handleAddAlias}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* 저장 버튼 */}
              <div className="flex justify-end">
                <Button onClick={handleSaveAliases} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  저장
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

