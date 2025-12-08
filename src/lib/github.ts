import { App, Octokit } from "octokit";

// ============================================
// GitHub App 클라이언트 (조직 접근용)
// ============================================

let githubApp: App | null = null;

export function getGitHubApp(): App {
  if (githubApp) return githubApp;

  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !privateKey) {
    throw new Error("GitHub App credentials not configured");
  }

  githubApp = new App({
    appId,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  });

  return githubApp;
}

// ============================================
// Installation 기반 Octokit 클라이언트
// ============================================

export async function getInstallationOctokit(
  installationId: number
): Promise<Octokit> {
  const app = getGitHubApp();
  return app.getInstallationOctokit(installationId);
}

// ============================================
// 사용자 액세스 토큰 기반 Octokit
// ============================================

export function getUserOctokit(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken });
}

// ============================================
// 조직 목록 조회 (사용자 토큰 사용)
// ============================================

export async function getUserOrganizations(accessToken: string) {
  const octokit = getUserOctokit(accessToken);

  const { data: orgs } = await octokit.rest.orgs.listForAuthenticatedUser({
    per_page: 100,
  });

  return orgs.map((org) => ({
    id: org.id,
    login: org.login,
    avatarUrl: org.avatar_url,
    description: org.description,
  }));
}

// ============================================
// 조직 멤버 목록 조회
// ============================================

export async function getOrganizationMembers(
  octokit: Octokit,
  org: string
) {
  const { data: members } = await octokit.rest.orgs.listMembers({
    org,
    per_page: 100,
  });

  return members.map((member) => ({
    id: member.id,
    login: member.login,
    avatarUrl: member.avatar_url,
  }));
}

// ============================================
// 조직 저장소 목록 조회
// ============================================

export async function getOrganizationRepos(
  octokit: Octokit,
  org: string,
  options?: { includeArchived?: boolean }
) {
  const repos = await octokit.paginate(octokit.rest.repos.listForOrg, {
    org,
    type: "all",
    per_page: 100,
  });

  return repos
    .filter((repo) => options?.includeArchived || !repo.archived)
    .map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      isArchived: repo.archived || false,
      isPrivate: repo.private,
      language: repo.language,
      description: repo.description,
    }));
}

// ============================================
// 커밋 조회 (날짜 범위 + 작성자)
// ============================================

export interface CommitQueryOptions {
  owner: string;
  repo: string;
  since: string; // ISO 8601 format
  until: string;
  author?: string;
  perPage?: number;
}

export async function getCommits(
  octokit: Octokit,
  options: CommitQueryOptions
) {
  const commits = await octokit.paginate(octokit.rest.repos.listCommits, {
    owner: options.owner,
    repo: options.repo,
    since: options.since,
    until: options.until,
    author: options.author,
    per_page: options.perPage || 100,
  });

  return commits.map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message,
    authorLogin: commit.author?.login || commit.commit.author?.name || "unknown",
    authorEmail: commit.commit.author?.email,
    committedAt: commit.commit.committer?.date || commit.commit.author?.date,
  }));
}

// ============================================
// 커밋 상세 조회 (파일 변경 정보)
// ============================================

export async function getCommitDetails(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string
) {
  const { data: commit } = await octokit.rest.repos.getCommit({
    owner,
    repo,
    ref: sha,
  });

  return {
    sha: commit.sha,
    message: commit.commit.message,
    authorLogin: commit.author?.login || commit.commit.author?.name || "unknown",
    authorEmail: commit.commit.author?.email,
    committedAt: commit.commit.committer?.date,
    stats: {
      additions: commit.stats?.additions || 0,
      deletions: commit.stats?.deletions || 0,
      total: commit.stats?.total || 0,
    },
    files: (commit.files || []).map((file) => ({
      path: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch,
    })),
  };
}

// ============================================
// GitHub App 설치 확인
// ============================================

export async function getAppInstallation(orgLogin: string) {
  try {
    const app = getGitHubApp();
    const { data: installation } = await app.octokit.rest.apps.getOrgInstallation({
      org: orgLogin,
    });
    return installation;
  } catch {
    return null;
  }
}

// ============================================
// Rate Limit 확인
// ============================================

export async function getRateLimit(octokit: Octokit) {
  const { data: rateLimit } = await octokit.rest.rateLimit.get();
  return {
    remaining: rateLimit.rate.remaining,
    limit: rateLimit.rate.limit,
    resetAt: new Date(rateLimit.rate.reset * 1000),
  };
}

