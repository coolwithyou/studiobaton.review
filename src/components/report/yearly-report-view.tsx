"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  MonthlyActivityChart,
  WorkTypeChart,
  RepoContributionChart,
  TimeHeatmapChart,
  ScoreRadarChart,
  CommitSizeChart,
} from "@/components/charts";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  AlertCircle,
  CheckCircle,
  Clock,
  GitCommit,
  GitPullRequest,
  Code,
  Calendar,
  Zap,
  FileText,
} from "lucide-react";
import type {
  DeveloperMetrics,
  Stage2Result,
  Stage3Result,
  Stage4Result,
  MonthlyActivityData,
  WorkTypeDistribution,
  RepoContribution,
  TimeHeatmapData,
} from "@/types";
import { calculateOverallScore, getGrade } from "@/lib/ai/stages/stage4-summary";
import { cn } from "@/lib/utils";

// ============================================
// Props 타입
// ============================================

interface YearlyReportViewProps {
  userLogin: string;
  userName?: string | null;
  userAvatarUrl?: string | null;
  year: number;
  metrics: DeveloperMetrics;
  stage2Result?: Stage2Result | null;
  stage3Result?: Stage3Result | null;
  stage4Result?: Stage4Result | null;
  monthlyActivity: MonthlyActivityData[];
  workTypeDistribution: WorkTypeDistribution[];
  repoContributions: RepoContribution[];
  timeHeatmap: TimeHeatmapData[];
  commits: Array<{ additions: number; deletions: number }>;
  managerComment?: string | null;
  confirmedAt?: Date | null;
  onSaveComment?: (comment: string) => Promise<void>;
  onConfirm?: () => Promise<void>;
}

// ============================================
// 메인 컴포넌트
// ============================================

export function YearlyReportView({
  userLogin,
  userName,
  userAvatarUrl,
  year,
  metrics,
  stage2Result,
  stage3Result,
  stage4Result,
  monthlyActivity,
  workTypeDistribution,
  repoContributions,
  timeHeatmap,
  commits,
  managerComment,
  confirmedAt,
  onSaveComment,
  onConfirm,
}: YearlyReportViewProps) {
  const [comment, setComment] = useState(managerComment || "");
  const [isSaving, setIsSaving] = useState(false);

  const overallScore = stage4Result 
    ? calculateOverallScore(stage4Result.overallAssessment) 
    : 0;
  const grade = getGrade(overallScore);

  const handleSaveComment = async () => {
    if (!onSaveComment) return;
    setIsSaving(true);
    try {
      await onSaveComment(comment);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={userAvatarUrl || undefined} />
            <AvatarFallback className="text-xl">
              {(userName || userLogin).charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">{userName || userLogin}</h1>
            <p className="text-muted-foreground">@{userLogin} · {year}년 연간 리포트</p>
          </div>
        </div>
        <div className="text-right">
          <div className={cn("text-5xl font-bold", grade.color)}>
            {grade.grade}
          </div>
          <div className="text-sm text-muted-foreground">{grade.label}</div>
          <div className="text-lg font-semibold mt-1">{overallScore}/10</div>
        </div>
      </div>

      {/* 경영진 요약 */}
      {stage4Result && (
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              경영진 요약
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg leading-relaxed">
              {stage4Result.executiveSummary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 핵심 지표 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard
          icon={<GitCommit className="h-5 w-5" />}
          label="총 커밋"
          value={metrics.productivity.totalCommits.toLocaleString()}
        />
        <StatCard
          icon={<GitPullRequest className="h-5 w-5" />}
          label="총 PR"
          value={metrics.productivity.totalPRs.toLocaleString()}
        />
        <StatCard
          icon={<Code className="h-5 w-5" />}
          label="추가 라인"
          value={`+${metrics.productivity.linesAdded.toLocaleString()}`}
          color="text-green-600"
        />
        <StatCard
          icon={<Code className="h-5 w-5" />}
          label="삭제 라인"
          value={`-${metrics.productivity.linesDeleted.toLocaleString()}`}
          color="text-red-600"
        />
        <StatCard
          icon={<Calendar className="h-5 w-5" />}
          label="작업일"
          value={`${metrics.productivity.workingDays}일`}
        />
        <StatCard
          icon={<Zap className="h-5 w-5" />}
          label="저장소"
          value={`${metrics.diversity.repositoryCount}개`}
        />
      </div>

      {/* 탭 컨텐츠 */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="overview">종합 평가</TabsTrigger>
          <TabsTrigger value="activity">활동 분석</TabsTrigger>
          <TabsTrigger value="quality">코드 품질</TabsTrigger>
          <TabsTrigger value="growth">성장 포인트</TabsTrigger>
          <TabsTrigger value="action">액션 아이템</TabsTrigger>
        </TabsList>

        {/* 종합 평가 탭 */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* 레이더 차트 */}
            {stage4Result && (
              <ScoreRadarChart assessment={stage4Result.overallAssessment} />
            )}

            {/* 주요 성과 */}
            {stage4Result && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-yellow-500" />
                    주요 성과
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {stage4Result.topAchievements.map((achievement, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                        <span>{achievement}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          {/* 영역별 상세 점수 */}
          {stage4Result && (
            <div className="grid md:grid-cols-5 gap-4">
              {Object.entries(stage4Result.overallAssessment).map(([key, value]) => (
                <Card key={key}>
                  <CardContent className="pt-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-primary">
                        {value.score}
                      </div>
                      <div className="text-sm font-medium mt-1">
                        {getDimensionLabel(key)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-3">
                        {value.feedback}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* 작업 스타일 & 협업 패턴 */}
          {stage2Result && (
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>작업 스타일</CardTitle>
                  <CardDescription>커밋 패턴 기반 분석</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge className="mb-2" variant="outline">
                    {getWorkStyleLabel(stage2Result.workStyle.type)}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {stage2Result.workStyle.description}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>협업 패턴</CardTitle>
                  <CardDescription>PR 및 팀 활동 기반 분석</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge className="mb-2" variant="outline">
                    {getCollabPatternLabel(stage2Result.collaborationPattern.type)}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {stage2Result.collaborationPattern.description}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* 활동 분석 탭 */}
        <TabsContent value="activity" className="space-y-6">
          <MonthlyActivityChart data={monthlyActivity} />
          
          <div className="grid md:grid-cols-2 gap-6">
            <TimeHeatmapChart data={timeHeatmap} />
            <WorkTypeChart data={workTypeDistribution} />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <RepoContributionChart data={repoContributions} />
            <CommitSizeChart commits={commits} />
          </div>

          {/* 작업 패턴 상세 */}
          <Card>
            <CardHeader>
              <CardTitle>작업 패턴 상세</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <div className="text-sm text-muted-foreground">최장 연속 작업</div>
                  <div className="text-2xl font-bold">{metrics.workPattern.longestStreak}일</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">주말 작업 비율</div>
                  <div className="text-2xl font-bold">{metrics.workPattern.weekendWorkRatio}%</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">평균 세션 시간</div>
                  <div className="text-2xl font-bold">{metrics.workPattern.avgSessionDuration}분</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">일 평균 커밋</div>
                  <div className="text-2xl font-bold">{metrics.productivity.avgCommitsPerDay}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 코드 품질 탭 */}
        <TabsContent value="quality" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* 커밋 품질 지표 */}
            <Card>
              <CardHeader>
                <CardTitle>커밋 품질 지표</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <MetricRow
                  label="Conventional Commits 준수율"
                  value={`${metrics.commitQuality.conventionalCommitsRate}%`}
                  status={metrics.commitQuality.conventionalCommitsRate >= 70 ? "good" : "warn"}
                />
                <MetricRow
                  label="이슈 참조율"
                  value={`${metrics.commitQuality.issueReferenceRate}%`}
                  status={metrics.commitQuality.issueReferenceRate >= 50 ? "good" : "warn"}
                />
                <MetricRow
                  label="의미 있는 커밋 비율"
                  value={`${metrics.commitQuality.meaningfulCommitRate}%`}
                  status={metrics.commitQuality.meaningfulCommitRate >= 80 ? "good" : "warn"}
                />
                <MetricRow
                  label="Revert 비율"
                  value={`${metrics.commitQuality.revertRate}%`}
                  status={metrics.commitQuality.revertRate <= 5 ? "good" : "warn"}
                />
                <MetricRow
                  label="테스트 커밋 비율"
                  value={`${metrics.commitQuality.testCommitRate}%`}
                  status={metrics.commitQuality.testCommitRate >= 10 ? "good" : "warn"}
                />
              </CardContent>
            </Card>

            {/* PR 활동 지표 */}
            <Card>
              <CardHeader>
                <CardTitle>PR 활동 지표</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <MetricRow
                  label="PR 참여율"
                  value={`${metrics.prActivity.prParticipationRate}%`}
                  status={metrics.prActivity.prParticipationRate >= 60 ? "good" : "warn"}
                />
                <MetricRow
                  label="머지 성공률"
                  value={`${metrics.prActivity.mergeSuccessRate}%`}
                  status={metrics.prActivity.mergeSuccessRate >= 80 ? "good" : "warn"}
                />
                <MetricRow
                  label="PR당 평균 커밋"
                  value={`${metrics.prActivity.avgCommitsPerPR}`}
                />
                <MetricRow
                  label="평균 PR 사이클"
                  value={`${metrics.prActivity.avgPRCycleTime}시간`}
                  status={metrics.prActivity.avgPRCycleTime <= 48 ? "good" : "warn"}
                />
              </CardContent>
            </Card>
          </div>

          {/* AI 활용 추정 */}
          <Card>
            <CardHeader>
              <CardTitle>AI 활용 추정</CardTitle>
              <CardDescription>커밋 패턴 기반 간접 추정</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Badge variant={
                  metrics.aiUsageEstimate.estimatedAiAssistance === "high" ? "default" :
                  metrics.aiUsageEstimate.estimatedAiAssistance === "medium" ? "secondary" :
                  "outline"
                }>
                  {metrics.aiUsageEstimate.estimatedAiAssistance === "high" ? "높음" :
                   metrics.aiUsageEstimate.estimatedAiAssistance === "medium" ? "중간" : "낮음"}
                </Badge>
                <div className="text-sm text-muted-foreground">
                  대규모 커밋 빈도: {metrics.aiUsageEstimate.largeCommitFrequency}% · 
                  스타일 일관성: {metrics.aiUsageEstimate.styleConsistencyScore}% · 
                  문서화율: {metrics.aiUsageEstimate.documentationRate}%
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 성장 포인트 탭 */}
        <TabsContent value="growth" className="space-y-6">
          {stage3Result && (
            <>
              {/* 강점 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    강점
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {stage3Result.strengths.map((strength, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-1 shrink-0" />
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* 개선 영역 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-orange-500" />
                    개선 영역
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {stage3Result.areasForImprovement.map((area, i) => (
                    <div key={i} className="border rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={
                          area.priority === "high" ? "destructive" :
                          area.priority === "medium" ? "default" : "secondary"
                        }>
                          {area.priority === "high" ? "높음" :
                           area.priority === "medium" ? "중간" : "낮음"}
                        </Badge>
                        <span className="font-medium">{area.area}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {area.specificFeedback}
                      </p>
                      {area.suggestedResources.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          추천 리소스: {area.suggestedResources.join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* 학습 기회 & 커리어 성장 */}
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>학습 기회</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {stage3Result.learningOpportunities.map((opp, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-blue-500 mt-1 shrink-0" />
                          <span className="text-sm">{opp}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>커리어 성장 제안</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {stage3Result.careerGrowthSuggestions.map((suggestion, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <TrendingUp className="h-4 w-4 text-purple-500 mt-1 shrink-0" />
                          <span className="text-sm">{suggestion}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* 액션 아이템 탭 */}
        <TabsContent value="action" className="space-y-6">
          {stage4Result && (
            <>
              {/* 핵심 개선점 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-red-500" />
                    핵심 개선점
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {stage4Result.keyImprovements.map((improvement, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-orange-500 mt-1 shrink-0" />
                        <span>{improvement}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* 액션 아이템 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-blue-500" />
                    액션 아이템
                  </CardTitle>
                  <CardDescription>다음 분기/연도 목표</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {stage4Result.actionItems.map((item, i) => (
                      <div key={i} className="flex items-start gap-4 p-4 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={
                              item.priority === "high" ? "destructive" :
                              item.priority === "medium" ? "default" : "secondary"
                            }>
                              {item.priority === "high" ? "높음" :
                               item.priority === "medium" ? "중간" : "낮음"}
                            </Badge>
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {item.deadline}
                            </span>
                          </div>
                          <p>{item.item}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* 매니저 코멘트 */}
              <Card>
                <CardHeader>
                  <CardTitle>매니저 코멘트</CardTitle>
                  <CardDescription>평가에 대한 추가 의견</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="평가에 대한 코멘트를 입력하세요..."
                    rows={4}
                    disabled={!!confirmedAt}
                  />
                  {!confirmedAt && (
                    <div className="flex gap-2">
                      <Button
                        onClick={handleSaveComment}
                        disabled={isSaving}
                        variant="outline"
                      >
                        {isSaving ? "저장 중..." : "코멘트 저장"}
                      </Button>
                      {onConfirm && (
                        <Button onClick={onConfirm}>
                          평가 확정
                        </Button>
                      )}
                    </div>
                  )}
                  {confirmedAt && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      {new Date(confirmedAt).toLocaleDateString("ko-KR")}에 확정됨
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================
// 보조 컴포넌트
// ============================================

function StatCard({ 
  icon, 
  label, 
  value, 
  color 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <div className={cn("text-xl font-bold", color)}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricRow({ 
  label, 
  value, 
  status 
}: { 
  label: string; 
  value: string;
  status?: "good" | "warn";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-medium">{value}</span>
        {status === "good" && <CheckCircle className="h-4 w-4 text-green-500" />}
        {status === "warn" && <AlertCircle className="h-4 w-4 text-orange-500" />}
      </div>
    </div>
  );
}

// ============================================
// 유틸리티 함수
// ============================================

function getDimensionLabel(key: string): string {
  const labels: Record<string, string> = {
    productivity: "생산성",
    codeQuality: "코드 품질",
    diversity: "다양성",
    collaboration: "협업",
    growth: "성장",
  };
  return labels[key] || key;
}

function getWorkStyleLabel(type: string): string {
  const labels: Record<string, string> = {
    "deep-diver": "🔍 Deep Diver",
    "multi-tasker": "🔄 Multi-tasker",
    "firefighter": "🚒 Firefighter",
    "architect": "🏛️ Architect",
  };
  return labels[type] || type;
}

function getCollabPatternLabel(type: string): string {
  const labels: Record<string, string> = {
    "solo": "🧑‍💻 Solo",
    "collaborative": "🤝 Collaborative",
    "mentor": "👨‍🏫 Mentor",
    "learner": "📚 Learner",
  };
  return labels[type] || type;
}

