import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { DayCommits } from "@/types";
import JournalPageClient from "./page-new";

async function getJournalData(runId: string, userId: string) {
  const run = await db.analysisRun.findUnique({
    where: { id: runId },
    include: {
      org: {
        include: {
          members: {
            where: { userId },
          },
        },
      },
      user: {
        select: {
          login: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!run || run.org.members.length === 0) {
    return null;
  }

  const startDate = new Date(run.year, 0, 1);
  const endDate = new Date(run.year, 11, 31, 23, 59, 59);

  const commits = await db.commit.findMany({
    where: {
      authorLogin: run.userLogin,
      committedAt: {
        gte: startDate,
        lte: endDate,
      },
      repo: {
        orgId: run.orgId,
      },
    },
    include: {
      repo: {
        select: {
          name: true,
          fullName: true,
        },
      },
    },
    orderBy: {
      committedAt: "asc",
    },
  });

  const commitsByDate = new Map<string, typeof commits>();
  commits.forEach((commit) => {
    const dateKey = commit.committedAt.toISOString().split("T")[0];
    if (!commitsByDate.has(dateKey)) {
      commitsByDate.set(dateKey, []);
    }
    commitsByDate.get(dateKey)!.push(commit);
  });

  const dayCommits: DayCommits[] = Array.from(commitsByDate.entries())
    .map(([date, commits]) => ({
      date,
      commits: commits.map((c) => ({
        sha: c.sha,
        message: c.message,
        repoName: c.repo.name,
        repoFullName: c.repo.fullName,
        additions: c.additions,
        deletions: c.deletions,
        committedAt: c.committedAt,
      })),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    run,
    dayCommits,
    totalCommits: commits.length,
  };
}

export default async function JournalPage({
  params,
}: {
  params: Promise<{ login: string; runId: string }>;
}) {
  const { login, runId } = await params;
  const currentUser = await getUser();

  if (!currentUser) {
    redirect("/login");
  }

  const data = await getJournalData(runId, currentUser.id);

  if (!data) {
    notFound();
  }

  const { run, dayCommits, totalCommits } = data;

  return (
    <JournalPageClient
      runId={runId}
      orgLogin={login}
      year={run.year}
      userLogin={run.userLogin}
      userName={run.user.name}
      userAvatarUrl={run.user.avatarUrl}
      initialDayCommits={dayCommits}
      totalCommits={totalCommits}
    />
  );
}
