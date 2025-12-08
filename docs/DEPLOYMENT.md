# Vercel 배포 가이드

## 배포 전 준비사항

### 1. Vercel 계정 및 CLI 설치

```bash
npm i -g vercel
vercel login
```

### 2. PostgreSQL 데이터베이스 준비

**옵션 A: Vercel Postgres (권장)**
- Vercel 대시보드 → Storage → Create Database → Postgres
- 자동으로 `DATABASE_URL` 환경변수 생성됨

**옵션 B: 외부 PostgreSQL**
- Neon, Supabase, Railway 등
- 연결 문자열을 수동으로 환경변수에 추가

### 3. Upstash 계정

- [https://console.upstash.com/](https://console.upstash.com/) 가입
- QStash + Redis 생성

---

## 배포 단계

### 1. Vercel 프로젝트 연결

```bash
cd /Users/ffgg/baton.works/studiobaton.review
vercel link
```

프롬프트에 따라:
- Scope 선택 (개인 또는 팀)
- 프로젝트 이름 입력
- 루트 디렉토리 확인

### 2. 환경변수 설정

**Vercel CLI로 설정**:

```bash
# Session Secret (32자 랜덤 생성)
vercel env add SESSION_SECRET production
# 입력: (32자 이상 랜덤 문자열)

# GitHub OAuth
vercel env add GITHUB_CLIENT_ID production
vercel env add GITHUB_CLIENT_SECRET production

# GitHub App
vercel env add GITHUB_APP_ID production
vercel env add GITHUB_APP_PRIVATE_KEY production

# LLM
vercel env add OPENAI_API_KEY production
vercel env add ANTHROPIC_API_KEY production

# App URL
vercel env add NEXT_PUBLIC_APP_URL production
# 입력: https://your-domain.vercel.app
```

**또는 Vercel 대시보드에서 설정**:
- Settings → Environment Variables → Add New

### 3. 데이터베이스 마이그레이션

Vercel Postgres 사용 시:

```bash
# DATABASE_URL을 로컬에 가져오기
vercel env pull .env.production

# 프로덕션 DB로 마이그레이션
DATABASE_URL=$(grep DATABASE_URL .env.production | cut -d '=' -f2-) \
  npx prisma migrate deploy
```

### 4. 배포 실행

```bash
vercel --prod
```

---

## 배포 후 설정

### 1. GitHub App 업데이트

[https://github.com/settings/apps](https://github.com/settings/apps)에서 앱 선택 후:

- **Homepage URL**: `https://your-domain.vercel.app`
- **Callback URL**: `https://your-domain.vercel.app/api/auth/callback`
- **Webhook URL**: (비활성화 유지)

### 2. GitHub OAuth App 업데이트

[https://github.com/settings/applications](https://github.com/settings/applications)에서 앱 선택 후:

- **Homepage URL**: `https://your-domain.vercel.app`
- **Authorization callback URL**: `https://your-domain.vercel.app/api/auth/callback`

### 3. 조직에 GitHub App 설치

1. `https://github.com/apps/your-app-name/installations/new` 접속
2. 조직 선택
3. 권한 승인

### 4. 첫 분석 실행

프로덕션 사이트 접속 → 로그인 → 분석 실행

---

## 커스텀 도메인 설정

### 1. Vercel 도메인 추가

Vercel 대시보드 → Settings → Domains → Add Domain

예: `review.yourdomain.com`

### 2. DNS 설정

도메인 제공업체에서 CNAME 레코드 추가:
```
review.yourdomain.com → cname.vercel-dns.com
```

### 3. 환경변수 업데이트

```bash
vercel env add NEXT_PUBLIC_APP_URL production
# 입력: https://review.yourdomain.com
```

### 4. 재배포

```bash
vercel --prod
```

### 5. GitHub App URL 업데이트

모든 GitHub 설정의 URL을 새 도메인으로 변경

---

## 환경변수 관리

### 환경별 설정

Vercel은 3가지 환경 제공:
- **Production**: `vercel --prod`로 배포
- **Preview**: PR마다 자동 배포
- **Development**: 로컬 개발

각 환경별로 다른 값 설정 가능:

```bash
# Production only
vercel env add VAR_NAME production

# Preview + Production
vercel env add VAR_NAME preview production

# All environments
vercel env add VAR_NAME development preview production
```

### 로컬에 환경변수 가져오기

```bash
# 모든 환경의 변수를 로컬로
vercel env pull .env.local
```

---

## 모니터링

### Vercel Analytics

Vercel 대시보드 → Analytics:
- 페이지 뷰
- 성능 지표
- Web Vitals

### 로그 확인

```bash
# 실시간 로그
vercel logs --follow

# 특정 배포 로그
vercel logs [deployment-url]
```

### 에러 추적

**Sentry 연동 (권장)**:

```bash
npm install @sentry/nextjs

npx @sentry/wizard@latest -i nextjs
```

환경변수 추가:
```bash
vercel env add SENTRY_DSN production
```

---

## 성능 최적화

### 1. Edge Functions

정적 콘텐츠는 Edge에서 서빙:

```typescript
// app/page.tsx
export const runtime = 'edge';
```

### 2. 이미지 최적화

```typescript
import Image from 'next/image';

<Image
  src={user.avatarUrl}
  width={64}
  height={64}
  alt={user.name}
/>
```

### 3. Redis 캐싱

```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 캐시 확인
const cached = await redis.get(`report:${runId}:${userLogin}`);
if (cached) return cached;

// 캐시 저장 (1시간)
await redis.setex(key, 3600, data);
```

---

## CI/CD 설정

### GitHub Actions (선택)

`.github/workflows/ci.yml`:

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - run: npm run lint
```

### Vercel 자동 배포

- `main` 브랜치 푸시 → 프로덕션 배포
- PR 생성 → Preview 배포 (자동)

---

## 백업 전략

### 데이터베이스 백업

**Vercel Postgres**:
- 자동 백업 (7일 보관)
- 수동 스냅샷: Dashboard → Backups

**외부 PostgreSQL**:
```bash
# 백업
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# 복원
psql $DATABASE_URL < backup-20241208.sql
```

### 환경변수 백업

```bash
# 모든 환경변수를 파일로 저장
vercel env pull .env.backup

# 안전한 곳에 보관 (절대 Git에 커밋하지 말 것)
```

---

## 문제 해결

### 빌드 실패

```bash
# Vercel 빌드 로그 확인
vercel logs --follow

# 로컬에서 프로덕션 빌드 테스트
npm run build
```

### 데이터베이스 연결 오류

- `DATABASE_URL` 형식 확인
- SSL 모드 확인: `?sslmode=require`
- 방화벽 설정 확인 (Vercel IP 허용)

### Serverless Function Timeout

Vercel 무료 티어는 10초 제한:
- 긴 작업은 QStash Job으로 분할
- Timeout 설정:

```typescript
// app/api/route.ts
export const maxDuration = 60; // Pro 플랜만
```

---

## 보안 체크리스트

- [ ] 모든 민감 정보는 환경변수로 관리
- [ ] `.env` 파일은 `.gitignore`에 포함
- [ ] HTTPS 사용 (Vercel 자동)
- [ ] GitHub App은 읽기 전용 권한만
- [ ] Session Secret은 32자 이상
- [ ] CORS 설정 (필요 시)
- [ ] Rate Limiting 구현
- [ ] 에러 로깅 설정

---

## 프로덕션 체크리스트

배포 전 확인:

- [ ] 모든 환경변수 설정됨
- [ ] Prisma 마이그레이션 완료
- [ ] GitHub App/OAuth App URL 업데이트
- [ ] LLM API Key 유효성 확인
- [ ] Upstash QStash/Redis 연결 확인
- [ ] 로컬에서 빌드 성공
- [ ] 첫 분석 실행 테스트
- [ ] 에러 모니터링 활성화
- [ ] 백업 전략 수립

배포 후 확인:

- [ ] 프로덕션 사이트 접속 가능
- [ ] GitHub 로그인 작동
- [ ] 조직 추가 작동
- [ ] 분석 실행 작동
- [ ] 리포트 생성 확인
- [ ] 차트 렌더링 확인
