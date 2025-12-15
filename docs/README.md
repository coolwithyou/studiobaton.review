# Studiobaton Review - Documentation

이 폴더는 Studiobaton Review 프로젝트의 주요 기능에 대한 문서를 포함하고 있습니다.

## 📚 문서 목록

### 1. [업무 일지 AI 분석 시스템](./journal-ai-analysis.md)

**내용**: 업무 일지 AI 분석 시스템의 전체 아키텍처, 구현 상세, 데이터 모델 등을 다룹니다.

**주요 주제**:
- 3단계 분석 프로세스 (주요 커밋 선별 → 코드 리뷰 → 종합 분석)
- 아키텍처 다이어그램
- 프롬프트 전략
- 데이터 모델 (Prisma Schema)
- API 엔드포인트
- 에러 핸들링 및 Fallback
- 성능 최적화
- 사용 예시

**대상 독자**: 개발자, 시스템 아키텍트

**파일**: `journal-ai-analysis.md`

---

### 2. [AI 분석 프롬프트 예시](./journal-prompts-examples.md)

**내용**: 실제 프로젝트에서 사용하는 LLM 프롬프트의 구체적인 예시를 제공합니다.

**주요 주제**:
- Stage 1: 주요 커밋 선별 프롬프트
- Stage 2: 코드 리뷰 프롬프트
- Stage 3-1: 주간 종합 분석 프롬프트
- Stage 3-2: 월간 종합 분석 프롬프트
- 시스템 메시지
- LLM 응답 예시
- 프롬프트 개선 팁

**대상 독자**: 프롬프트 엔지니어, AI 개발자, 시스템 개선 담당자

**파일**: `journal-prompts-examples.md`

---

## 🚀 빠른 시작

### 업무 일지 AI 분석 시스템 이해하기

1. **아키텍처 파악**: [journal-ai-analysis.md#아키텍처](./journal-ai-analysis.md#아키텍처)
2. **3단계 프로세스**: [journal-ai-analysis.md#3단계-분석-프로세스](./journal-ai-analysis.md#3단계-분석-프로세스)
3. **API 사용법**: [journal-ai-analysis.md#api-엔드포인트](./journal-ai-analysis.md#api-엔드포인트)

### 프롬프트 개선 작업

1. **현재 프롬프트 확인**: [journal-prompts-examples.md](./journal-prompts-examples.md)
2. **프롬프트 코드**: `src/lib/journal/prompts.ts`
3. **개선 팁**: [journal-prompts-examples.md#프롬프트-개선-팁](./journal-prompts-examples.md#프롬프트-개선-팁)

---

## 🔧 주요 구성 요소

### 핵심 라이브러리

```typescript
// AI 분석 엔진
import { JournalAnalyzer } from "@/lib/journal/analyzer";

// 프롬프트 빌더
import {
  buildStage1Prompt,
  buildStage2Prompt,
  buildStage3WeeklyPrompt,
  buildStage3MonthlyPrompt,
} from "@/lib/journal/prompts";

// 날짜/주차 계산
import { generateYearWeeks, getWeeksInMonth } from "@/lib/journal/utils";
```

### API 엔드포인트

```
POST /api/analysis/[runId]/journal/analyze-week
POST /api/analysis/[runId]/journal/analyze-month  (SSE)
GET  /api/analysis/[runId]/journal/analyses
```

### UI 컴포넌트

```typescript
// 메인 페이지
import JournalPageClient from "@/app/(dashboard)/organizations/[login]/analysis/[runId]/journal/page-new";

// 사이드바
import { JournalSidebar } from "@/components/journal/journal-sidebar";

// 뷰
import { MonthReportView } from "@/components/journal/views/month-report-view";
import { WeekReportView } from "@/components/journal/views/week-report-view";
```

---

## 📊 데이터 플로우

```
사용자 요청
    ↓
API Route (analyze-week / analyze-month)
    ↓
JournalAnalyzer
    ├─ Stage 1: selectKeyCommits() → OpenAI GPT-4o
    ├─ Stage 2: reviewCommit() → GitHub API + OpenAI
    └─ Stage 3: synthesizeWeekly/Monthly() → OpenAI
    ↓
DB 저장 (WeeklyAnalysis / MonthlyAnalysis)
    ↓
UI 업데이트
```

---

## 🐛 디버깅

### 로그 확인

```bash
# 개발 서버 실행
pnpm dev

# 로그 패턴
[analyze-week] Week 45: 2025-11-02 ~ 2025-11-09
[analyze-week] Found 37 commits
[selectKeyCommits] LLM returned 5 key commits
[selectKeyCommits] Matched 5 commits
```

### 주요 이슈 해결

**문제**: "이 기간에는 활동이 없었습니다" 오류

**해결**: [journal-ai-analysis.md#에러-핸들링](./journal-ai-analysis.md#에러-핸들링)

---

## 🔐 환경 변수

```env
# OpenAI
OPENAI_API_KEY=sk-...

# GitHub
GITHUB_APP_ID=...
GITHUB_APP_PRIVATE_KEY=...

# Database
DATABASE_URL=postgresql://...
```

---

## 📈 성능 메트릭

| 단계             | 평균 소요 시간 | 토큰 사용량  |
| ---------------- | -------------- | ------------ |
| Stage 1          | 2-3초          | ~500 tokens  |
| Stage 2 (커밋당) | 3-5초          | ~800 tokens  |
| Stage 3 (주간)   | 3-4초          | ~600 tokens  |
| Stage 3 (월간)   | 4-6초          | ~1000 tokens |

**전체 주간 분석**: ~30-50초 (5개 커밋 기준)  
**전체 월간 분석**: ~3-5분 (4주차 기준, SSE로 진행 상황 표시)

---

## 🤝 기여 가이드

### 프롬프트 개선

1. `src/lib/journal/prompts.ts` 수정
2. `docs/journal-prompts-examples.md` 업데이트
3. 테스트 실행 및 결과 확인

### 새로운 분석 기능 추가

1. `src/lib/journal/analyzer.ts`에 메서드 추가
2. API Route 구현
3. UI 컴포넌트 연결
4. 문서 업데이트

---

## 📞 문의 및 지원

프로젝트에 대한 질문이나 제안사항이 있으시면 이슈를 등록해주세요.

---

**최종 업데이트**: 2025-12-14  
**문서 버전**: 1.0.0
