# 업무 일지 AI 분석 시스템

## 목차

1. [개요](#개요)
2. [아키텍처](#아키텍처)
3. [3단계 분석 프로세스](#3단계-분석-프로세스)
4. [프롬프트 전략](#프롬프트-전략)
5. [데이터 모델](#데이터-모델)
6. [API 엔드포인트](#api-엔드포인트)
7. [에러 핸들링](#에러-핸들링)
8. [성능 최적화](#성능-최적화)
9. [사용 예시](#사용-예시)

---

## 개요

업무 일지 AI 분석 시스템은 개발자의 Git 커밋 히스토리를 분석하여 **주간** 및 **월간** 업무 리포트를 자동으로 생성하는 시스템입니다.

### 주요 기능

- **3단계 분석 파이프라인**: 주요 커밋 선별 → 코드 리뷰 → 종합 분석
- **주간/월간 리포트**: 자동화된 업무 요약 및 인사이트 제공
- **코드 리뷰**: GitHub API를 통한 실제 코드 변경사항 분석
- **메트릭 추적**: 커밋 수, 작업 리포지토리, 변경 라인 수 등
- **캐싱**: 분석 결과를 DB에 저장하여 재사용

### 사용 기술

- **LLM**: OpenAI GPT-4o
- **GitHub API**: Octokit
- **데이터베이스**: PostgreSQL (Prisma ORM)
- **API**: Next.js API Routes with Server-Sent Events (SSE)

---

## 아키텍처

```
┌─────────────────┐
│   UI Layer      │
│ (React Client)  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│      API Routes                     │
│  - /analyze-week (POST)             │
│  - /analyze-month (POST + SSE)      │
│  - /analyses (GET)                  │
└──────────┬──────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│    JournalAnalyzer                   │
│  (Core Business Logic)               │
│                                      │
│  ┌────────────────────────────────┐ │
│  │  Stage 1: selectKeyCommits()   │ │
│  │  커밋 중요도 평가 및 선별      │ │
│  └────────────────────────────────┘ │
│           │                          │
│           ▼                          │
│  ┌────────────────────────────────┐ │
│  │  Stage 2: reviewCommit()       │ │
│  │  코드 변경사항 상세 리뷰       │ │
│  └────────────────────────────────┘ │
│           │                          │
│           ▼                          │
│  ┌────────────────────────────────┐ │
│  │  Stage 3: synthesizeWeekly()   │ │
│  │         synthesizeMonthly()    │ │
│  │  최종 종합 분석 생성           │ │
│  └────────────────────────────────┘ │
└──────────┬───────────────────────────┘
           │
           ├──────────────┐
           ▼              ▼
    ┌──────────┐   ┌─────────────┐
    │ OpenAI   │   │ GitHub API  │
    │ GPT-4o   │   │  (Octokit)  │
    └──────────┘   └─────────────┘
           │
           ▼
    ┌──────────────┐
    │  PostgreSQL  │
    │  (Prisma)    │
    │              │
    │ - WeeklyAnalysis  │
    │ - MonthlyAnalysis │
    └──────────────┘
```

---

## 3단계 분석 프로세스

### Stage 1: 주요 커밋 선별

**목적**: 대량의 커밋 중에서 가장 중요한 5개의 커밋을 선별합니다.

**프로세스**:

1. **입력 전처리**
   - 커밋 수가 5개 이하면 전부 선택
   - 50개 초과 시 변경량 기준 상위 50개만 LLM에 전달 (토큰 최적화)

2. **LLM 분석**
   - 모델: GPT-4o
   - Temperature: 0.3 (일관성 있는 선택)
   - 응답 형식: JSON 객체
   - Max Tokens: 1000

3. **선별 기준**
   - 기능 추가/개선의 중요도
   - 코드 변경 규모 (additions + deletions)
   - 핵심 모듈/파일 변경 여부
   - 버그 수정의 중요도

4. **결과**
   ```typescript
   interface KeyCommitInfo {
     sha: string;
     message: string;
     repoFullName: string;
     additions: number;
     deletions: number;
     committedAt: string;
     reason: string;  // 선별 이유
     score: number;   // 0-100 중요도 점수
   }
   ```

5. **Fallback 전략**
   - LLM 실패 시: 변경량 기준 상위 N개 선택
   - SHA 매칭 실패 시: 짧은 SHA도 매칭되도록 유연한 로직 적용

**핵심 코드**: `src/lib/journal/analyzer.ts::selectKeyCommits()`

---

### Stage 2: 코드 리뷰

**목적**: 선별된 주요 커밋의 실제 코드 변경사항을 분석합니다.

**프로세스**:

1. **GitHub API 호출**
   - Octokit을 사용하여 커밋 diff 가져오기
   - 파일별 patch(변경사항) 추출

2. **파일 필터링**
   ```typescript
   // 제외 패턴
   - test/, *.test.*, *.spec.*
   - docs/
   - package-lock.json, yarn.lock, pnpm-lock.yaml
   
   // 우선순위 높은 파일 (점수 2배)
   - src/, lib/, core/, app/, api/
   - *.ts, *.tsx, *.js, *.jsx
   ```
   - 최대 10개 파일만 선택
   - 각 파일의 patch를 최대 500줄로 제한

3. **LLM 분석**
   - 모델: GPT-4o
   - Temperature: 0.3
   - 응답 형식: JSON 객체
   - Max Tokens: 1500

4. **분석 관점**
   - 기술적 품질 (high/medium/low)
   - 복잡도 (high/medium/low)
   - 비즈니스/기술적 임팩트
   - 잠재적 리스크
   - 학습 포인트

5. **결과**
   ```typescript
   interface CommitReview {
     sha: string;
     message: string;
     repoFullName: string;
     summary: string;
     technicalQuality: 'high' | 'medium' | 'low';
     complexity: 'high' | 'medium' | 'low';
     impact: string[];
     risks: string[];
     learnings: string[];
     filesAnalyzed: Array<{
       path: string;
       changes: number;
       insight: string;
     }>;
   }
   ```

**핵심 코드**: `src/lib/journal/analyzer.ts::reviewCommit()`

---

### Stage 3: 종합 분석

**목적**: 주요 커밋과 코드 리뷰 결과를 종합하여 최종 리포트를 생성합니다.

#### 3-1. 주간 분석

**입력**:
- Stage 1 결과: KeyCommitInfo[]
- Stage 2 결과: CommitReview[]
- 전체 커밋: CommitForAnalysis[]

**LLM 설정**:
- 모델: GPT-4o
- Temperature: 0.3
- Max Tokens: 1500

**출력**:
```typescript
interface WeeklyAnalysisResult {
  summary: string;              // 주간 업무 종합 요약 (3-4문장)
  keyActivities: string[];      // 주요 활동 목록 (3-5개)
  workPattern: string;          // 작업 패턴 (집중형/분산형/유지보수형)
  technicalHighlights: string[]; // 기술적 하이라이트 (2-3개)
  insights: string[];           // 인사이트/개선점 (2-3개)
  metrics: {
    totalCommits: number;
    keyCommitsAnalyzed: number;
    reposWorked: number;
    linesChanged: number;
  };
}
```

**핵심 코드**: `src/lib/journal/analyzer.ts::synthesizeWeekly()`

---

#### 3-2. 월간 분석

**입력**:
- 주차별 WeeklyAnalysisResult[]
- 전체 커밋: CommitForAnalysis[]

**특징**:
- 주차별 분석을 먼저 완료한 후 실행
- SSE(Server-Sent Events)로 실시간 진행 상황 전달
- 캐시된 주간 분석 결과 재사용

**LLM 설정**:
- 모델: GPT-4o
- Temperature: 0.3
- Max Tokens: 2000 (주간보다 더 긴 응답)

**출력**:
```typescript
interface MonthlyAnalysisResult {
  summary: string;              // 월간 전체 요약 (4-5문장)
  weeklyBreakdown: Array<{      // 주차별 요약
    week: number;
    summary: string;
    keyActivity: string;
  }>;
  overallPattern: string;       // 전체 작업 패턴
  achievements: string[];       // 주요 성과 (3-5개)
  technicalGrowth: string[];    // 기술적 성장 (2-3개)
  recommendations: string[];    // 다음 달 권장 사항 (2-3개)
  metrics: {
    totalCommits: number;
    weeksActive: number;
    reposWorked: number;
    averageCommitsPerWeek: number;
  };
}
```

**핵심 코드**: `src/lib/journal/analyzer.ts::synthesizeMonthly()`

---

## 프롬프트 전략

### 1. Stage 1 프롬프트 (주요 커밋 선별)

**시스템 메시지**:
```
당신은 소프트웨어 개발 활동을 분석하는 전문가입니다. 
커밋 내역을 바탕으로 중요한 커밋을 선별합니다.
```

**프롬프트 구조**:
```
다음은 개발자의 [주간/월간] 커밋 목록입니다.
총 N개의 커밋 중에서 가장 중요한 5개의 커밋을 선별해주세요.

선별 기준:
1. 기능 추가/개선의 중요도
2. 코드 변경 규모 (additions + deletions)
3. 핵심 모듈/파일 변경 여부
4. 버그 수정의 중요도

커밋 목록:
1. [repo] message (+100/-50) - SHA:abc123...

JSON 형식으로 응답:
{
  "keyCommits": [
    {
      "sha": "전체 SHA 값",
      "reason": "선별 이유 (1-2문장)",
      "score": 85
    }
  ]
}
```

**핵심 전략**:
- ✅ **명확한 선별 기준 제시**: 4가지 구체적 기준
- ✅ **SHA 전체 복사 요청**: LLM이 SHA를 정확히 반환하도록 유도
- ✅ **JSON 강제**: `response_format: { type: "json_object" }`
- ✅ **점수화**: 0-100 점수로 우선순위 명확화

**파일**: `src/lib/journal/prompts.ts::buildStage1Prompt()`

---

### 2. Stage 2 프롬프트 (코드 리뷰)

**시스템 메시지**:
```
당신은 코드 리뷰 전문가입니다. 
커밋의 변경사항을 분석하여 기술적 품질, 임팩트, 리스크를 평가합니다.
```

**프롬프트 구조**:
```
다음 커밋의 코드 변경사항을 리뷰해주세요.

커밋: [message]
리포지터리: [repo]
변경 통계: +100/-50

변경된 파일들과 diff:
파일: src/components/Button.tsx
상태: modified
변경: +20/-5

```diff
[실제 코드 diff]
```

다음 관점에서 분석해주세요:
1. 기술적 품질 (high/medium/low)
2. 복잡도 (high/medium/low)
3. 비즈니스/기술적 임팩트
4. 잠재적 리스크
5. 배운 점/인사이트

JSON 형식으로 응답:
{
  "summary": "커밋 요약 (2-3문장)",
  "technicalQuality": "high",
  "complexity": "medium",
  "impact": ["임팩트 1", "임팩트 2"],
  "risks": ["리스크 1"],
  "learnings": ["배운점 1"],
  "filesAnalyzed": [
    {
      "path": "파일 경로",
      "changes": 25,
      "insight": "파일별 인사이트"
    }
  ]
}
```

**핵심 전략**:
- ✅ **실제 코드 diff 제공**: LLM이 구체적인 변경사항을 볼 수 있도록
- ✅ **파일 필터링**: 중요한 파일만 선택하여 토큰 절약
- ✅ **구조화된 평가**: 품질/복잡도를 3단계로 표준화
- ✅ **다각도 분석**: 임팩트, 리스크, 학습을 모두 평가

**파일**: `src/lib/journal/prompts.ts::buildStage2Prompt()`

---

### 3. Stage 3 프롬프트 (주간 종합)

**시스템 메시지**:
```
당신은 개발 활동 분석 전문가입니다. 
주간 업무를 종합하여 명확하고 통찰력 있는 분석을 제공합니다.
```

**프롬프트 구조**:
```
다음은 이번 주의 주요 커밋 분석 결과입니다.

선별된 주요 커밋 (5개):
- [message] (선별 이유: ...)

코드 리뷰 결과:
커밋: [message]
요약: [summary]
기술 품질: high
임팩트: 성능 개선, UX 향상

위 정보를 바탕으로 주간 업무를 종합 분석해주세요:
1. 전체 요약 (3-4문장)
2. 주요 활동 목록 (3-5개)
3. 작업 패턴 (집중형/분산형/유지보수형 등)
4. 기술적 하이라이트 (2-3개)
5. 인사이트/개선점 (2-3개)

JSON 형식으로 응답:
{
  "summary": "주간 업무 종합 요약",
  "keyActivities": ["활동 1", "활동 2"],
  "workPattern": "작업 패턴 설명",
  "technicalHighlights": ["하이라이트 1"],
  "insights": ["인사이트 1"]
}
```

**핵심 전략**:
- ✅ **문맥 제공**: Stage 1, 2의 결과를 모두 제공
- ✅ **구체적 요구사항**: 5가지 관점의 분석 요청
- ✅ **패턴 인식**: 작업 스타일 분류
- ✅ **실행 가능한 인사이트**: 단순 요약이 아닌 통찰 요청

**파일**: `src/lib/journal/prompts.ts::buildStage3WeeklyPrompt()`

---

### 4. Stage 3 프롬프트 (월간 종합)

**시스템 메시지**:
```
당신은 개발 활동 분석 전문가입니다. 
월간 업무를 종합하여 성과와 성장을 분석하고 권장사항을 제공합니다.
```

**프롬프트 구조**:
```
다음은 이번 달의 주차별 분석 결과입니다.

=== 1주차 ===
요약: [weekly summary]
주요 활동: 활동1, 활동2
패턴: 집중형

=== 2주차 ===
...

위 주차별 분석을 바탕으로 월간 업무를 종합 분석해주세요:
1. 월간 전체 요약 (4-5문장)
2. 주차별 요약 (각 주차 1-2문장)
3. 전체 작업 패턴
4. 주요 성과 (3-5개)
5. 기술적 성장 (2-3개)
6. 다음 달 권장 사항 (2-3개)

JSON 형식으로 응답:
{
  "summary": "월간 전체 요약",
  "weeklyBreakdown": [
    {
      "week": 1,
      "summary": "주차 요약",
      "keyActivity": "핵심 활동"
    }
  ],
  "overallPattern": "전체 작업 패턴",
  "achievements": ["성과 1", "성과 2"],
  "technicalGrowth": ["성장 1", "성장 2"],
  "recommendations": ["권장사항 1", "권장사항 2"]
}
```

**핵심 전략**:
- ✅ **주간 결과 활용**: 이미 분석된 주간 결과를 재사용
- ✅ **트렌드 분석**: 주차별 변화와 패턴 파악
- ✅ **미래 지향적**: 권장사항 제공으로 개선 방향 제시
- ✅ **성장 추적**: 기술적 발전 강조

**파일**: `src/lib/journal/prompts.ts::buildStage3MonthlyPrompt()`

---

## 데이터 모델

### Prisma Schema

```prisma
// 분석 상태
enum AnalysisStatus {
  PENDING     // 대기 중
  STAGE1      // 1단계 진행 중
  STAGE2      // 2단계 진행 중
  STAGE3      // 3단계 진행 중
  COMPLETED   // 완료
  FAILED      // 실패
}

// 주간 분석
model WeeklyAnalysis {
  id          String   @id @default(cuid())
  runId       String
  userLogin   String
  year        Int
  weekNumber  Int      // ISO 주차 번호 (1-53)
  
  startDate   DateTime // 주차 시작일
  endDate     DateTime // 주차 종료일
  
  // 3단계 결과 (JSON)
  stage1Result Json?   // { keyCommits: KeyCommitInfo[] }
  stage2Result Json?   // { commitReviews: CommitReview[] }
  stage3Result Json?   // WeeklyAnalysisResult
  
  status      AnalysisStatus @default(PENDING)
  error       String?
  analyzedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  run         AnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  
  @@unique([runId, weekNumber])
  @@index([userLogin, year])
}

// 월간 분석
model MonthlyAnalysis {
  id          String   @id @default(cuid())
  runId       String
  userLogin   String
  year        Int
  month       Int      // 1-12
  
  startDate   DateTime // 월 시작일
  endDate     DateTime // 월 종료일
  
  // 3단계 결과 (JSON)
  stage1Result Json?   // 월간은 주간 분석을 재사용하므로 비어있음
  stage2Result Json?   // 월간은 주간 분석을 재사용하므로 비어있음
  stage3Result Json?   // MonthlyAnalysisResult
  
  status      AnalysisStatus @default(PENDING)
  error       String?
  analyzedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  run         AnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  
  @@unique([runId, month])
  @@index([userLogin, year])
}
```

**파일**: `prisma/schema.prisma`

---

## API 엔드포인트

### 1. 주간 분석 실행

**Endpoint**: `POST /api/analysis/[runId]/journal/analyze-week`

**Request Body**:
```json
{
  "weekNumber": 45,
  "startDate": "2025-11-02T15:00:00.000Z",
  "endDate": "2025-11-09T14:59:59.999Z"
}
```

**Response**:
```json
{
  "analysisId": "clxxx...",
  "status": "COMPLETED",
  "stage1Result": {
    "keyCommits": [/* KeyCommitInfo[] */]
  },
  "stage2Result": {
    "commitReviews": [/* CommitReview[] */]
  },
  "stage3Result": {
    "summary": "...",
    "keyActivities": ["..."],
    "workPattern": "...",
    "technicalHighlights": ["..."],
    "insights": ["..."],
    "metrics": { /* ... */ }
  }
}
```

**주요 로직**:
1. 기존 분석 확인 (캐시 활용)
2. 커밋 조회
3. 3단계 분석 순차 실행
4. 각 단계마다 DB 업데이트

**파일**: `src/app/api/analysis/[runId]/journal/analyze-week/route.ts`

---

### 2. 월간 분석 실행 (SSE)

**Endpoint**: `POST /api/analysis/[runId]/journal/analyze-month`

**Request Body**:
```json
{
  "month": 11
}
```

**Response**: Server-Sent Events (SSE) 스트림

```
data: {"type":"progress","data":{"message":"분석 시작..."}}

data: {"type":"progress","data":{"currentWeek":1,"totalWeeks":4}}

data: {"type":"weekly_complete","data":{"weekNumber":45}}

data: {"type":"monthly_complete","data":{"analysisId":"clxxx..."}}
```

**이벤트 타입**:
- `progress`: 진행 상황 업데이트
- `weekly_complete`: 주간 분석 완료
- `monthly_complete`: 월간 분석 완료
- `error`: 에러 발생

**주요 로직**:
1. 해당 월의 주차 계산 (ISO 8601)
2. 각 주차별 분석 실행 (캐시 재사용)
3. SSE로 실시간 진행 상황 전송
4. 모든 주간 분석 완료 후 월간 종합
5. 최종 결과 DB 저장

**파일**: `src/app/api/analysis/[runId]/journal/analyze-month/route.ts`

---

### 3. 분석 결과 조회

**Endpoint**: `GET /api/analysis/[runId]/journal/analyses`

**Response**:
```json
{
  "weeklyAnalyses": [
    {
      "id": "clxxx...",
      "weekNumber": 45,
      "startDate": "2025-11-02T15:00:00.000Z",
      "endDate": "2025-11-09T14:59:59.999Z",
      "status": "COMPLETED",
      "stage1Result": { /* ... */ },
      "stage2Result": { /* ... */ },
      "stage3Result": { /* ... */ },
      "analyzedAt": "2025-11-10T10:30:00.000Z"
    }
  ],
  "monthlyAnalyses": [
    {
      "id": "clyyy...",
      "month": 11,
      "status": "COMPLETED",
      "stage3Result": { /* ... */ }
    }
  ]
}
```

**파일**: `src/app/api/analysis/[runId]/journal/analyses/route.ts`

---

## 에러 핸들링

### 1. Stage 1 Fallback

```typescript
try {
  // LLM 호출
  const keyCommits = await llm.selectKeyCommits();
} catch (error) {
  // Fallback: 변경량 기준 상위 N개 선택
  return commits
    .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions))
    .slice(0, topN)
    .map(c => ({
      ...c,
      reason: "변경량 기준 선정 (LLM 분석 실패)",
      score: 50
    }));
}
```

### 2. SHA 매칭 실패 대응

```typescript
const findMatchingCommit = (sha: string) => {
  // 1. 정확한 매칭
  let match = commits.find(c => c.sha === sha);
  if (match) return match;
  
  // 2. 짧은 SHA 매칭 (LLM이 축약된 SHA 반환 시)
  match = commits.find(c => 
    c.sha.startsWith(sha) || 
    sha.startsWith(c.sha.slice(0, 7))
  );
  return match;
};
```

### 3. Stage 2 에러 처리

```typescript
try {
  const review = await reviewCommit(commit);
} catch (error) {
  // 개별 커밋 리뷰 실패는 무시하고 계속 진행
  console.error(`Failed to review commit ${commit.sha}:`, error);
  continue;
}
```

### 4. 동시 실행 방지

```typescript
// 이미 진행 중인 분석이 있으면 409 에러
if (analysis.status === "STAGE1" || 
    analysis.status === "STAGE2" || 
    analysis.status === "STAGE3") {
  return NextResponse.json(
    { error: "이미 분석이 진행 중입니다" },
    { status: 409 }
  );
}
```

---

## 성능 최적화

### 1. 토큰 최적화

**Stage 1**:
- 커밋 수 > 50개 → 상위 50개만 LLM 전달
- max_completion_tokens: 1000

**Stage 2**:
- 파일 수 > 10개 → 중요도 기준 상위 10개만 선택
- patch를 500줄로 제한
- test 파일, lock 파일 제외
- max_completion_tokens: 1500

**Stage 3**:
- 이미 분석된 Stage 1, 2 결과만 전달 (원본 커밋/diff 재전송 안 함)
- 주간: max_completion_tokens 1500
- 월간: max_completion_tokens 2000

### 2. 캐싱 전략

```typescript
// 이미 완료된 분석은 재사용
if (analysis?.status === "COMPLETED") {
  return NextResponse.json({
    analysisId: analysis.id,
    status: analysis.status,
    stage3Result: analysis.stage3Result,
  });
}
```

### 3. 병렬 처리

```typescript
// Stage 2: 여러 커밋 리뷰를 순차적으로 실행 (GitHub API rate limit 고려)
for (const commit of keyCommits) {
  const review = await analyzer.reviewCommit(commit, owner, repo);
  commitReviews.push(review);
}
```

### 4. SSE를 통한 UX 개선

```typescript
// 장시간 소요되는 월간 분석에 SSE 사용
const encoder = new TextEncoder();
const stream = new ReadableStream({
  async start(controller) {
    // 진행 상황 실시간 전송
    controller.enqueue(
      encoder.encode(`data: ${JSON.stringify({ type: "progress", data })}\n\n`)
    );
  }
});
```

---

## 사용 예시

### 클라이언트에서 주간 분석 실행

```typescript
const handleAnalyzeWeek = async (week: WeeklyAnalysisData) => {
  setAnalyzing(true);
  
  try {
    const response = await fetch(`/api/analysis/${runId}/journal/analyze-week`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekNumber: week.weekNumber,
        startDate: week.startDate,
        endDate: week.endDate,
      }),
    });
    
    if (!response.ok) {
      throw new Error("분석 요청 실패");
    }
    
    const result = await response.json();
    console.log("Weekly analysis result:", result);
    
    // UI 새로고침
    onRefresh();
  } catch (error) {
    console.error("Analysis error:", error);
  } finally {
    setAnalyzing(false);
  }
};
```

### 클라이언트에서 월간 분석 실행 (SSE)

```typescript
const handleAnalyzeMonth = async (month: number) => {
  setAnalyzing(true);
  setProgress("분석 시작 중...");
  
  try {
    const response = await fetch(`/api/analysis/${runId}/journal/analyze-month`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
    });
    
    if (!response.ok || !response.body) {
      throw new Error("분석 요청 실패");
    }
    
    // SSE 스트림 읽기
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");
      
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = JSON.parse(line.slice(6));
          
          if (data.type === "progress") {
            setProgress(data.data.message || "진행 중...");
          } else if (data.type === "monthly_complete") {
            setProgress("완료");
            onRefresh();
          } else if (data.type === "error") {
            throw new Error(data.data.message);
          }
        }
      }
    }
  } catch (error) {
    console.error("Analysis error:", error);
  } finally {
    setAnalyzing(false);
  }
};
```

---

## 디버깅 및 로깅

### 로그 확인 포인트

```typescript
// Stage 1
console.log(`[selectKeyCommits] LLM returned ${llmKeyCommits.length} key commits`);
console.log(`[selectKeyCommits] Matched ${selectedCommits.length} commits`);

// analyze-week API
console.log(`[analyze-week] Week ${weekNumber}: ${start.toISOString()} ~ ${end.toISOString()}`);
console.log(`[analyze-week] User: ${userLogin}, OrgId: ${orgId}`);
console.log(`[analyze-week] Found ${commits.length} commits`);
```

### 트러블슈팅

**문제**: "이 기간에는 활동이 없었습니다" 오류

**원인**:
1. LLM이 짧은 SHA를 반환하여 매칭 실패
2. 날짜 범위 계산 오류 (ISO 주차 계산)

**해결**:
1. SHA 매칭 로직에 유연성 추가 (`startsWith` 비교)
2. `date-fns`의 `setISOWeek`, `startOfISOWeek`, `endOfISOWeek` 사용

---

## 향후 개선 방향

### 1. 성능
- [ ] Stage 2 코드 리뷰를 병렬 처리 (GitHub API rate limit 관리)
- [ ] Redis 캐싱 도입
- [ ] 백그라운드 작업 큐 (Bull, BullMQ)

### 2. 기능
- [ ] 커스텀 프롬프트 템플릿 지원
- [ ] 다른 LLM 모델 지원 (Claude, Llama 등)
- [ ] PDF/Markdown 리포트 내보내기
- [ ] 팀 단위 종합 분석

### 3. 품질
- [ ] 프롬프트 A/B 테스트
- [ ] 분석 결과 평가 메트릭 추가
- [ ] 사용자 피드백 수집 기능

---

## 관련 파일

### 핵심 로직
- `src/lib/journal/analyzer.ts` - JournalAnalyzer 클래스
- `src/lib/journal/prompts.ts` - LLM 프롬프트 빌더
- `src/lib/journal/utils.ts` - 날짜/주차 계산 유틸

### API Routes
- `src/app/api/analysis/[runId]/journal/analyze-week/route.ts`
- `src/app/api/analysis/[runId]/journal/analyze-month/route.ts`
- `src/app/api/analysis/[runId]/journal/analyses/route.ts`

### UI Components
- `src/components/journal/views/week-report-view.tsx`
- `src/components/journal/views/month-report-view.tsx`
- `src/components/journal/journal-sidebar.tsx`

### 데이터베이스
- `prisma/schema.prisma`

### 타입 정의
- `src/types/index.ts` (KeyCommitInfo, CommitReview, WeeklyAnalysisResult, MonthlyAnalysisResult 등)

---

## 라이센스 및 의존성

**주요 의존성**:
- `openai`: ^4.x - OpenAI API 클라이언트
- `octokit`: ^3.x - GitHub API 클라이언트
- `@prisma/client`: ^5.x - Prisma ORM
- `date-fns`: ^3.x - 날짜 계산
- `next`: ^16.x - Next.js 프레임워크

**환경 변수**:
```env
OPENAI_API_KEY=sk-...
GITHUB_APP_ID=...
GITHUB_APP_PRIVATE_KEY=...
DATABASE_URL=postgresql://...
```

---

**문서 작성일**: 2025-12-14  
**버전**: 1.0.0  
**작성자**: AI Development Assistant
