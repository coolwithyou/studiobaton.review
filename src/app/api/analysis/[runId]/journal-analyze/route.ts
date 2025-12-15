import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * POST /api/analysis/[runId]/journal-analyze
 * 
 * 특정 기간의 커밋을 AI로 분석하여 업무 패턴과 요약을 생성합니다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId } = await params;
    const body = await request.json();
    const { startDate, endDate, periodType } = body;

    if (!startDate || !endDate || !periodType) {
      return NextResponse.json(
        { error: "startDate, endDate, periodType are required" },
        { status: 400 }
      );
    }

    // AnalysisRun 조회
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
        user: {
          select: {
            login: true,
            name: true,
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // 권한 확인
    if (run.org.members.length === 0) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // 기간 내 커밋 조회
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const commits = await db.commit.findMany({
      where: {
        authorLogin: run.userLogin,
        committedAt: {
          gte: start,
          lte: end,
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

    if (commits.length === 0) {
      return NextResponse.json({
        summary: "이 기간에는 커밋이 없습니다.",
        keyActivities: [],
        workPattern: "활동 없음",
        reposCovered: [],
        commitCount: 0,
        periodType,
      });
    }

    // 리포지터리별 커밋 수 계산
    const repoCommitCount = new Map<string, number>();
    commits.forEach((commit) => {
      const count = repoCommitCount.get(commit.repo.fullName) || 0;
      repoCommitCount.set(commit.repo.fullName, count + 1);
    });

    const reposCovered = Array.from(repoCommitCount.keys());
    const sortedRepos = Array.from(repoCommitCount.entries())
      .sort((a, b) => b[1] - a[1]);

    // AI 프롬프트 생성
    const commitsSummary = commits.slice(0, 50).map((c) => ({
      repo: c.repo.name,
      message: c.message.split("\n")[0].substring(0, 100),
      additions: c.additions,
      deletions: c.deletions,
      date: c.committedAt.toISOString().split("T")[0],
    }));

    const prompt = `다음은 ${run.user.name || run.userLogin} 개발자의 ${periodType === "week" ? "주간" : "월간"} 업무 커밋 내역입니다.
기간: ${startDate} ~ ${endDate}
총 커밋 수: ${commits.length}개
작업한 리포지터리: ${reposCovered.join(", ")}

커밋 내역 (최대 50개):
${commitsSummary.map((c) => `- [${c.repo}] ${c.message} (+${c.additions}/-${c.deletions}) - ${c.date}`).join("\n")}

리포지터리별 커밋 분포:
${sortedRepos.map(([repo, count]) => `- ${repo}: ${count}개 (${((count / commits.length) * 100).toFixed(1)}%)`).join("\n")}

위 정보를 바탕으로 다음 내용을 JSON 형식으로 작성해주세요:
{
  "summary": "이 기간의 주요 업무 활동 요약 (2-3문장)",
  "keyActivities": ["주요 활동 1", "주요 활동 2", "주요 활동 3"],
  "workPattern": "업무 패턴 분석 (단일 프로젝트 집중형 / 다중 프로젝트 분산형 / 유지보수 중심 등)",
  "reposCovered": ${JSON.stringify(reposCovered)}
}`;

    // OpenAI API 호출
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "당신은 소프트웨어 개발 활동을 분석하는 전문가입니다. 커밋 내역을 바탕으로 개발자의 업무 패턴과 주요 활동을 명확하고 간결하게 요약합니다.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 800,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const analysis = JSON.parse(content);

    return NextResponse.json({
      summary: analysis.summary || "분석을 생성할 수 없습니다.",
      keyActivities: analysis.keyActivities || [],
      workPattern: analysis.workPattern || "패턴 분석 불가",
      reposCovered,
      commitCount: commits.length,
      periodType,
    });
  } catch (error) {
    console.error("Journal analyze error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
