"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface UnregisteredOrgCardProps {
  org: {
    id: number;
    login: string;
    avatarUrl: string;
    description: string | null;
  };
}

export function UnregisteredOrgCard({ org }: UnregisteredOrgCardProps) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const githubAppInstallUrl = `https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || "code-review-app"}/installations/new`;

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/organizations/${org.login}/sync`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 404) {
          toast.error("GitHub App이 설치되지 않았습니다", {
            description: "먼저 GitHub App을 설치해주세요.",
          });
        } else {
          toast.error("동기화 실패", {
            description: data.error || "알 수 없는 오류가 발생했습니다.",
          });
        }
        return;
      }

      toast.success("동기화 완료!", {
        description: `${data.organization.name || org.login}이(가) 등록되었습니다.`,
      });

      // 페이지 새로고침하여 등록된 조직으로 이동
      router.refresh();
    } catch (error) {
      console.error("Sync error:", error);
      toast.error("동기화 실패", {
        description: "네트워크 오류가 발생했습니다.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Card className="border-dashed opacity-70 hover:opacity-100 transition-opacity">
      <CardHeader className="flex flex-row items-center gap-4">
        <Avatar className="h-12 w-12">
          <AvatarImage src={org.avatarUrl} />
          <AvatarFallback>{org.login.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <CardTitle className="text-lg">{org.login}</CardTitle>
          <CardDescription className="line-clamp-1">
            {org.description || "GitHub 조직"}
          </CardDescription>
        </div>
        <Badge variant="secondary">미등록</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button
          size="sm"
          className="w-full"
          onClick={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              동기화 중...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              GitHub App 동기화
            </>
          )}
        </Button>
        <Button size="sm" className="w-full" variant="outline" asChild>
          <a href={githubAppInstallUrl} target="_blank" rel="noopener noreferrer">
            <Plus className="mr-2 h-4 w-4" />
            새로 설치하기
            <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          이미 설치했다면 동기화 버튼을 클릭하세요
        </p>
      </CardContent>
    </Card>
  );
}



