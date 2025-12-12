import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import { CompareReportsContent } from "@/components/reports/compare-reports-content";

interface SearchParams {
  user?: string;
}

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

  return org;
}

async function ComparePageContent({
  orgLogin,
  searchParams,
}: {
  orgLogin: string;
  searchParams: SearchParams;
}) {
  return (
    <CompareReportsContent
      orgLogin={orgLogin}
      initialUserLogin={searchParams.user}
    />
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default async function CompareReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ login: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { login } = await params;
  const params2 = await searchParams;

  const user = await getUser();
  if (!user) {
    redirect("/login");
  }

  const org = await getOrganization(login, user.id);

  return (
    <div className="container py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">연도별 비교</h1>
        <p className="mt-2 text-muted-foreground">
          {org.name || org.login}의 팀원별 연도별 성과를 비교하고 성장 추이를 확인하세요.
        </p>
      </div>

      <Suspense fallback={<LoadingState />}>
        <ComparePageContent orgLogin={login} searchParams={params2} />
      </Suspense>
    </div>
  );
}
