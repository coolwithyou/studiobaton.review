import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import { SyncJobManager } from "@/components/sync/sync-job-manager";

export default async function CommitSyncPage({
  params,
}: {
  params: Promise<{ login: string }>;
}) {
  const { login } = await params;
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  // 조직 조회 및 권한 확인
  const org = await db.organization.findUnique({
    where: { login },
    include: {
      members: {
        where: { userId: user.id },
      },
    },
  });

  if (!org) {
    notFound();
  }

  // 멤버십 확인
  if (org.members.length === 0) {
    redirect("/dashboard");
  }

  // 모든 동기화 작업 조회 (최신순)
  const syncJobs = await db.commitSyncJob.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div className="container py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">커밋 동기화</h1>
        <p className="text-muted-foreground">
          조직의 연도별 커밋 데이터를 동기화하고 관리합니다.
        </p>
      </div>

      <SyncJobManager
        orgLogin={org.login}
        orgName={org.name || org.login}
        existingJobs={syncJobs as any}
      />
    </div>
  );
}
