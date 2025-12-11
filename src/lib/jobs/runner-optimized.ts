/**
 * Optimized Analysis Job Runner
 * 
 * 성능 최적화 버전:
 * - 병렬 처리로 저장소 동시 스캔
 * - Batch DB 작업
 * - 진행률 업데이트 최적화
 * - Resume/Retry 지원
 */

import pLimit from "p-limit";
import { db } from "@/lib/db";
import { getInstallationOctokit, getOrganizationRepos, getCommits, getCommitDetails } from "@/lib/github";
import { clusterCommits } from "@/lib/analysis/clustering";
import { calculateImpactScore } from "@/lib/analysis/scoring";
import { AnalysisOptions } from "@/types";
import {
	RestartMode,
	analyzeResumeState,
	getReposToScan,
	isRepoAlreadyScanned,
	cleanupBeforeRestart,
	restoreProgress,
} from "./resume-handler";

interface UserProgress {
	userLogin: string;
	commits: number;
	status: "done" | "failed";
	error?: string;
}

interface RepoProgress {
	repoName: string;
	status: "pending" | "scanning" | "done" | "failed" | "partial";
	commitCount?: number;
	error?: string;
	userProgress?: UserProgress[];
}

interface ProgressState {
	phase?: string;
	total?: number;
	completed?: number;
	failed?: number;
	currentRepo?: string;
	repoProgress?: RepoProgress[];
	message?: string;
}

// 동시 실행 제한 (GitHub API rate limit 고려)
const CONCURRENT_REPOS = 5; // 동시에 스캔할 저장소 수
const CONCURRENT_COMMITS = 10; // 동시에 조회할 커밋 수
const DB_BATCH_SIZE = 100; // DB에 한 번에 저장할 레코드 수
const MAX_USER_RETRIES = 3; // 사용자별 커밋 수집 재시도 횟수

// 재시도 헬퍼
async function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// DB 상태 기반 진행률 동기화
async function syncProgressFromDB(runId: string): Promise<number> {
	const run = await db.analysisRun.findUnique({
		where: { id: runId },
		include: { org: true },
	});

	if (!run) return 0;

	// 실제 수집된 저장소의 커밋 개수 확인
	const repos = await db.repository.findMany({
		where: { orgId: run.orgId },
		select: { id: true, fullName: true },
	});

	let scannedCount = 0;

	for (const repo of repos) {
		const hasCommits = await db.commit.count({
			where: {
				repoId: repo.id,
				authorLogin: run.userLogin, // 단일 사용자
				committedAt: {
					gte: new Date(`${run.year}-01-01`),
					lte: new Date(`${run.year}-12-31T23:59:59`),
				},
			},
		});

		if (hasCommits > 0) {
			scannedCount++;
		}
	}

	return scannedCount;
}

// 진행률 업데이트 헬퍼
async function updateProgress(
	runId: string,
	updates: {
		status?: string;
		phase?: string;
		total?: number;
		completed?: number;
		failed?: number;
		currentRepo?: string;
		repoProgress?: RepoProgress[];
		error?: string;
	}
) {
	const run = await db.analysisRun.findUnique({ where: { id: runId } });
	if (!run) return;

	const currentProgress = (run.progress as ProgressState) || {};

	const newProgress = {
		phase: updates.phase ?? currentProgress.phase ?? "",
		total: updates.total ?? currentProgress.total ?? 0,
		completed: updates.completed ?? currentProgress.completed ?? 0,
		failed: updates.failed ?? currentProgress.failed ?? 0,
		currentRepo: updates.currentRepo ?? currentProgress.currentRepo ?? "",
		repoProgress: updates.repoProgress ?? currentProgress.repoProgress ?? [],
	};

	await db.analysisRun.update({
		where: { id: runId },
		data: {
			status: (updates.status as any) || run.status,
			error: updates.error,
			progress: JSON.parse(JSON.stringify(newProgress)),
		},
	});
}

// 1단계: 저장소 스캔 (기존과 동일)
export async function scanRepos(runId: string): Promise<string[]> {
	console.log(`[Job] Starting scanRepos for run ${runId}`);

	const run = await db.analysisRun.findUnique({
		where: { id: runId },
		include: { org: true },
	});

	if (!run || !run.org.installationId) {
		throw new Error("Run or installation not found");
	}

	await updateProgress(runId, {
		status: "SCANNING_REPOS",
		phase: "SCANNING_REPOS",
	});

	const octokit = await getInstallationOctokit(run.org.installationId);
	const options = run.options as AnalysisOptions;

	const repos = await getOrganizationRepos(octokit, run.org.login, {
		includeArchived: options?.includeArchived,
	});

	const excludeRepos = options?.excludeRepos || [];
	const filteredRepos = repos.filter(
		(repo) => !excludeRepos.includes(repo.fullName)
	);

	// Repository 레코드 일괄 저장
	for (const repo of filteredRepos) {
		await db.repository.upsert({
			where: { fullName: repo.fullName },
			create: {
				orgId: run.orgId,
				githubId: repo.id,
				fullName: repo.fullName,
				name: repo.name,
				defaultBranch: repo.defaultBranch,
				isArchived: repo.isArchived,
				isPrivate: repo.isPrivate,
				language: repo.language,
				description: repo.description,
			},
			update: {
				defaultBranch: repo.defaultBranch,
				isArchived: repo.isArchived,
				isPrivate: repo.isPrivate,
				language: repo.language,
				description: repo.description,
			},
		});
	}

	const repoProgress: RepoProgress[] = filteredRepos.map((r) => ({
		repoName: r.fullName,
		status: "pending" as const,
	}));

	await updateProgress(runId, {
		status: "SCANNING_COMMITS",
		phase: "SCANNING_COMMITS",
		total: filteredRepos.length,
		completed: 0,
		failed: 0,
		repoProgress,
	});

	console.log(`[Job] Found ${filteredRepos.length} repos for run ${runId}`);
	return filteredRepos.map((r) => r.fullName);
}

// 2단계: 커밋 수집 (최적화 버전)
export async function scanCommitsForRepo(
	runId: string,
	repoFullName: string
): Promise<{
	totalCommits: number;
	savedCommits: number;
	successfulUsers: string[];
	failedUsers: Array<{ userLogin: string; error: string }>;
	allUsersCompleted: boolean;
}> {
	console.log(`[Job] Scanning commits for ${repoFullName}`);

	const run = await db.analysisRun.findUnique({
		where: { id: runId },
		include: { org: true },
	});

	if (!run || !run.org.installationId) {
		throw new Error("Run or installation not found");
	}

	const repo = await db.repository.findUnique({
		where: { fullName: repoFullName },
	});

	if (!repo) {
		throw new Error(`Repository ${repoFullName} not found`);
	}

	const octokit = await getInstallationOctokit(run.org.installationId);
	const [owner, repoName] = repoFullName.split("/");
	const since = `${run.year}-01-01T00:00:00Z`;
	const until = `${run.year}-12-31T23:59:59Z`;
	const targetLogins = [run.userLogin]; // 단일 사용자

	let totalCommits = 0;
	const allCommitsToSave: any[] = [];
	const allFilesToSave: any[] = [];
	const successfulUsers: string[] = [];
	const failedUsers: Array<{ userLogin: string; error: string }> = [];

	// GitHubUser 일괄 생성
	for (const authorLogin of targetLogins) {
		await db.gitHubUser.upsert({
			where: { login: authorLogin },
			create: { login: authorLogin },
			update: {},
		});
	}

	// 각 사용자별 커밋 조회 (재시도 로직 포함)
	for (const authorLogin of targetLogins) {
		let retries = MAX_USER_RETRIES;
		let lastError: Error | null = null;
		let userCommits: any[] = [];
		let success = false;

		while (retries > 0 && !success) {
			try {
				const commits = await getCommits(octokit, {
					owner,
					repo: repoName,
					since,
					until,
					author: authorLogin,
				});

				totalCommits += commits.length;

				if (commits.length === 0) {
					// 해당 연도 활동 없음 (정상)
					successfulUsers.push(authorLogin);
					success = true;
					break;
				}

				// 병렬로 커밋 상세 정보 조회
				const limit = pLimit(CONCURRENT_COMMITS);
				const detailsPromises = commits.map((commit) =>
					limit(() => getCommitDetails(octokit, owner, repoName, commit.sha))
				);

				const allDetails = await Promise.all(detailsPromises);

				// 데이터 준비
				for (const details of allDetails) {
					const commitData = {
						repoId: repo.id,
						sha: details.sha,
						authorLogin,
						authorEmail: details.authorEmail || null,
						message: details.message,
						committedAt: new Date(details.committedAt || Date.now()),
						additions: details.stats.additions,
						deletions: details.stats.deletions,
						filesChanged: details.files.length,
					};

					allCommitsToSave.push(commitData);

					// 파일 정보 저장 (commit ID는 나중에 업데이트)
					details.files.forEach((file) => {
						allFilesToSave.push({
							sha: details.sha,
							path: file.path,
							status: file.status || "modified",
							additions: file.additions,
							deletions: file.deletions,
						});
					});
				}

				successfulUsers.push(authorLogin);
				success = true;
			} catch (userError) {
				lastError = userError as Error;
				retries--;

				console.warn(
					`[Job] Error fetching commits for ${authorLogin} in ${repoFullName} (${retries} retries left):`,
					userError
				);

				if (retries > 0) {
					// 재시도 전 대기 (exponential backoff)
					const waitTime = (MAX_USER_RETRIES - retries) * 2000; // 2초, 4초, 6초
					await sleep(waitTime);
				}
			}
		}

		if (!success) {
			// 최종 실패
			failedUsers.push({
				userLogin: authorLogin,
				error: lastError?.message || "Unknown error",
			});
			console.error(
				`[Job] ⚠️ Failed to collect commits for ${authorLogin} in ${repoFullName} after ${MAX_USER_RETRIES} retries`
			);
		}
	}

	// Batch로 커밋 저장
	let savedCommits = 0;
	const commitIdMap = new Map<string, string>(); // sha -> commitId

	for (let i = 0; i < allCommitsToSave.length; i += DB_BATCH_SIZE) {
		const batch = allCommitsToSave.slice(i, i + DB_BATCH_SIZE);

		for (const commitData of batch) {
			// upsert는 batch로 안 되므로 개별 처리 (하지만 병렬로)
			const savedCommit = await db.commit.upsert({
				where: {
					repoId_sha: {
						repoId: commitData.repoId,
						sha: commitData.sha,
					},
				},
				create: commitData,
				update: {
					additions: commitData.additions,
					deletions: commitData.deletions,
					filesChanged: commitData.filesChanged,
				},
			});

			commitIdMap.set(commitData.sha, savedCommit.id);
			savedCommits++;
		}
	}

	// Batch로 파일 저장
	const filesToCreate: any[] = [];
	for (const file of allFilesToSave) {
		const commitId = commitIdMap.get(file.sha);
		if (commitId) {
			filesToCreate.push({
				id: `${commitId}-${file.path}`.slice(0, 255),
				commitId,
				path: file.path,
				status: file.status,
				additions: file.additions,
				deletions: file.deletions,
			});
		}
	}

	// createMany로 한 번에 저장 (skipDuplicates로 중복 무시)
	for (let i = 0; i < filesToCreate.length; i += DB_BATCH_SIZE) {
		const batch = filesToCreate.slice(i, i + DB_BATCH_SIZE);
		await db.commitFile.createMany({
			data: batch,
			skipDuplicates: true,
		});
	}

	console.log(
		`[Job] Saved ${savedCommits}/${totalCommits} commits for ${repoFullName} (${successfulUsers.length}/${targetLogins.length} users)`
	);

	if (failedUsers.length > 0) {
		console.warn(
			`[Job] ⚠️ Failed users in ${repoFullName}:`,
			failedUsers.map((u) => `${u.userLogin} (${u.error})`).join(", ")
		);
	}

	return {
		totalCommits,
		savedCommits,
		successfulUsers,
		failedUsers,
		allUsersCompleted: failedUsers.length === 0,
	};
}

// 3단계: Work Unit 생성 (사용자별 검증 포함)
export async function buildWorkUnits(runId: string): Promise<number> {
	console.log(`[Job] Building work units for run ${runId}`);

	await updateProgress(runId, {
		status: "BUILDING_UNITS",
		phase: "BUILDING_UNITS",
	});

	const run = await db.analysisRun.findUnique({
		where: { id: runId },
		include: { org: true },
	});

	if (!run) {
		throw new Error("Run not found");
	}

	// 단일 사용자 커밋 존재 여부 검증
	const userLogin = run.userLogin;
	console.log(`[Job] Validating commit data for user ${userLogin}...`);

	const commitCount = await db.commit.count({
		where: {
			authorLogin: userLogin,
			repo: { orgId: run.orgId },
			committedAt: {
				gte: new Date(`${run.year}-01-01`),
				lte: new Date(`${run.year}-12-31T23:59:59`),
			},
		},
	});

	if (commitCount === 0) {
		console.warn(
			`[Job] ⚠️ No commits found for user ${userLogin} in ${run.year}!`
		);
	} else {
		console.log(
			`[Job] ✓ User ${userLogin}: ${commitCount} commits found`
		);
	}

	const options = run.options as AnalysisOptions;
	const orgSettings = (run.org.settings as Record<string, unknown>) || {};
	let totalWorkUnits = 0;

	// userLogin은 이미 위에서 선언됨

	const commits = await db.commit.findMany({
		where: {
			authorLogin: userLogin,
			repo: { orgId: run.orgId },
			committedAt: {
				gte: new Date(`${run.year}-01-01`),
				lte: new Date(`${run.year}-12-31T23:59:59`),
			},
		},
		include: {
			repo: true,
			files: true,
		},
		orderBy: { committedAt: "asc" },
	});

	if (commits.length === 0) {
		console.log(
			`[Job] Skipping Work Unit generation for ${userLogin}: no commits (will create empty report)`
		);
	} else {

		const commitsByRepo = new Map<string, typeof commits>();
		for (const commit of commits) {
			const repoId = commit.repoId;
			if (!commitsByRepo.has(repoId)) {
				commitsByRepo.set(repoId, []);
			}
			commitsByRepo.get(repoId)!.push(commit);
		}

		for (const [repoId, repoCommits] of commitsByRepo) {
			const workUnitDatas = clusterCommits(repoCommits, options?.clusteringConfig);

			for (const workUnitData of workUnitDatas) {
				const clusterCommitsList = workUnitData.commits;

				if (clusterCommitsList.length === 0) continue;

				const firstCommit = clusterCommitsList[0];
				const lastCommit = clusterCommitsList[clusterCommitsList.length - 1];

				const totalAdditions = workUnitData.additions;
				const totalDeletions = workUnitData.deletions;
				const allPaths = new Set<string>();
				clusterCommitsList.forEach((c) => c.files.forEach((f) => allPaths.add(f.path)));

				const primaryPaths = workUnitData.primaryPaths;

				const isHotfix = clusterCommitsList.some((c) =>
					c.message.toLowerCase().includes("hotfix") ||
					c.message.toLowerCase().includes("fix:")
				);
				const hasRevert = clusterCommitsList.some((c) =>
					c.message.toLowerCase().includes("revert")
				);

				const { score, factors } = calculateImpactScore(
					{
						additions: totalAdditions,
						deletions: totalDeletions,
						primaryPaths,
						isHotfix,
						hasRevert,
					},
					{
						criticalPaths: (orgSettings.criticalPaths as Array<{ pattern: string; weight: number }>) || [],
						...options?.impactConfig,
					}
				);

				const workUnit = await db.workUnit.create({
					data: {
						runId,
						repoId,
						userLogin,
						startAt: firstCommit.committedAt,
						endAt: lastCommit.committedAt,
						commitCount: clusterCommitsList.length,
						filesChanged: allPaths.size,
						additions: totalAdditions,
						deletions: totalDeletions,
						primaryPaths,
						impactScore: score,
						impactFactors: JSON.parse(JSON.stringify(factors)),
						isHotfix,
						hasRevert,
					},
				});

				// WorkUnitCommit 연결 (Batch)
				const workUnitCommits = clusterCommitsList.map((commit, index) => ({
					workUnitId: workUnit.id,
					commitId: commit.id,
					order: index,
				}));

				await db.workUnitCommit.createMany({
					data: workUnitCommits,
					skipDuplicates: true,
				});

				totalWorkUnits++;
			}
		}
	}

	console.log(`[Job] Created ${totalWorkUnits} work units for run ${runId}`);

	await updateProgress(runId, {
		status: "AWAITING_AI_CONFIRMATION",
		phase: "AWAITING_AI_CONFIRMATION",
	});

	return totalWorkUnits;
}

// 동기화된 커밋 데이터로 분석 실행 (커밋 수집 건너뛰기)
async function runAnalysisFromCache(runId: string): Promise<void> {
	console.log(`[Job] Running analysis from cached commit data for ${runId}`);

	try {
		const run = await db.analysisRun.findUnique({
			where: { id: runId },
			include: { org: true },
		});

		if (!run) {
			throw new Error("Run not found");
		}

		await db.analysisRun.update({
			where: { id: runId },
			data: {
				status: "BUILDING_UNITS",
				startedAt: new Date(),
				error: null,
			},
		});

		// 취소 확인 헬퍼
		const checkCancelled = async () => {
			const currentRun = await db.analysisRun.findUnique({ where: { id: runId } });
			return currentRun?.status === "FAILED" && currentRun?.error === "Cancelled by user";
		};

		if (await checkCancelled()) {
			console.log(`[Job] Analysis ${runId} was cancelled`);
			return;
		}

		// 커밋 데이터 검증
		const commitCount = await db.commit.count({
			where: {
				authorLogin: run.userLogin,
				repo: { orgId: run.orgId },
				committedAt: {
					gte: new Date(`${run.year}-01-01`),
					lte: new Date(`${run.year}-12-31T23:59:59`),
				},
			},
		});

		console.log(`[Job] Found ${commitCount} cached commits for ${run.userLogin} in ${run.year}`);

		if (commitCount === 0) {
			console.warn(`[Job] No commits found for user ${run.userLogin} in ${run.year}`);
		}

		// Work Unit 생성으로 바로 진행
		await buildWorkUnits(runId);

		console.log(`[Job] Analysis from cache completed for ${runId}`);
	} catch (error) {
		console.error(`[Job] Analysis from cache failed for ${runId}:`, error);
		await db.analysisRun.update({
			where: { id: runId },
			data: {
				status: "FAILED",
				error: String(error),
				finishedAt: new Date(),
			},
		});
		throw error;
	}
}

// 전체 분석 실행 (병렬 처리 + Resume 지원)
export async function runAnalysis(
	runId: string,
	mode: RestartMode = RestartMode.RESUME
): Promise<void> {
	console.log(`[Job] Starting optimized analysis for run ${runId} (mode: ${mode})`);

	try {
		const run = await db.analysisRun.findUnique({
			where: { id: runId },
			include: { org: true },
		});

		if (!run) {
			throw new Error("Run not found");
		}

		// 동기화 상태 확인
		const syncJob = await db.commitSyncJob.findUnique({
			where: {
				orgId_year: {
					orgId: run.orgId,
					year: run.year,
				},
			},
		});

		const useSyncedData = syncJob && syncJob.status === "COMPLETED";

		if (useSyncedData) {
			console.log(`[Job] Using synced commit data from CommitSyncJob ${syncJob.id}`);
			// 동기화된 데이터 사용 - 커밋 수집 건너뛰기
			return runAnalysisFromCache(runId);
		}

		console.log(`[Job] No synced data available, falling back to legacy commit collection`);

		// Resume 상태 분석
		const resumeState = await analyzeResumeState(runId);

		console.log(`[Job] Resume state:`, {
			canResume: resumeState.canResume,
			completed: resumeState.completedRepos.length,
			failed: resumeState.failedRepos.length,
			pending: resumeState.pendingRepos.length,
			existingCommits: resumeState.stats.totalCommits,
		});

		// 데이터 정리 (모드에 따라)
		if (mode === RestartMode.FULL_RESTART || (mode === RestartMode.RETRY && resumeState.failedRepos.length > 0)) {
			await cleanupBeforeRestart(runId, mode);
		}

		await db.analysisRun.update({
			where: { id: runId },
			data: {
				startedAt: new Date(),
				error: null,
			},
		});

		// 1단계: 저장소 스캔
		const allRepos = await scanRepos(runId);

		const checkCancelled = async () => {
			const run = await db.analysisRun.findUnique({ where: { id: runId } });
			return run?.status === "FAILED" && run?.error === "Cancelled by user";
		};

		if (await checkCancelled()) {
			console.log(`[Job] Analysis ${runId} was cancelled`);
			return;
		}

		// Progress 복원 및 스캔할 저장소 필터링
		const { repoProgress, completed: initialCompleted, failed: initialFailed } =
			await restoreProgress(runId, allRepos);

		const reposInfo = await getReposToScan(runId, allRepos, mode);

		console.log(
			`[Job] Scanning ${reposInfo.toScan.length}/${reposInfo.stats.total} repos (${reposInfo.stats.completed} already completed)`
		);

		// Progress 업데이트 (정확한 stats 사용)
		await updateProgress(runId, {
			total: reposInfo.stats.total,
			completed: reposInfo.stats.completed,
			failed: reposInfo.stats.failed,
			repoProgress,
		});

		if (reposInfo.toScan.length === 0) {
			console.log(`[Job] All repos already scanned, skipping to Work Unit generation`);
		} else {
			// 2단계: 저장소별 커밋 스캔 (병렬 처리)
			const limit = pLimit(CONCURRENT_REPOS);

			// 공유 변수 제거 - repoProgress 배열에서 실시간 카운팅

			const scanPromises = reposInfo.toScan.map((repoFullName) =>
				limit(async () => {
					if (await checkCancelled()) return;

					try {
						// 진행 상태 업데이트: scanning 시작
						const startRun = await db.analysisRun.findUnique({ where: { id: runId } });
						const startProgress = (startRun?.progress as ProgressState) || {};
						const startRepoProgress = ((startProgress.repoProgress as RepoProgress[]) || []).map((rp) =>
							rp.repoName === repoFullName ? { ...rp, status: "scanning" as const } : rp
						);

						await updateProgress(runId, {
							currentRepo: repoFullName,
							repoProgress: startRepoProgress,
						});

						// 커밋 스캔 실행 (실제 완료될 때까지 대기)
						const result = await scanCommitsForRepo(runId, repoFullName);

						// 완료 후: DB에서 현재 상태 다시 조회 (원자적 연산 보장)
						const updatedRun = await db.analysisRun.findUnique({
							where: { id: runId },
							select: { progress: true }
						});

						const currentProgress = (updatedRun?.progress as ProgressState) || {};
						const currentRepoProgress = (currentProgress.repoProgress as RepoProgress[]) || [];

						// 사용자별 진행 상황 생성
						const userProgress: UserProgress[] = [
							...result.successfulUsers.map(user => ({
								userLogin: user,
								commits: result.savedCommits, // 정확한 개수는 DB에서 계산 가능
								status: "done" as const,
							})),
							...result.failedUsers.map(user => ({
								userLogin: user.userLogin,
								commits: 0,
								status: "failed" as const,
								error: user.error,
							})),
						];

						// 저장소 상태 결정
						let repoStatus: "done" | "partial" | "failed" = "done";
						if (result.failedUsers.length === result.successfulUsers.length + result.failedUsers.length) {
							repoStatus = "failed"; // 모든 사용자 실패
						} else if (result.failedUsers.length > 0) {
							repoStatus = "partial"; // 일부 사용자 실패
						}

						// 현재 저장소 상태 업데이트 (사용자별 진행 포함)
						const newRepoProgress = currentRepoProgress.map((rp) =>
							rp.repoName === repoFullName
								? {
									...rp,
									status: repoStatus,
									commitCount: result.savedCommits,
									userProgress,
									error: result.failedUsers.length > 0
										? `${result.failedUsers.length}명의 사용자 수집 실패`
										: undefined,
								}
								: rp
						);

						// repoProgress 배열에서 완료/실패 개수 계산 (DB 기반, 정확함!)
						const completedCount = newRepoProgress.filter(r => r.status === "done" || r.status === "partial").length;
						const failedCount = newRepoProgress.filter(r => r.status === "failed").length;

						await updateProgress(runId, {
							completed: completedCount,
							failed: failedCount,
							repoProgress: newRepoProgress,
						});

						console.log(
							`[Job] Progress: ${completedCount}/${reposInfo.stats.total} (${Math.round((completedCount / reposInfo.stats.total) * 100)}%) - ${repoFullName}: ${repoStatus}`
						);
					} catch (error) {
						console.error(`[Job] ⚠️ Critical error scanning ${repoFullName}:`, error);

						// 실패 시: DB에서 현재 상태 조회
						const errorRun = await db.analysisRun.findUnique({
							where: { id: runId },
							select: { progress: true, userLogin: true }
						});

						const errorProgress = (errorRun?.progress as ProgressState) || {};
						const errorRepoProgress = (errorProgress.repoProgress as RepoProgress[]) || [];

						// 단일 사용자가 실패한 것으로 처리
						const failedUserProgress: UserProgress[] = errorRun?.userLogin ? [{
							userLogin: errorRun.userLogin,
							commits: 0,
							status: "failed" as const,
							error: String(error),
						}] : [];

						// 실패 상태로 업데이트
						const newRepoProgress = errorRepoProgress.map((rp) =>
							rp.repoName === repoFullName
								? {
									...rp,
									status: "failed" as const,
									error: String(error),
									userProgress: failedUserProgress,
								}
								: rp
						);

						// repoProgress 배열에서 실패 개수 계산
						const completedCount = newRepoProgress.filter(r => r.status === "done" || r.status === "partial").length;
						const failedCount = newRepoProgress.filter(r => r.status === "failed").length;

						await updateProgress(runId, {
							completed: completedCount,
							failed: failedCount,
							repoProgress: newRepoProgress,
						});
					}
				})
			);

			await Promise.all(scanPromises);

			console.log(`[Job] All scan promises completed`);
		}

		if (await checkCancelled()) {
			console.log(`[Job] Analysis ${runId} was cancelled`);
			return;
		}

		// 최종 검증 1: repoProgress 배열 기반
		const finalRun = await db.analysisRun.findUnique({
			where: { id: runId },
			select: { progress: true },
		});

		const finalProgress = (finalRun?.progress as ProgressState) || {};
		const finalRepoProgress = (finalProgress.repoProgress as RepoProgress[]) || [];
		const progressCompleted = finalRepoProgress.filter(r => r.status === "done").length;
		const progressFailed = finalRepoProgress.filter(r => r.status === "failed").length;

		console.log(
			`[Job] Progress-based count: ${progressCompleted}/${reposInfo.stats.total} completed, ${progressFailed} failed`
		);

		// 최종 검증 2: DB 상태 기반 (실제 커밋 데이터 확인)
		const dbVerifiedCount = await syncProgressFromDB(runId);
		console.log(
			`[Job] DB-verified count: ${dbVerifiedCount}/${reposInfo.stats.total} repos have commits`
		);

		// 불일치 검사 및 경고
		if (dbVerifiedCount !== progressCompleted) {
			console.warn(
				`[Job] ⚠️ Progress mismatch detected! repoProgress: ${progressCompleted}, DB actual: ${dbVerifiedCount}`
			);
			console.warn(`[Job] Using DB-verified count: ${dbVerifiedCount}`);
		}

		// DB 검증된 값으로 최종 업데이트
		await updateProgress(runId, {
			completed: dbVerifiedCount,
			failed: progressFailed,
			phase: "BUILDING_UNITS",
		});

		// 3단계: Work Unit 생성
		await buildWorkUnits(runId);

		console.log(`[Job] Optimized analysis ${runId} completed (awaiting AI confirmation)`);
	} catch (error) {
		console.error(`[Job] Analysis ${runId} failed:`, error);
		await db.analysisRun.update({
			where: { id: runId },
			data: {
				status: "FAILED",
				error: String(error),
				finishedAt: new Date(),
			},
		});
		throw error;
	}
}

