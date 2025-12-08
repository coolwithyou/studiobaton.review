# 설치 및 설정 가이드

## 목차

1. [사전 준비](#사전-준비)
2. [GitHub App 생성](#github-app-생성)
3. [GitHub OAuth App 생성](#github-oauth-app-생성)
4. [데이터베이스 설정](#데이터베이스-설정)
5. [환경변수 설정](#환경변수-설정)
6. [Upstash 설정](#upstash-설정)
7. [로컬 실행](#로컬-실행)
8. [Vercel 배포](#vercel-배포)

---

## 사전 준비

다음 항목들이 필요합니다:

- Node.js 18+ 
- PostgreSQL 데이터베이스
- GitHub 계정
- OpenAI API Key (또는 Anthropic API Key)
- Upstash 계정 (QStash + Redis)

---

## GitHub App 생성

### 1. 앱 생성 페이지 접속

[https://github.com/settings/apps/new](https://github.com/settings/apps/new)

### 2. 기본 정보 입력

- **GitHub App name**: `Code Review` (또는 원하는 이름)
- **Homepage URL**: `http://localhost:3020` (개발) / `https://your-domain.com` (프로덕션)
- **Callback URL**: `http://localhost:3020/api/auth/callback`
- **Webhook**: 비활성화 (Webhook URL 삭제)

### 3. 권한 설정

**Repository permissions**:
- **Contents**: Read-only (필수)
- **Metadata**: Read-only (필수)

### 4. Where can this GitHub App be installed?
- **Any account** 선택

### 5. 앱 생성 후

1. **App ID** 복사 → `.env`의 `GITHUB_APP_ID`에 저장
2. **Generate a private key** 클릭 → `.pem` 파일 다운로드
3. `.pem` 파일 내용 복사 → `.env`의 `GITHUB_APP_PRIVATE_KEY`에 저장 (줄바꿈은 `\n`으로)

```bash
# Private Key 형식 예시
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n...\n-----END RSA PRIVATE KEY-----"
```

---

## GitHub OAuth App 생성

### 1. OAuth App 생성 페이지 접속

[https://github.com/settings/applications/new](https://github.com/settings/applications/new)

### 2. 정보 입력

- **Application name**: `Code Review Login`
- **Homepage URL**: `http://localhost:3020`
- **Authorization callback URL**: `http://localhost:3020/api/auth/callback`

### 3. 생성 후

1. **Client ID** 복사 → `.env`의 `GITHUB_CLIENT_ID`
2. **Generate a new client secret** 클릭
3. **Client Secret** 복사 → `.env`의 `GITHUB_CLIENT_SECRET`

---

## 데이터베이스 설정

### 로컬 PostgreSQL (macOS)

```bash
# Homebrew로 PostgreSQL 설치
brew install postgresql@16
brew services start postgresql@16

# 데이터베이스 생성
createdb studiobaton_review

# 연결 문자열
DATABASE_URL="postgresql://$(whoami)@localhost:5432/studiobaton_review"
```

### Docker로 PostgreSQL

```bash
docker run -d \
  --name postgres-review \
  -e POSTGRES_DB=studiobaton_review \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=password123 \
  -p 5432:5432 \
  postgres:16

# 연결 문자열
DATABASE_URL="postgresql://admin:password123@localhost:5432/studiobaton_review"
```

### Vercel Postgres (프로덕션)

1. Vercel 대시보드 → Storage → Create Database → Postgres
2. 자동 생성된 `DATABASE_URL` 환경변수 사용

---

## 환경변수 설정

`.env.example`을 `.env`로 복사하고 모든 값을 채우세요:

```bash
cp .env.example .env
```

### 필수 환경변수

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 | `postgresql://...` |
| `SESSION_SECRET` | 세션 암호화 키 (32자+) | `your-random-32-char-secret...` |
| `GITHUB_CLIENT_ID` | OAuth App Client ID | `Iv1.abc123...` |
| `GITHUB_CLIENT_SECRET` | OAuth App Secret | `abc123...` |
| `GITHUB_APP_ID` | GitHub App ID | `123456` |
| `GITHUB_APP_PRIVATE_KEY` | App Private Key | `-----BEGIN RSA...` |
| `OPENAI_API_KEY` | OpenAI API Key | `sk-...` |
| `NEXT_PUBLIC_APP_URL` | 앱 URL | `http://localhost:3020` |

### 선택 환경변수

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `ANTHROPIC_API_KEY` | Claude API Key | - |
| `QSTASH_TOKEN` | QStash Token | - |
| `UPSTASH_REDIS_REST_URL` | Redis URL | - |

---

## Upstash 설정

### QStash (백그라운드 Job 처리)

1. [https://console.upstash.com/](https://console.upstash.com/) 접속
2. **QStash** 탭 → API Keys 복사
3. `.env`에 추가:

```env
QSTASH_URL="https://qstash.upstash.io"
QSTASH_TOKEN="your-token"
QSTASH_CURRENT_SIGNING_KEY="your-current-key"
QSTASH_NEXT_SIGNING_KEY="your-next-key"
```

### Redis (캐시 및 진행률 저장)

1. Upstash Console → **Redis** 탭
2. Create Database → Region 선택
3. REST API 정보 복사:

```env
UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token"
```

---

## 로컬 실행

```bash
# 개발 모드 (포트 3020)
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 실행
npm start
```

---

## Vercel 배포

### 1. Vercel 프로젝트 생성

```bash
# Vercel CLI 설치
npm i -g vercel

# 로그인
vercel login

# 프로젝트 연결
vercel link
```

### 2. 환경변수 설정

Vercel 대시보드 → Settings → Environment Variables에서 모든 `.env` 변수 추가

**중요**: `NEXT_PUBLIC_APP_URL`을 실제 도메인으로 변경:

```
NEXT_PUBLIC_APP_URL=https://review.yourdomain.com
```

### 3. 배포

```bash
# 프로덕션 배포
vercel --prod
```

### 4. GitHub App Callback URL 업데이트

GitHub App/OAuth App 설정에서 프로덕션 도메인 추가:
- `https://review.yourdomain.com/api/auth/callback`

---

## 첫 사용 가이드

### 1. 로그인
- 홈페이지 → "GitHub로 시작하기" 클릭
- GitHub 권한 승인

### 2. 조직 추가
- 대시보드 → "조직" → "조직 추가"
- GitHub App 설치 페이지로 이동
- 조직 선택 및 설치 승인

### 3. 첫 분석 실행
- 대시보드 → "새 분석 실행"
- 조직: 방금 설치한 조직 선택
- 연도: 현재 연도 선택
- 대상 사용자: 팀원 선택
- "분석 시작" 클릭

### 4. 진행률 확인
- 실시간으로 진행률 표시
- 저장소별 상태 확인
- 완료 시 리포트 자동 생성

### 5. 리포트 확인
- 팀원별 연간 리포트 조회
- 차트로 다양한 관점 확인
- AI 리뷰 상세 보기
- 매니저 코멘트 추가
- 리포트 확정

---

## 문제 해결

### "GitHub App not installed" 오류
→ 조직에 GitHub App을 설치했는지 확인

### "Rate limit exceeded" 오류
→ GitHub API rate limit 초과. 1시간 후 재시도

### Prisma 연결 오류
→ `DATABASE_URL`이 올바른지 확인. PostgreSQL이 실행 중인지 확인

### LLM API 오류
→ API Key가 유효한지 확인. 크레딧이 충분한지 확인

---

## 고급 설정

### 조직별 핵심 모듈 경로 설정

조직 설정에서 핵심 모듈 경로와 가중치를 커스터마이징할 수 있습니다:

```json
{
  "criticalPaths": [
    { "pattern": "src/auth", "weight": 2.5 },
    { "pattern": "src/payment", "weight": 3.0 },
    { "pattern": "src/core", "weight": 2.0 }
  ],
  "teamStandards": "팀 코딩 컨벤션 문서..."
}
```

### 클러스터링 설정

분석 실행 시 고급 옵션에서 조정 가능:

- **maxTimeGapHours**: 커밋 묶음 시간 간격 (기본: 8시간)
- **minPathOverlap**: 최소 경로 겹침 비율 (기본: 0.3)
- **maxCommitsPerUnit**: Work Unit당 최대 커밋 수 (기본: 50)

---

## 지원

- [도움말 페이지](http://localhost:3020/help)
- [GitHub Issues](https://github.com/your-org/repo/issues)

