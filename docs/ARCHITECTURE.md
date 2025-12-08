# 시스템 아키텍처

## 전체 플로우

```
┌─────────────────┐
│  사용자 입력     │
│  - 조직          │
│  - 연도          │
│  - 팀원 목록     │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  API: /api/analysis/start           │
│  - AnalysisRun 생성 (QUEUED)        │
│  - 초기 진행률 설정                  │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Job: scan-repos                    │
│  - GitHub API: 저장소 목록 조회      │
│  - Repository 레코드 저장/업데이트   │
│  - 상태: SCANNING_COMMITS            │
└────────┬────────────────────────────┘
         │
         ├──► Job: scan-commits (Repo 1)
         ├──► Job: scan-commits (Repo 2)  (Fan-out)
         └──► Job: scan-commits (Repo N)
                 │
                 ├─► GitHub API: 커밋 조회 (연도+작성자)
                 ├─► Commit, CommitFile 저장
                 └─► 진행률 업데이트
                 │
                 ▼
         ┌──────────────────────────┐
         │  모든 Repo 완료?         │
         │  Yes → 다음 단계          │
         └────────┬─────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Job: build-work-units              │
│  - 사용자별/저장소별 커밋 클러스터링 │
│  - WorkUnit 생성                    │
│  - 임팩트 스코어 계산                │
│  - 샘플링 대상 선정                  │
│  - 상태: REVIEWING                  │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Job: ai-review                     │
│  - 샘플링된 WorkUnit 조회            │
│  - LLM API 호출 (GPT-4o/Claude)     │
│  - AiReview 저장                    │
│  - 상태: FINALIZING                 │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Job: finalize-reports              │
│  - 사용자별 통계 집계                │
│  - AI 리뷰 요약 (LLM)                │
│  - YearlyReport 생성                │
│  - 상태: DONE                       │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  결과 조회                           │
│  - 연간 리포트 페이지                │
│  - 차트 시각화                       │
│  - 연도별 비교                       │
└─────────────────────────────────────┘
```

---

## 데이터 흐름

### 1. 데이터 수집 단계

```
GitHub API
    │
    ├─► Organization Info ────► Organization Table
    │
    ├─► Repository List ──────► Repository Table
    │
    └─► Commits (by year/author)
            │
            ├─► Commit ───────► Commit Table
            │                     │
            └─► Files ────────► CommitFile Table
```

### 2. 분석 단계

```
Commit Table (+ CommitFile)
    │
    ├─► Clustering Algorithm
    │       │
    │       └─► WorkUnit Table
    │               │
    │               ├─► WorkUnitCommit (join)
    │               │
    │               └─► Impact Scoring
    │                       │
    └─────────────────────► impactScore, impactFactors
```

### 3. AI 리뷰 단계

```
WorkUnit (isSampled=true)
    │
    ├─► Diff Sampling
    │
    ├─► LLM API (GPT-4o/Claude)
    │       │
    │       └─► ReviewResult (JSON)
    │
    └─► AiReview Table
```

### 4. 리포트 생성 단계

```
WorkUnit + AiReview
    │
    ├─► Stats Aggregation
    │       │
    │       ├─► Monthly Activity
    │       ├─► Work Type Distribution
    │       ├─► Repo Contributions
    │       └─► Impact Avg
    │
    ├─► LLM Summary Generation
    │       │
    │       └─► Yearly Summary
    │
    └─► YearlyReport Table
```

---

## 컴포넌트 아키텍처

### 서버 컴포넌트 (RSC)

대부분의 페이지는 Server Component로 구현:

- 데이터베이스 직접 조회 (서버 사이드)
- SEO 최적화
- 초기 로딩 빠름

```typescript
// app/(dashboard)/dashboard/page.tsx
export default async function DashboardPage() {
  const user = await getUser(); // 서버에서 실행
  const runs = await db.analysisRun.findMany(...); // DB 직접 조회
  return <div>...</div>;
}
```

### 클라이언트 컴포넌트

인터랙션이 필요한 경우만 Client Component:

- 폼 입력 (`analysis/new/page.tsx`)
- 차트 (`components/charts/*`)
- 드롭다운, 다이얼로그 등

```typescript
"use client";

import { useState } from "react";
// ...
```

---

## API 설계 패턴

### 1. 인증 검증

```typescript
// 모든 보호된 API
const session = await getSession();
if (!session.isLoggedIn) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

### 2. 에러 핸들링

```typescript
try {
  // ...
} catch (error) {
  console.error("Error context:", error);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}
```

### 3. Job 멱등성 (Idempotency)

모든 Job은 여러 번 실행되어도 안전하도록 설계:

```typescript
// upsert 사용
await db.commit.upsert({
  where: { repoId_sha: { repoId, sha } },
  create: { ... },
  update: { ... },
});
```

---

## Work Unit 클러스터링 상세

### 알고리즘 단계

```
Input: Commits[] (같은 author, repo, 연도)

Step 1: 시간순 정렬
  ├─► committedAt 기준 오름차순

Step 2: 시간 기반 초기 그룹핑
  ├─► maxTimeGapHours (기본 8시간)
  └─► 연속 커밋 간 간격이 기준 이하면 같은 그룹

Step 3: 경로 유사도로 세분화
  ├─► Jaccard Similarity (디렉토리 기준)
  ├─► minPathOverlap (기본 0.3)
  └─► 유사도가 낮으면 분리

Step 4: 크기 제한
  ├─► maxCommitsPerUnit (기본 50)
  └─► minCommitsPerUnit (기본 1)

Output: WorkUnit[]
```

### Jaccard Similarity 계산

```typescript
function calculatePathSimilarity(pathsA, pathsB) {
  // 파일 경로 → 디렉토리 경로
  dirsA = pathsA.map(getDirectory)  // "src/app/page.tsx" → "src/app"
  dirsB = pathsB.map(getDirectory)
  
  // 집합 연산
  intersection = dirsA ∩ dirsB
  union = dirsA ∪ dirsB
  
  // Jaccard 계수
  return |intersection| / |union|
}
```

---

## 임팩트 스코어 상세

### 계산 공식

```
impactScore = baseScore 
            + sizeScore
            + coreModuleBonus
            + hotspotBonus
            + testPenalty
            + configBonus
```

### 각 요소 설명

**baseScore** (기본 점수)
```typescript
cappedLoc = min(additions + deletions, 500)
baseScore = log10(cappedLoc + 1) * 10
```

**sizeScore** (규모 점수)
```typescript
sizeScore = min(cappedLoc / 100, 5)
```

**coreModuleBonus** (핵심 모듈 보너스)
```typescript
for each primaryPath:
  for each criticalPath in config:
    if path matches pattern:
      bonus += weight
return min(bonus, 10)  // 캡 적용
```

**hotspotBonus** (핫스팟 보너스)
```typescript
hotspotCount = primaryPaths에서 hotspotFiles에 포함된 수
hotspotBonus = hotspotCount * 1.5
```

**testPenalty** (테스트 비율)
```typescript
testRatio = testFiles / totalFiles
if testRatio > 0.8:
  penalty = -3  // 테스트만 너무 많으면 감점
elif 0 < testRatio <= 0.5:
  penalty = +2  // 적절한 테스트 포함 시 보너스
```

**configBonus** (설정/스키마 변경)
```typescript
if hasConfigFile: bonus += 1.3
if hasSchemaFile: bonus += 1.8
```

---

## LLM 통합 패턴

### Provider 추상화

```typescript
interface LLMProvider {
  name: string;
  generateReview(input: ReviewInput): Promise<ReviewResult>;
  estimateCost(input: ReviewInput): number;
}

// 구현체
- OpenAIProvider (gpt-4o)
- AnthropicProvider (claude-3-5-sonnet)
```

### 프롬프트 버전 관리

```typescript
export const PROMPT_VERSION = "v1.0.0";

// DB에 저장
AiReview {
  promptVersion: "v1.0.0"
  result: ReviewResult
}

// 추후 프롬프트 변경 시
// v1.0.0 결과와 v2.0.0 결과를 비교 가능
```

### 비용 최적화

- 전체 WorkUnit 중 10-12개만 샘플링
- Diff는 최대 5개 파일, 파일당 100줄로 제한
- 총 토큰 예산: 4000 토큰

---

## 성능 최적화

### 데이터베이스 인덱스

```prisma
// 자주 조회되는 필드에 인덱스
@@index([authorLogin, committedAt])  // 커밋 조회
@@index([runId, userLogin])          // WorkUnit 조회
@@index([impactScore(sort: Desc)])   // 임팩트 정렬
```

### 페이지네이션

```typescript
// GitHub API는 자동 페이지네이션
const commits = await octokit.paginate(
  octokit.rest.repos.listCommits,
  { owner, repo, since, until }
);
```

### 병렬 처리

```typescript
// 여러 저장소를 병렬로 처리 (QStash Fan-out)
for (const repo of repos) {
  await qstash.publishJSON({
    url: `/api/jobs/scan-commits`,
    body: { repoFullName: repo.fullName },
    delay: random(0, 10), // rate limit 분산
  });
}
```

---

## 보안 고려사항

### 1. 세션 보안

```typescript
// iron-session: 암호화된 쿠키
sessionOptions = {
  password: SESSION_SECRET,  // 32자 이상
  cookieOptions: {
    secure: true,            // HTTPS only (프로덕션)
    httpOnly: true,          // XSS 방지
    sameSite: "lax",         // CSRF 방지
  }
}
```

### 2. GitHub Token 보안

```typescript
// AccessToken은 세션에만 저장 (암호화 필요)
// DB에 저장 시 encrypt 처리
user.accessToken = await encrypt(token);
```

### 3. API 보호

```typescript
// middleware.ts에서 전역 인증 체크
// + 각 API에서 권한 확인
if (!session.user) return 401;
if (!hasOrgAccess(session.user, orgId)) return 403;
```

### 4. Rate Limit 준수

```typescript
// GitHub API rate limit 모니터링
const rateLimit = await getRateLimit(octokit);
if (rateLimit.remaining < 100) {
  await sleep(until resetAt);
}
```

---

## 확장 포인트

### 1. 새 LLM Provider 추가

```typescript
// lib/llm/providers/gemini.ts
export class GeminiProvider implements LLMProvider {
  async generateReview(input: ReviewInput) {
    // Gemini API 호출
  }
}

// lib/llm/index.ts에 등록
case 'gemini-pro':
  return new GeminiProvider();
```

### 2. 새 차트 타입 추가

```typescript
// components/charts/heatmap-chart.tsx
export function HeatmapChart({ data }) {
  // Recharts로 히트맵 구현
}
```

### 3. 커스텀 임팩트 규칙 추가

```typescript
// lib/analysis/scoring.ts
export function customScoring(workUnit, orgSettings) {
  // 조직별 커스텀 로직
}
```

### 4. Webhook 연동

```typescript
// app/api/webhooks/github/route.ts
export async function POST(request) {
  // GitHub webhook 이벤트 처리
  // 예: push 이벤트 → 증분 분석
}
```

---

## 모니터링 및 로깅

### Job 실행 로그

```typescript
JobLog {
  runId: string
  jobType: "scan_repos" | "scan_commits" | ...
  status: "COMPLETED" | "FAILED" | ...
  input: Json      // Job 입력 파라미터
  output: Json     // Job 출력 결과
  error: string    // 오류 메시지
  retryCount: int  // 재시도 횟수
}
```

### 진행률 추적

```typescript
AnalysisRun {
  progress: {
    total: number      // 전체 작업 수
    completed: number  // 완료된 작업 수
    failed: number     // 실패한 작업 수
    phase: string      // 현재 단계
  }
}
```

### 에러 분류

- **일시적 에러**: Rate limit, Network timeout → 재시도
- **영구적 에러**: Auth, Forbidden, Not Found → 즉시 실패
- **부분 실패**: 일부 repo/user 실패 → 계속 진행

---

## 스케일링 전략

### 현재 (중규모: 5-20명, 10-50 repos)

- 동기 처리 + QStash 큐
- 단일 DB 인스턴스
- Vercel Serverless Functions

### 확장 시 (대규모: 50+ repos, 100+ 명)

1. **데이터베이스**
   - Read Replica 추가
   - 커밋 데이터 파티셔닝 (연도별)

2. **Job 처리**
   - QStash 동시성 증가
   - Batch 처리 크기 조정

3. **캐싱**
   - Redis에 WorkUnit 캐시
   - CDN으로 정적 리포트 서빙

4. **LLM 최적화**
   - 배치 API 사용 (OpenAI Batch API)
   - 로컬 LLM (작은 모델) 병행

---

## 테스트 전략

### 단위 테스트

```typescript
// lib/analysis/clustering.test.ts
describe('clusterCommits', () => {
  it('should group commits by time gap', () => {
    // ...
  });
  
  it('should split by path similarity', () => {
    // ...
  });
});
```

### 통합 테스트

```typescript
// app/api/analysis/start/route.test.ts
describe('POST /api/analysis/start', () => {
  it('should create analysis run', async () => {
    // ...
  });
});
```

### E2E 테스트

- Playwright로 주요 플로우 테스트
- Mock GitHub API 사용

---

## 배포 체크리스트

- [ ] 환경변수 모두 설정 (Vercel)
- [ ] DATABASE_URL (Vercel Postgres)
- [ ] GitHub App Callback URL 업데이트
- [ ] NEXT_PUBLIC_APP_URL 프로덕션 도메인
- [ ] Prisma 마이그레이션 실행
- [ ] Upstash QStash/Redis 설정
- [ ] LLM API Keys 유효성 확인
- [ ] 첫 분석 실행 테스트
- [ ] 에러 모니터링 설정 (Sentry 등)

