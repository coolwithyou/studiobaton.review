# GitHub 연간 코드 기여/품질 분석 시스템

Organization과 연도만 입력하면, 전체 저장소를 순회하며 **커밋 기반으로 기여도와 품질을 분석**하여 **AI 리뷰가 포함된 연간 리포트**를 생성하는 시스템입니다.

## 주요 기능

- **커밋 동기화 시스템**: 조직+연도 단위로 커밋을 사전 수집하여 분석 속도 90% 향상
- **커밋 기반 분석**: PR 리뷰 없이도 커밋 히스토리만으로 의미 있는 분석
- **Work Unit 클러스터링**: 관련 커밋을 작업 단위로 묶어 평가
- **임팩트 스코어링**: LoC 외에 핵심모듈, 핫스팟, 리스크 영역 가중치 반영
- **AI 코드 리뷰**: GPT-4o/Claude가 대표 작업을 분석하여 피드백 제공
- **PR 연결 정보**: Pull Request와 커밋 관계 추적
- **연도별 비교**: 매년 같은 기준으로 분석하여 성장 추세 추적
- **차트 시각화**: 월별 활동, 작업 유형, 저장소 기여도 등 다양한 관점 제공

## 기술 스택

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL + Prisma
- **Auth**: iron-session + GitHub OAuth
- **UI**: shadcn/ui + Tailwind CSS
- **Charts**: Recharts
- **Queue**: Upstash QStash
- **LLM**: OpenAI GPT-4o / Anthropic Claude 3.5
- **Hosting**: Vercel

## 시작하기

### 1. 환경 설정

```bash
# 저장소 클론 (이미 클론된 경우 생략)
cd /Users/ffgg/baton.works/studiobaton.review

# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env
```

`.env` 파일을 열어 다음 값들을 설정하세요:

```env
# Database (PostgreSQL)
DATABASE_URL="postgresql://user:password@localhost:5432/studiobaton_review"

# Session (최소 32자)
SESSION_SECRET="your-secure-random-secret-at-least-32-chars"

# GitHub OAuth App (https://github.com/settings/applications/new)
GITHUB_CLIENT_ID="your-client-id"
GITHUB_CLIENT_SECRET="your-client-secret"

# GitHub App (https://github.com/settings/apps/new)
GITHUB_APP_ID="your-app-id"
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"

# LLM API Keys
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."

# Upstash (https://console.upstash.com/)
QSTASH_URL="https://qstash.upstash.io"
QSTASH_TOKEN="your-token"
UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token"

# App URL
NEXT_PUBLIC_APP_URL="http://localhost:3020"
```

### 2. 데이터베이스 설정

```bash
# Prisma 마이그레이션 실행
npx prisma migrate dev --name init

# Prisma Client 생성
npx prisma generate

# (옵션) Prisma Studio로 DB 확인
npx prisma studio
```

### 3. GitHub App 생성

1. [GitHub Apps 생성 페이지](https://github.com/settings/apps/new)에서 새 앱 생성
2. 필수 권한 설정:
   - **Repository permissions**:
     - Contents: Read-only
     - Metadata: Read-only
3. Callback URL 설정:
   - `http://localhost:3020/api/auth/callback` (개발)
   - `https://your-domain.com/api/auth/callback` (프로덕션)
4. Private Key 생성 및 다운로드
5. `.env`에 App ID와 Private Key 추가

### 4. GitHub OAuth App 생성

1. [GitHub OAuth Apps 생성 페이지](https://github.com/settings/applications/new)에서 새 앱 생성
2. 설정:
   - Homepage URL: `http://localhost:3020`
   - Authorization callback URL: `http://localhost:3020/api/auth/callback`
3. Client ID와 Secret을 `.env`에 추가

### 5. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3020](http://localhost:3020) 접속

## 사용 방법

### 1단계: GitHub 로그인
- GitHub 계정으로 로그인

### 2단계: 조직 등록 및 권한 확인
- GitHub App을 조직에 설치
- 필수 권한 확인 (조직 상세 페이지 → 권한 탭)
  - Contents: Read-only (필수)
  - Metadata: Read-only (필수)
  - Pull requests: Read-only (권장)
  - Members: Read-only (필수)

### 3단계: 커밋 동기화 (신규)
- 조직 + 연도 선택
- "커밋 동기화 시작" 클릭
- 백그라운드 동기화 진행 (최초 1회)
- 동기화 완료 후 빠른 분석 가능

### 4단계: 분석 실행
- 동기화 완료된 연도 선택
- 팀원 선택
- 분석 시작 → 빠른 분석 (커밋 수집 생략)

### 5단계: 리포트 확인
- AI가 생성한 연간 리포트 확인
- 차트로 다양한 관점 분석
- 매니저 코멘트 추가
- 리포트 확정 및 PDF 다운로드

## 프로젝트 구조

```
src/
├── app/
│   ├── (dashboard)/          # 인증 필요 페이지
│   │   ├── dashboard/         # 메인 대시보드
│   │   ├── analysis/          # 분석 실행/조회
│   │   ├── organizations/     # 조직 관리
│   │   ├── reports/           # 리포트 조회
│   │   └── help/              # 도움말
│   ├── api/
│   │   ├── auth/              # 인증 API
│   │   ├── analysis/          # 분석 실행 API
│   │   └── jobs/              # 백그라운드 Job
│   └── login/                 # 로그인 페이지
├── components/
│   ├── charts/                # Recharts 차트 컴포넌트
│   ├── layout/                # Header, Footer
│   └── ui/                    # shadcn/ui 컴포넌트
├── lib/
│   ├── analysis/              # 클러스터링, 스코어링
│   ├── llm/                   # LLM 추상화 레이어
│   │   ├── providers/         # OpenAI, Claude 구현
│   │   ├── prompts.ts         # 프롬프트 템플릿
│   │   └── types.ts           # LLM 타입
│   ├── db.ts                  # Prisma 클라이언트
│   ├── github.ts              # GitHub API 래퍼
│   ├── session.ts             # iron-session 설정
│   └── errors.ts              # 에러 클래스
└── types/
    └── index.ts               # 공통 타입 정의
```

## 데이터 모델

```
Organization ─── Repository ─── Commit ─── CommitFile
     │                             │
     │                             └─── WorkUnitCommit
     │
     └─── AnalysisRun ─── WorkUnit ─── AiReview
              │              │
              │              └─── YearlyReport
              │
              └─── JobLog
```

## API 엔드포인트

### 인증
- `GET /api/auth/github` - GitHub OAuth 시작
- `GET /api/auth/callback` - OAuth 콜백
- `GET /api/auth/logout` - 로그아웃
- `GET /api/auth/session` - 세션 조회

### 분석
- `POST /api/analysis/start` - 분석 실행
- `GET /api/analysis/:runId` - 분석 상태 조회

### 백그라운드 Jobs
- `POST /api/jobs/scan-repos` - 저장소 스캔
- `POST /api/jobs/scan-commits` - 커밋 수집
- `POST /api/jobs/build-work-units` - Work Unit 생성
- `POST /api/jobs/ai-review` - AI 리뷰 생성
- `POST /api/jobs/finalize-reports` - 최종 리포트 집계

## 배포 (Vercel)

### 1. Vercel 프로젝트 연결

```bash
# Vercel CLI 설치
npm i -g vercel

# 프로젝트 연결
vercel link
```

### 2. 환경변수 설정

Vercel 대시보드에서 모든 환경변수 설정:
- `DATABASE_URL` - PostgreSQL 연결 문자열 (Vercel Postgres 권장)
- `SESSION_SECRET` - 32자 이상 랜덤 문자열
- GitHub 관련 변수들
- LLM API Keys
- Upstash 관련 변수들
- `NEXT_PUBLIC_APP_URL` - 실제 도메인 (예: `https://review.yourdomain.com`)

### 3. 배포

```bash
vercel deploy --prod
```

### 4. GitHub App Callback URL 업데이트

프로덕션 도메인으로 GitHub App/OAuth App의 Callback URL을 업데이트하세요.

## 비용 최적화

- **LLM 비용**: 샘플링으로 사용자당 10-12개 Work Unit만 리뷰 (90% 비용 절감)
- **GitHub API**: Installation token 사용으로 높은 rate limit
- **데이터베이스**: 연 단위 저장으로 적정 규모 유지
- **서버리스**: Vercel 무료 티어로 시작 가능

## 문제 해결

### Prisma 관련

```bash
# 스키마 변경 후
npx prisma migrate dev

# Client 재생성
npx prisma generate

# DB 초기화 (주의: 모든 데이터 삭제)
npx prisma migrate reset
```

### 빌드 오류

```bash
# 의존성 재설치
rm -rf node_modules package-lock.json
npm install

# Next.js 캐시 삭제
rm -rf .next
```

## 라이선스

MIT

## 기여

이슈와 PR을 환영합니다!
