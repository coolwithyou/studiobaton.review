import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import { CompareReportsContent } from "@/components/reports/compare-reports-content";

interface SearchParams {
  org?: string;
  user?: string;
}

async function getCompareData(userId: string) {
  // 사용자가 속한 조직 목록
  const memberships = await db.organizationMember.findMany({
    where: { userId },
    include: {
      org: {
        select: { id: true, login: true, name: true },
      },
    },
  });

  const organizations = memberships.map((m) => m.org);

  return { organizations };
}

async function ComparePageContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getUser();
  if (!user) return null;

  const { organizations } = await getCompareData(user.id);

  return (
    <CompareReportsContent
      organizations={organizations}
      initialOrgLogin={searchParams.org}
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
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  return (
    <div className="container py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">연도별 비교</h1>
        <p className="mt-2 text-muted-foreground">
          팀원의 연도별 성과를 비교하고 성장 추이를 확인하세요.
        </p>
      </div>

      <Suspense fallback={<LoadingState />}>
        <ComparePageContent searchParams={params} />
      </Suspense>
    </div>
  );
}

