"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { YearlyTrendChart } from "@/components/charts/yearly-trend-chart";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  AlertCircle,
  Building2,
  User,
} from "lucide-react";
import { ReportStats } from "@/types";

interface Organization {
  id: string;
  login: string;
  name: string | null;
}

interface YearlyReportData {
  year: number;
  stats: ReportStats;
  summary: string;
  strengths: string[];
  improvements: string[];
  actionItems: string[];
}

interface CompareReportsContentProps {
  organizations: Organization[];
  initialOrgLogin?: string;
  initialUserLogin?: string;
}

export function CompareReportsContent({
  organizations,
  initialOrgLogin,
  initialUserLogin,
}: CompareReportsContentProps) {
  const [selectedOrg, setSelectedOrg] = useState(initialOrgLogin || "");
  const [selectedUser, setSelectedUser] = useState(initialUserLogin || "");
  const [members, setMembers] = useState<Array<{ login: string; name: string | null }>>([]);
  const [reports, setReports] = useState<YearlyReportData[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 조직 선택 시 멤버 조회
  useEffect(() => {
    if (!selectedOrg) {
      setMembers([]);
      setSelectedUser("");
      return;
    }

    const fetchMembers = async () => {
      setIsLoadingMembers(true);
      try {
        const res = await fetch(`/api/organizations/${selectedOrg}/members`);
        if (!res.ok) throw new Error("멤버 조회 실패");
        const data = await res.json();
        setMembers(data.members.map((m: { login: string; name: string | null }) => ({
          login: m.login,
          name: m.name,
        })));
      } catch (err) {
        console.error("Error fetching members:", err);
      } finally {
        setIsLoadingMembers(false);
      }
    };

    fetchMembers();
  }, [selectedOrg]);

  // 사용자 선택 시 리포트 조회
  useEffect(() => {
    if (!selectedOrg || !selectedUser) {
      setReports([]);
      return;
    }

    const fetchReports = async () => {
      setIsLoadingReports(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/reports/compare?org=${selectedOrg}&user=${selectedUser}`
        );
        if (!res.ok) throw new Error("리포트 조회 실패");
        const data = await res.json();
        setReports(data.reports);
      } catch (err) {
        console.error("Error fetching reports:", err);
        setError(err instanceof Error ? err.message : "리포트 조회 실패");
      } finally {
        setIsLoadingReports(false);
      }
    };

    fetchReports();
  }, [selectedOrg, selectedUser]);

  const getChangeIndicator = (current: number, previous: number) => {
    const change = ((current - previous) / previous) * 100;
    if (Math.abs(change) < 5) {
      return { icon: Minus, color: "text-gray-500", text: "변화 없음" };
    } else if (change > 0) {
      return { icon: TrendingUp, color: "text-green-600", text: `+${change.toFixed(0)}%` };
    } else {
      return { icon: TrendingDown, color: "text-red-600", text: `${change.toFixed(0)}%` };
    }
  };

  return (
    <div className="space-y-6">
      {/* 필터 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">조회 조건</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                조직
              </Label>
              <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                <SelectTrigger>
                  <SelectValue placeholder="조직 선택" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.login}>
                      {org.name || org.login}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <User className="h-4 w-4" />
                팀원
              </Label>
              <Select
                value={selectedUser}
                onValueChange={setSelectedUser}
                disabled={!selectedOrg || isLoadingMembers}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isLoadingMembers ? "로딩 중..." : "팀원 선택"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {members.map((member) => (
                    <SelectItem key={member.login} value={member.login}>
                      {member.name || member.login} (@{member.login})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 결과 */}
      {isLoadingReports && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {!isLoadingReports && reports.length > 0 && (
        <>
          {/* 연도별 비교 차트 */}
          <Card>
            <CardHeader>
              <CardTitle>연도별 추이</CardTitle>
              <CardDescription>
                커밋, Work Unit, 임팩트 스코어의 연도별 변화
              </CardDescription>
            </CardHeader>
            <CardContent>
              <YearlyTrendChart
                data={reports.map((r) => ({
                  year: r.year,
                  commits: r.stats.totalCommits,
                  workUnits: r.stats.totalWorkUnits,
                  impactScore: r.stats.avgImpactScore,
                }))}
              />
            </CardContent>
          </Card>

          {/* 연도별 상세 비교 */}
          <div className="grid gap-4">
            {reports.map((report, index) => {
              const prevReport = reports[index + 1];
              const commitsChange = prevReport
                ? getChangeIndicator(report.stats.totalCommits, prevReport.stats.totalCommits)
                : null;
              const impactChange = prevReport
                ? getChangeIndicator(report.stats.avgImpactScore, prevReport.stats.avgImpactScore)
                : null;

              return (
                <Card key={report.year}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{report.year}년</CardTitle>
                      {index === 0 && (
                        <Badge variant="default">최신</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* 통계 */}
                    <div className="grid gap-4 md:grid-cols-4">
                      <div>
                        <p className="text-sm text-muted-foreground">커밋</p>
                        <div className="flex items-center gap-2">
                          <p className="text-2xl font-bold">
                            {report.stats.totalCommits}
                          </p>
                          {commitsChange && (
                            <div className={`flex items-center gap-1 text-sm ${commitsChange.color}`}>
                              <commitsChange.icon className="h-4 w-4" />
                              <span>{commitsChange.text}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Work Units</p>
                        <p className="text-2xl font-bold">
                          {report.stats.totalWorkUnits}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">평균 임팩트</p>
                        <div className="flex items-center gap-2">
                          <p className="text-2xl font-bold">
                            {report.stats.avgImpactScore.toFixed(1)}
                          </p>
                          {impactChange && (
                            <div className={`flex items-center gap-1 text-sm ${impactChange.color}`}>
                              <impactChange.icon className="h-4 w-4" />
                              <span>{impactChange.text}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">변경량</p>
                        <p className="text-xl font-bold">
                          <span className="text-green-600">
                            +{report.stats.totalAdditions.toLocaleString()}
                          </span>
                          {" / "}
                          <span className="text-red-600">
                            -{report.stats.totalDeletions.toLocaleString()}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* 요약 */}
                    <div>
                      <p className="text-sm font-medium mb-1">요약</p>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {report.summary}
                      </p>
                    </div>

                    {/* 강점/액션아이템 */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium mb-2 text-green-600">
                          주요 강점
                        </p>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {report.strengths.slice(0, 2).map((s, i) => (
                            <li key={i}>• {s}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2 text-blue-600">
                          액션 아이템
                        </p>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {report.actionItems.slice(0, 2).map((a, i) => (
                            <li key={i}>• {a}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {!isLoadingReports && !error && selectedUser && reports.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              해당 사용자의 리포트가 없습니다.
            </p>
          </CardContent>
        </Card>
      )}

      {!selectedOrg && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              조직과 팀원을 선택하여 연도별 비교를 확인하세요.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

