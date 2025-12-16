import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import { SyncProgress } from "@/components/sync/sync-progress";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function SyncProgressPage({
  params,
}: {
  params: Promise<{ syncJobId: string }>;
}) {
  const { syncJobId } = await params;
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  const syncJob = await db.commitSyncJob.findUnique({
    where: { id: syncJobId },
    include: { org: true },
  });

  if (!syncJob) {
    notFound();
  }

  return (
    <div className="container py-8 px-4">
      <div className="mb-8">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href={`/organizations/${syncJob.org.login}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            조직 대시보드
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
