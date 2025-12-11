# 커밋 동기화 시스템 가이드

## 개요

커밋 동기화 시스템은 조직+연도 단위로 모든 커밋을 사전에 수집하여 DB에 저장하고, 분석 시에는 GitHub API 호출 없이 DB에서 직접 조회하도록 개선한 시스템입니다.

## 주요 개선 사항

### 성능 개선
- **API 호출 감소**: 사용자별 분석 시 GitHub API 호출 제거 (DB 조회로 대체)
- **분석 속도 향상**: 커밋 수집 단계 건너뛰기로 분석 시간 대폭 단축
- **병렬 처리**: 여러 사용자 동시 분석 가능

### 데이터 관리
- **증분 동기화**: 기존 커밋 유지, 누락분만 추가 수집 (upsert 방식)
- **PR 정보 수집**: Pull Request와 커밋 연결 정보 저장
- **연도별 관리**: 연도별로 독립적인 동기화 작업 관리

## 사용 방법

### 1. 커밋 동기화 시작

분석 시작 페이지(`/analysis/new`)에서:

1. **조직 선택**: 분석할 조직 선택
2. **연도 선택**: 분석할 연도 선택
3. **동기화 상태 확인**: 
   - ✅ 완료: 바로 분석 가능
   - 🔄 진행 중: 동기화 완료 대기
   - ❌ 미완료: 동기화 시작 버튼 클릭

4. **동기화 시작**: "커밋 동기화 시작" 버튼 클릭

### 2. 동기화 진행 확인

동기화는 백그라운드에서 실행되며:
- 저장소별 진행 상태 실시간 표시
- 전체 진행률 표시
- 수집된 커밋 수 표시

### 3. 분석 시작

동기화 완료 후:
- 분석 대상 사용자 선택
- "분석 시작" 버튼 활성화
- 커밋 수집 없이 바로 Work Unit 생성 단계로 진행

## API 엔드포인트

### POST /api/commits/sync
커밋 동기화 시작

**Request:**
```json
{
  "orgLogin": "organization-name",
  "year": 2024
}
```

**Response:**
```json
{
  "success": true,
  "syncJobId": "clxxx...",
  "orgLogin": "organization-name",
  "year": 2024,
  "message": "Commit sync started"
}
```

### GET /api/commits/sync/[orgLogin]/[year]
동기화 상태 조회

**Response:**
```json
{
  "id": "clxxx...",
  "orgLogin": "organization-name",
  "year": 2024,
  "status": "IN_PROGRESS",
  "progress": {
    "totalRepos": 50,
    "completedRepos": 25,
    "failedRepos": 0,
    "totalCommits": 15000,
    "currentRepo": "org/repo-name",
    "repoProgress": [...]
  },
  "startedAt": "2024-01-01T00:00:00Z"
}
```

### DELETE /api/commits/sync/[orgLogin]/[year]
동기화 작업 취소/삭제

## 데이터 모델

### CommitSyncJob
```prisma
model CommitSyncJob {
  id          String      @id @default(cuid())
  orgId       String
  year        Int
  status      SyncStatus  @default(PENDING)
  progress    Json?
  error       String?
  startedAt   DateTime?
  finishedAt  DateTime?
  createdAt   DateTime    @default(now())
  
  @@unique([orgId, year])
}

enum SyncStatus {
  PENDING      // 대기 중
  IN_PROGRESS  // 진행 중
  COMPLETED    // 완료
  FAILED       // 실패
}
```

### PullRequest
```prisma
model PullRequest {
  id          String   @id @default(cuid())
  repoId      String
  number      Int
  title       String
  state       String   // open, closed, merged
  authorLogin String
  mergedAt    DateTime?
  commits     PullRequestCommit[]
  
  @@unique([repoId, number])
}
```

## 통합 테스트 시나리오

### 시나리오 1: 새 조직 첫 동기화
1. 조직 선택
2. 2024년 선택
3. 동기화 상태: 미완료
4. "커밋 동기화 시작" 클릭
5. 진행률 모니터링
6. 완료 후 사용자 선택
7. 분석 시작
8. Work Unit 생성 확인
9. 리포트 생성 확인

### 시나리오 2: 이미 동기화된 연도
1. 조직 선택
2. 동기화 완료된 연도 선택
3. 동기화 상태: 완료 ✅
4. 사용자 선택 (즉시 가능)
5. 분석 시작 (커밋 수집 건너뛰기)
6. 빠른 분석 완료 확인

### 시나리오 3: 다른 연도 추가 동기화
1. 조직 선택
2. 2025년 선택 (2024년 이미 완료)
3. 동기화 시작
4. 기존 2024년 커밋 유지 확인
5. 2025년 커밋만 추가 수집 확인

### 시나리오 4: 동기화 재시도
1. 실패한 동기화 작업 선택
2. "커밋 동기화 시작" 재클릭
3. 재시작 확인
4. 완료 확인

## 주의사항

### GitHub API Rate Limit
- 동기화는 많은 API 호출 발생
- 조직 저장소가 많을 경우 시간 소요
- Installation token 사용으로 높은 한도 (시간당 5000 요청)

### DB 용량
- 커밋 데이터 누적으로 DB 용량 증가
- 주기적인 모니터링 권장
- 오래된 연도 데이터 정리 고려

### 동기화 시점
- 연초에 전년도 데이터 동기화 권장
- 분기별 또는 월별 동기화 계획 수립
- 진행 중인 연도는 분석 직전 동기화

## 트러블슈팅

### 동기화가 실패했어요
1. 에러 메시지 확인
2. GitHub App 권한 확인
3. Rate limit 확인
4. 실패한 저장소 개별 확인
5. 재시도

### 일부 저장소가 실패했어요
- 저장소별 상태에서 실패 원인 확인
- 해당 저장소 접근 권한 확인
- 아카이브된 저장소인지 확인

### 동기화 완료 후에도 분석이 안 돼요
1. 동기화 상태가 COMPLETED인지 확인
2. 브라우저 새로고침
3. 동기화된 커밋 수 확인 (0개일 수 있음)

### 동기화가 너무 오래 걸려요
- 저장소 수와 커밋 수에 비례
- 백그라운드 실행이므로 페이지 닫아도 계속 진행
- 진행률 페이지에서 상태 확인

## 마이그레이션

기존 시스템에서 마이그레이션:

1. Prisma 마이그레이션 실행 (자동)
2. 기존 분석은 영향 없음
3. 새 분석부터 동기화 필수
4. 기존 조직 데이터 일괄 동기화 (선택)

## 성능 비교

| 항목           | 기존 방식            | 새 방식           |
| -------------- | -------------------- | ----------------- |
| 커밋 수집 시간 | 사용자당 3-5분       | 0초 (이미 수집됨) |
| API 호출       | 사용자 × 리포 × 커밋 | 최초 1회만        |
| 10명 분석      | ~50분                | ~5분 (90% 단축)   |
| 재분석         | 전체 재수집          | 즉시 가능         |
