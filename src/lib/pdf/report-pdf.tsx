import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { ReportStats } from "@/types";

// 스타일 정의
const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    padding: 40,
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 30,
    borderBottomWidth: 2,
    borderBottomColor: "#3b82f6",
    paddingBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 12,
    color: "#64748b",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 10,
    backgroundColor: "#f1f5f9",
    padding: 8,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    width: "22%",
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 4,
  },
  statLabel: {
    fontSize: 9,
    color: "#64748b",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1e293b",
  },
  summaryText: {
    fontSize: 11,
    color: "#374151",
    lineHeight: 1.6,
    marginBottom: 15,
  },
  listItem: {
    fontSize: 10,
    color: "#374151",
    marginBottom: 6,
    paddingLeft: 10,
  },
  bulletPoint: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#3b82f6",
    marginRight: 8,
    marginTop: 4,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 10,
  },
  footerText: {
    fontSize: 8,
    color: "#94a3b8",
  },
  strengthSection: {
    backgroundColor: "#f0fdf4",
    padding: 12,
    borderRadius: 4,
    marginBottom: 10,
  },
  improvementSection: {
    backgroundColor: "#fefce8",
    padding: 12,
    borderRadius: 4,
    marginBottom: 10,
  },
  actionSection: {
    backgroundColor: "#eff6ff",
    padding: 12,
    borderRadius: 4,
    marginBottom: 10,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 8,
  },
});

export interface ReportPdfData {
  userLogin: string;
  userName: string | null;
  year: number;
  orgName: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  actionItems: string[];
  stats: ReportStats;
  managerNotes: string | null;
  isFinalized: boolean;
  finalizedAt: string | null;
}

function ReportPdfDocument({ report }: { report: ReportPdfData }) {
  const generatedAt = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {report.userName || report.userLogin} - {report.year}년 연간 리포트
          </Text>
          <Text style={styles.subtitle}>
            @{report.userLogin} | {report.orgName}
          </Text>
        </View>

        {/* 통계 카드 */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>총 커밋</Text>
            <Text style={styles.statValue}>{report.stats.totalCommits}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>작업 묶음</Text>
            <Text style={styles.statValue}>{report.stats.totalWorkUnits}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>평균 임팩트</Text>
            <Text style={styles.statValue}>
              {report.stats.avgImpactScore.toFixed(1)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>변경량</Text>
            <Text style={styles.statValue}>
              +{report.stats.totalAdditions.toLocaleString()}
            </Text>
          </View>
        </View>

        {/* AI 요약 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI 요약</Text>
          <Text style={styles.summaryText}>{report.summary}</Text>
        </View>

        {/* 강점 */}
        <View style={styles.strengthSection}>
          <Text style={[styles.sectionSubtitle, { color: "#16a34a" }]}>
            강점
          </Text>
          {report.strengths.map((item, index) => (
            <View key={index} style={styles.listRow}>
              <View style={[styles.bulletPoint, { backgroundColor: "#16a34a" }]} />
              <Text style={styles.listItem}>{item}</Text>
            </View>
          ))}
        </View>

        {/* 개선 영역 */}
        <View style={styles.improvementSection}>
          <Text style={[styles.sectionSubtitle, { color: "#ca8a04" }]}>
            개선 영역
          </Text>
          {report.improvements.map((item, index) => (
            <View key={index} style={styles.listRow}>
              <View style={[styles.bulletPoint, { backgroundColor: "#ca8a04" }]} />
              <Text style={styles.listItem}>{item}</Text>
            </View>
          ))}
        </View>

        {/* 액션 아이템 */}
        <View style={styles.actionSection}>
          <Text style={[styles.sectionSubtitle, { color: "#2563eb" }]}>
            액션 아이템
          </Text>
          {report.actionItems.map((item, index) => (
            <View key={index} style={styles.listRow}>
              <View style={[styles.bulletPoint, { backgroundColor: "#2563eb" }]} />
              <Text style={styles.listItem}>{item}</Text>
            </View>
          ))}
        </View>

        {/* 매니저 코멘트 */}
        {report.managerNotes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>매니저 코멘트</Text>
            <Text style={styles.summaryText}>{report.managerNotes}</Text>
          </View>
        )}

        {/* 푸터 */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            생성일: {generatedAt}
            {report.isFinalized && report.finalizedAt
              ? ` | 확정일: ${new Date(report.finalizedAt).toLocaleDateString("ko-KR")}`
              : ""}
          </Text>
          <Text style={styles.footerText}>Code Review System</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateReportPdf(report: ReportPdfData): Promise<Buffer> {
  const buffer = await renderToBuffer(<ReportPdfDocument report={report} />);
  return Buffer.from(buffer);
}
