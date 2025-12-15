import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { getInstallationOctokit } from "@/lib/github";
import { JournalAnalyzer } from "@/lib/journal/analyzer";
import { WeeklyAnalysisResult } from "@/types";
import { getISOWeek, startOfISOWeek, endOfISOWeek, startOfMonth, endOfMonth, setISOWeek, getYear } from "date-fns";

/**
 * POST /api/analysis/[runId]/journal/analyze-month
 *
 * 월간 분석 실행 (SSE 스트리밍)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const session = await getSession();
        if (!session.isLoggedIn || !session.user) {
          send({ type: "error", data: { message: "Unauthorized" } });
          controller.close();
          return;
        }

        const { runId } = await params;
        const body = await request.json();
        const { month } = body;

        if (!month) {
          send({ type: "error", data: { message: "month is required" } });
          controller.close();
          return;
        }

        // AnalysisRun 조회 및 권한 확인
        const run = await db.analysisRun.findUnique({
          where: { id: runId },
          include: {
            org: {
              include: {
                members: {
                  where: { userId: session.user.id },
                },
              },
            },
          },
        });

        if (!run) {
          send({ type: "error", data: { message: "Run not found" } });
          controller.close();
          return;
        }

        // 권한 확인
        if (run.org.members.length === 0) {
          send({ type: "error", data: { message: "Access denied" } });
          controller.close();
          return;
        }

        // MonthlyAnalysis 조회 또는 생성
        let monthlyAnalysis = await db.monthlyAnalysis.findUnique({
          where: {
            runId_month: { runId, month },
          },
        });

        // 이미 COMPLETED 상태면 캐시된 결과 반환
        if (monthlyAnalysis?.status === "COMPLETED") {
          send({
            type: "monthly_complete",
            data: { result: monthlyAnalysis.stage3Result },
          });
          controller.close();
          return;
        }

        // 새로운 분석 생성
        if (!monthlyAnalysis) {
          monthlyAnalysis = await db.monthlyAnalysis.create({
            data: {
              runId,
              userLogin: run.userLogin,
              year: run.year,
              month,
              status: "PENDING",
            },
          });
        }

        // 해당 월의 주차 계산 (ISO 8601 주차 기준)
        const monthStart = startOfMonth(new Date(run.year, month - 1, 1));
        const monthEnd = endOfMonth(monthStart);

        const firstWeek = getISOWeek(monthStart, { weekStartsOn: 1 });
        const lastWeek = getISOWeek(monthEnd, { weekStartsOn: 1 });

        const weeks = [];
        for (let weekNumber = firstWeek; weekNumber <= lastWeek; weekNumber++) {
          try {
            // ISO 주차 번호를 기준으로 정확한 날짜 계산
            const dateInWeek = setISOWeek(new Date(run.year, 0, 4), weekNumber);
            const weekStart = startOfISOWeek(dateInWeek);
            const weekEnd = endOfISOWeek(dateInWeek);

            // 주차의 년도가 run.year와 같은 경우만 포함
            if (getYear(weekStart) === run.year || getYear(weekEnd) === run.year) {
              weeks.push({
                weekNumber,
                startDate: weekStart,
                endDate: weekEnd,
              });
            }
          } catch (error) {
            // 53주차가 없는 해도 있음
            continue;
          }
        }

        send({
          type: "progress",
          data: { message: `${weeks.length}개 주차 분석 시작`, totalWeeks: weeks.length },
        });

        // Analyzer 초기화
        let octokit;
        if (run.org.installationId) {
          try {
            octokit = await getInstallationOctokit(run.org.installationId);
          } catch (error) {
            console.error("Failed to get GitHub octokit:", error);
          }
        }

        const analyzer = octokit
          ? new JournalAnalyzer(octokit)
          : new JournalAnalyzer({} as any);

        const weeklyAnalysisIds: string[] = [];
        const weeklyResults: WeeklyAnalysisResult[] = [];

        // 각 주차별 분석
        for (let i = 0; i < weeks.length; i++) {
          const { weekNumber, startDate, endDate } = weeks[i];

          send({
            type: "progress",
            data: {
              currentWeek: i + 1,
              totalWeeks: weeks.length,
              weekNumber,
              stage: "checking",
            },
          });

          // WeeklyAnalysis 조회 또는 생성
          let weeklyAnalysis = await db.weeklyAnalysis.findUnique({
            where: {
              runId_weekNumber: { runId, weekNumber },
            },
          });

          // 이미 COMPLETED 상태면 재사용
          if (weeklyAnalysis?.status === "COMPLETED") {
            weeklyAnalysisIds.push(weeklyAnalysis.id);
            if (weeklyAnalysis.stage3Result) {
              weeklyResults.push(weeklyAnalysis.stage3Result as any);
            }
            send({
              type: "weekly_complete",
              data: { weekNumber, cached: true },
            });
            continue;
          }

          // 주간 분석 수행
          send({
            type: "progress",
            data: {
              currentWeek: i + 1,
              totalWeeks: weeks.length,
              weekNumber,
              stage: "analyzing",
            },
          });

          // 새로운 분석 생성
          if (!weeklyAnalysis) {
            weeklyAnalysis = await db.weeklyAnalysis.create({
              data: {
                runId,
                userLogin: run.userLogin,
                year: run.year,
                weekNumber,
                startDate,
                endDate,
                status: "PENDING",
              },
            });
          }

          // 기간 내 커밋 조회
          const commits = await db.commit.findMany({
            where: {
              authorLogin: run.userLogin,
              committedAt: {
                gte: startDate,
                lte: new Date(endDate.getTime() + 86400000 - 1), // end of day
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
          });

          // 커밋이 없으면 스킵
          if (commits.length === 0) {
            await db.weeklyAnalysis.update({
              where: { id: weeklyAnalysis.id },
              data: {
                status: "COMPLETED",
                stage3Result: {
                  summary: "이 주에는 커밋이 없습니다.",
                  keyActivities: [],
                  workPattern: "활동 없음",
                  technicalHighlights: [],
                  insights: [],
                  metrics: {
                    totalCommits: 0,
                    keyCommitsAnalyzed: 0,
                    reposWorked: 0,
                    linesChanged: 0,
                  },
                },
                analyzedAt: new Date(),
              },
            });

            send({
              type: "weekly_complete",
              data: { weekNumber, noCommits: true },
            });
            continue;
          }

          // Stage 1: 주요 커밋 선별
          await db.weeklyAnalysis.update({
            where: { id: weeklyAnalysis.id },
            data: { status: "STAGE1" },
          });

          const commitsForAnalysis = commits.map((c) => ({
            sha: c.sha,
            message: c.message,
            repoName: c.repo.name,
            repoFullName: c.repo.fullName,
            additions: c.additions,
            deletions: c.deletions,
            committedAt: c.committedAt,
          }));

          const keyCommits = await analyzer.selectKeyCommits(commitsForAnalysis, 5);

          await db.weeklyAnalysis.update({
            where: { id: weeklyAnalysis.id },
            data: { stage1Result: { keyCommits } },
          });

          // Stage 2: 코드 리뷰
          await db.weeklyAnalysis.update({
            where: { id: weeklyAnalysis.id },
            data: { status: "STAGE2" },
          });

          let commitReviews = [];
          if (octokit) {
            for (const commit of keyCommits) {
              try {
                const [owner, repo] = commit.repoFullName.split("/");
                const review = await analyzer.reviewCommit(commit, owner, repo);
                commitReviews.push(review);
              } catch (error) {
                console.error(`Failed to review commit ${commit.sha}:`, error);
              }
            }
          }

          await db.weeklyAnalysis.update({
            where: { id: weeklyAnalysis.id },
            data: { stage2Result: { commitReviews } },
          });

          // Stage 3: 주간 종합
          await db.weeklyAnalysis.update({
            where: { id: weeklyAnalysis.id },
            data: { status: "STAGE3" },
          });

          const weeklyResult = await analyzer.synthesizeWeekly(
            keyCommits,
            commitReviews,
            commitsForAnalysis
          );

          await db.weeklyAnalysis.update({
            where: { id: weeklyAnalysis.id },
            data: {
              status: "COMPLETED",
              stage3Result: weeklyResult,
              analyzedAt: new Date(),
            },
          });

          weeklyAnalysisIds.push(weeklyAnalysis.id);
          weeklyResults.push(weeklyResult);

          send({
            type: "weekly_complete",
            data: { weekNumber, result: weeklyResult },
          });
        }

        // 월간 종합 (Stage 3)
        send({
          type: "progress",
          data: { message: "월간 종합 분석 중...", stage: "monthly_synthesis" },
        });

        // 모든 주차 커밋 조회
        const allMonthCommits = await db.commit.findMany({
          where: {
            authorLogin: run.userLogin,
            committedAt: {
              gte: monthStart,
              lte: monthEnd,
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
        });

        const allCommitsForAnalysis = allMonthCommits.map((c) => ({
          sha: c.sha,
          message: c.message,
          repoName: c.repo.name,
          repoFullName: c.repo.fullName,
          additions: c.additions,
          deletions: c.deletions,
          committedAt: c.committedAt,
        }));

        const monthlyResult = await analyzer.synthesizeMonthly(
          weeklyResults,
          allCommitsForAnalysis
        );

        await db.monthlyAnalysis.update({
          where: { id: monthlyAnalysis.id },
          data: {
            status: "COMPLETED",
            stage3Result: monthlyResult,
            weeklyAnalysisIds,
            analyzedAt: new Date(),
          },
        });

        send({
          type: "monthly_complete",
          data: { result: monthlyResult },
        });

        controller.close();
      } catch (error) {
        console.error("Monthly analysis error:", error);
        send({
          type: "error",
          data: {
            message: error instanceof Error ? error.message : "Unknown error",
          },
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
