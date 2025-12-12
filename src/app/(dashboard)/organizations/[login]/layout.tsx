import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import { OrgSidebar } from "@/components/layout/org-sidebar";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ login: string }>;
}) {
  const { login } = await params;

  const org = await db.organization.findUnique({
    where: { login },
    select: { name: true, login: true },
  });

  return {
    title: org ? `${org.name || org.login} - Code Review` : "Code Review",
  };
}

async function getOrganizationData(login: string, userId: string) {
  // 현재 조직 조회
  const currentOrg = await db.organization.findUnique({
    where: { login },
    include: {
      members: {
        where: { userId },
      },
    },
  });

  if (!currentOrg) {
    notFound();
  }

  // 멤버십 확인
  if (currentOrg.members.length === 0) {
    redirect("/dashboard");
  }

  // 사용자의 모든 조직 조회 (조직 전환용)
  const allOrgs = await db.organization.findMany({
    where: {
      members: {
        some: { userId },
      },
    },
    select: {
      id: true,
      login: true,
      name: true,
      avatarUrl: true,
    },
    orderBy: { login: "asc" },
  });

  return {
    currentOrg: {
      id: currentOrg.id,
      login: currentOrg.login,
      name: currentOrg.name,
      avatarUrl: currentOrg.avatarUrl,
    },
    allOrgs,
  };
}

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ login: string }>;
}) {
  const { login } = await params;
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  const { currentOrg, allOrgs } = await getOrganizationData(login, user.id);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <OrgSidebar currentOrg={currentOrg} allOrgs={allOrgs} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
