# API 문서

## 인증 API

### GET /api/auth/github

GitHub OAuth 인증을 시작합니다.

**Response**: GitHub 인증 페이지로 리다이렉트

---

### GET /api/auth/callback

GitHub OAuth 콜백을 처리합니다.

**Query Parameters**:
- `code`: GitHub에서 발급한 인증 코드
- `error`: (선택) 에러 코드

**Response**: 성공 시 `/dashboard`로 리다이렉트

---

### GET /api/auth/logout

로그아웃 처리 (세션 파기)

**Response**: 홈페이지로 리다이렉트

---

### GET /api/auth/session

현재 세션 정보를 조회합니다.

**Response**:
```json
{
  "isLoggedIn": true,
  "user": {
    "id": "clx...",
    "login": "user1",
    "name": "홍길동",
    "email": "user@example.com",
    "avatarUrl": "https://..."
  }
}
```

---

## 분석 API

### POST /api/analysis/start

새 분석을 시작합니다.

**Request Body**:
```json
{
  "orgLogin": "studiobaton",
  "year": 2024,
  "userLogins": ["user1", "user2", "user3"],
  "options": {
    "llmModel": "gpt-4o",
    "includeArchived": false,
    "excludeRepos": ["old-repo"],
    "clusteringConfig": {
      "maxTimeGapHours": 8,
      "minPathOverlap": 0.3
    }
  }
}
```

**Response**:
```json
{
  "success": true,
  "runId": "clx...",
  "status": "queued",
  "estimatedTime": 15
}
```

**Errors**:
- `401`: Unauthorized
- `404`: Organization not found
- `409`: Analysis already exists for this year

---

### GET /api/analysis/:runId

분석 진행 상황을 조회합니다.

**Response**:
```json
{
  "runId": "clx...",
  "orgLogin": "studiobaton",
  "year": 2024,
  "status": "SCANNING_COMMITS",
  "progress": {
    "phase": "SCANNING_COMMITS",
    "total": 12,
    "completed": 5,
    "failed": 0,
    "percentage": 42
  },
  "targetUsers": ["user1", "user2"],
  "workUnitCount": 48,
  "reportCount": 0,
  "startedAt": "2024-12-08T12:00:00Z",
  "estimatedCompletion": "2024-12-08T12:15:00Z"
}
```

**Status 값**:
- `QUEUED`: 대기 중
- `SCANNING_REPOS`: 저장소 스캔
- `SCANNING_COMMITS`: 커밋 수집
- `BUILDING_UNITS`: Work Unit 생성
- `REVIEWING`: AI 리뷰
- `FINALIZING`: 리포트 생성
- `DONE`: 완료
- `FAILED`: 실패

---

## Background Job API

### POST /api/jobs/scan-repos

조직의 저장소 목록을 스캔하고 DB에 저장합니다.

**Request Body**:
```json
{
  "runId": "clx...",
  "orgLogin": "studiobaton",
  "installationId": 12345
}
```

**Response**:
```json
{
  "success": true,
  "repoCount": 12
}
```

---

### POST /api/jobs/scan-commits

특정 저장소의 커밋을 수집합니다.

**Request Body**:
```json
{
  "runId": "clx...",
  "repoFullName": "studiobaton/frontend",
  "installationId": 12345,
  "year": 2024
}
```

**Response**:
```json
{
  "success": true,
  "totalCommits": 234,
  "savedCommits": 234
}
```

---

### POST /api/jobs/build-work-units

수집된 커밋을 Work Unit으로 클러스터링합니다.

**Request Body**:
```json
{
  "runId": "clx..."
}
```

**Response**:
```json
{
  "success": true,
  "totalWorkUnits": 48
}
```

---

### POST /api/jobs/ai-review

샘플링된 Work Unit에 대해 AI 리뷰를 생성합니다.

**Request Body**:
```json
{
  "runId": "clx..."
}
```

**Response**:
```json
{
  "success": true,
  "reviewedCount": 12,
  "failedCount": 0
}
```

---

### POST /api/jobs/finalize-reports

사용자별 연간 리포트를 최종 생성합니다.

**Request Body**:
```json
{
  "runId": "clx..."
}
```

**Response**:
```json
{
  "success": true,
  "reportCount": 3
}
```

---

## 데이터 타입

### ReviewResult

```typescript
interface ReviewResult {
  summary: string;              // 1-2문장 작업 요약
  workType: WorkType;           // feature | bugfix | refactor | chore | docs | test
  complexity: Complexity;       // low | medium | high
  strengths: string[];          // 강점 (최대 3개)
  risks: string[];              // 리스크 (최대 3개)
  suggestions: string[];        // 개선 제안 (최대 3개)
  learningPoints: string[];     // 학습 포인트 (최대 2개)
  confidence: number;           // 0-1 신뢰도
}
```

### ReportStats

```typescript
interface ReportStats {
  totalCommits: number;
  totalWorkUnits: number;
  totalAdditions: number;
  totalDeletions: number;
  avgImpactScore: number;
  topRepos: {
    name: string;
    commits: number;
    percentage: number;
  }[];
  workTypeDistribution: Record<WorkType, number>;
  monthlyActivity: {
    month: number;
    commits: number;
    workUnits: number;
  }[];
}
```

### ImpactFactors

```typescript
interface ImpactFactors {
  baseScore: number;
  coreModuleBonus: number;
  hotspotBonus: number;
  testPenalty: number;
  configBonus: number;
  sizeScore: number;
}
```

---

## 에러 코드

| 코드 | HTTP | 설명 |
|------|------|------|
| `AUTH_ERROR` | 401 | 인증 필요 |
| `FORBIDDEN` | 403 | 권한 없음 |
| `NOT_FOUND` | 404 | 리소스 없음 |
| `VALIDATION_ERROR` | 400 | 유효성 검증 실패 |
| `RATE_LIMIT` | 429 | Rate limit 초과 |
| `GITHUB_ERROR` | 502 | GitHub API 오류 |
| `LLM_ERROR` | 502 | LLM API 오류 |
| `INTERNAL_ERROR` | 500 | 서버 오류 |

---

## Rate Limiting

### GitHub API

- **Personal Access Token**: 5,000 requests/hour
- **GitHub App**: 15,000 requests/hour (권장)
- **Secondary rate limit**: 동시 요청 제한

**전략**:
- Installation token 사용
- 저장소별 지연 추가 (0-10초 랜덤)
- Rate limit 모니터링 및 대기

### LLM API

**OpenAI**:
- GPT-4o: 500 requests/min (Tier 1)
- 토큰 제한 고려

**Anthropic**:
- Claude 3.5: 50 requests/min (Tier 1)

**전략**:
- 샘플링으로 요청 수 최소화
- 배치 처리
- 오류 시 재시도

---

## Webhook 설정 (향후)

### GitHub Webhook

```typescript
// app/api/webhooks/github/route.ts
export async function POST(request) {
  const signature = request.headers.get("x-hub-signature-256");
  const payload = await request.json();
  
  // 서명 검증
  verifySignature(signature, payload);
  
  // 이벤트 처리
  if (payload.action === "push") {
    // 증분 분석 트리거
  }
}
```

**이벤트 타입**:
- `push`: 새 커밋 → 증분 수집
- `repository`: Repo 추가/삭제 → 목록 갱신
- `installation`: App 설치/제거 → Organization 상태 업데이트

---

## 유용한 쿼리 예제

### 특정 사용자의 연도별 리포트 조회

```typescript
const reports = await db.yearlyReport.findMany({
  where: { userLogin: "user1" },
  orderBy: { year: "desc" },
  include: { run: { include: { org: true } } },
});
```

### 조직의 최근 분석 실행 조회

```typescript
const runs = await db.analysisRun.findMany({
  where: { orgId },
  orderBy: { createdAt: "desc" },
  take: 10,
  include: {
    _count: {
      select: { workUnits: true, reports: true },
    },
  },
});
```

### 임팩트 상위 Work Unit 조회

```typescript
const topWorkUnits = await db.workUnit.findMany({
  where: { runId, userLogin },
  orderBy: { impactScore: "desc" },
  take: 10,
  include: {
    repo: true,
    aiReview: true,
    commits: {
      include: { commit: true },
      orderBy: { order: "asc" },
    },
  },
});
```

### AI 리뷰 실패 케이스 조회

```typescript
const failedReviews = await db.workUnit.findMany({
  where: {
    runId,
    isSampled: true,
    aiReview: null,
  },
});
```

