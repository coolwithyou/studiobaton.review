import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import { SyncProgress } from "@/components/analysis/sync-progress";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function SyncProgressPage({
  params,
}: {
  params: Promise<{ login: string; syncJobId: string }>;
}) {
  const { login, syncJobId } = await params;
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  const syncJob = await db.commitSyncJob.findUnique({
    where: { id: syncJobId },
    include: {
      org: {
        include: {
          members: {
            where: { userId: user.id },
          },
        },
      },
    },
  });

  if (!syncJob) {
    notFound();
  }

  // 조직 확인
  if (syncJob.org.login !== login) {
    notFound();
  }

  // 멤버십 확인
  if (syncJob.org.members.length === 0) {
    redirect("/dashboard");
  }

  return (
    <div className="container py-8 px-4">
      <div className="mb-8">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href={`/organizations/${login}/analysis/new`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            분석 시작 페이지
          </Link>
        </Button>

        <h1 className="text-3xl font-bold mb-2">커밋 동기화</h1>
        <p className="text-muted-foreground">
          {syncJob.org.name || syncJob.org.login} 조직의 {syncJob.year}년 커밋 동기화 진행 상황
        </p>
      </div>

      <SyncProgress
        syncJobId={syncJobId}
        orgLogin={syncJob.org.login}
        year={syncJob.year}
      />
    </div>
  );
}
