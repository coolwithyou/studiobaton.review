import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import { NewAnalysisForm } from "@/components/analysis/new-analysis-form";

async function getOrganization(orgLogin: string, userId: string) {
  const org = await db.organization.findUnique({
    where: { login: orgLogin },
    include: {
      members: {
        where: { userId },
      },
    },
  });

  if (!org) {
    notFound();
  }

  if (org.members.length === 0) {
    redirect("/dashboard");
  }

  // installationId 확인
  if (!org.installationId) {
    redirect(`/organizations/${orgLogin}/settings`);
  }

  return org;
}

async function NewAnalysisContent({ orgLogin }: { orgLogin: string }) {
  return <NewAnalysisForm orgLogin={orgLogin} />;
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default async function NewAnalysisPage({
  params,
}: {
  params: Promise<{ login: string }>;
}) {
  const { login } = await params;
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  const org = await getOrganization(login, user.id);

  return (
    <div className="container max-w-2xl py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">새 분석 실행</h1>
        <p className="mt-2 text-muted-foreground">
          {org.name || org.login}의 연도를 선택하고 분석할 팀원을 지정하세요.
        </p>
      </div>

      <Suspense fallback={<LoadingState />}>
        <NewAnalysisContent orgLogin={login} />
      </Suspense>
    </div>
  );
}
