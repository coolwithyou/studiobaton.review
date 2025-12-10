import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import { NewAnalysisForm } from "@/components/analysis/new-analysis-form";

interface Organization {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  installationId: number | null;
}

async function getOrganizations(): Promise<Organization[]> {
  const user = await getUser();
  if (!user) return [];

  const orgs = await db.organization.findMany({
    where: {
      members: {
        some: { userId: user.id },
      },
      installationId: { not: null }, // App 설치된 것만
    },
    select: {
      id: true,
      login: true,
      name: true,
      avatarUrl: true,
      installationId: true,
    },
    orderBy: { login: "asc" },
  });

  return orgs;
}

async function NewAnalysisContent() {
  const orgs = await getOrganizations();
  
  return <NewAnalysisForm organizations={orgs} />;
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function NewAnalysisPage() {
  return (
    <div className="container max-w-2xl py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">새 분석 실행</h1>
        <p className="mt-2 text-muted-foreground">
          조직과 연도를 선택하고 분석할 팀원을 지정하세요.
        </p>
      </div>

      <Suspense fallback={<LoadingState />}>
        <NewAnalysisContent />
      </Suspense>
    </div>
  );
}
