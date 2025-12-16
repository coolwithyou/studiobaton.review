# 업무 일지 AI 분석 프롬프트 예시

이 문서는 업무 일지 AI 분석 시스템에서 사용하는 실제 프롬프트 예시를 담고 있습니다.

## 목차

1. [Stage 1: 주요 커밋 선별](#stage-1-주요-커밋-선별)
2. [Stage 2: 코드 리뷰](#stage-2-코드-리뷰)
3. [Stage 3-1: 주간 종합 분석](#stage-3-1-주간-종합-분석)
4. [Stage 3-2: 월간 종합 분석](#stage-3-2-월간-종합-분석)

---

## Stage 1: 주요 커밋 선별

### 시스템 메시지

```
당신은 소프트웨어 개발 활동을 분석하는 전문가입니다. 
커밋 내역을 바탕으로 중요한 커밋을 선별합니다.
```

### 사용자 프롬프트 (예시)

```
다음은 개발자의 주간 커밋 목록입니다.
총 37개의 커밋 중에서 가장 중요한 5개의 커밋을 선별해주세요.

선별 기준:
1. 기능 추가/개선의 중요도
2. 코드 변경 규모 (additions + deletions)
3. 핵심 모듈/파일 변경 여부
4. 버그 수정의 중요도

커밋 목록:
1. [frontend] Implement user authentication flow (+245/-32) - SHA:a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
2. [backend] Add JWT token validation middleware (+89/-12) - SHA:b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1
3. [frontend] Update button styles (+15/-8) - SHA:c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2
4. [backend] Fix user profile update bug (+42/-15) - SHA:d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3
5. [frontend] Refactor authentication components (+128/-95) - SHA:e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4
6. [docs] Update README.md (+8/-3) - SHA:f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5
7. [backend] Implement password reset API (+156/-23) - SHA:g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
8. [frontend] Add loading states to forms (+45/-12) - SHA:h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7
9. [backend] Optimize database queries (+67/-89) - SHA:i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8
10. [frontend] Fix mobile responsive issues (+34/-28) - SHA:j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9
... (총 37개)

JSON 형식으로 응답:
{
  "keyCommits": [
    {
      "sha": "커밋의 전체 SHA 값 (위 목록에서 SHA: 뒤의 값 그대로 복사)",
      "reason": "선별 이유 (1-2문장)",
      "score": 0-100 중요도 점수
    }
  ]
}

반드시 유효한 JSON 형식으로만 응답하세요.
```

### LLM 응답 예시

```json
{
  "keyCommits": [
    {
      "sha": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0",
      "reason": "사용자 인증 플로우는 애플리케이션의 핵심 보안 기능이며, 가장 큰 코드 변경량(+245/-32)을 가지고 있습니다.",
      "score": 95
    },
    {
      "sha": "g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
      "reason": "비밀번호 재설정 API는 중요한 보안 기능으로, 상당한 코드 변경(+156/-23)이 포함되어 있습니다.",
      "score": 88
    },
    {
      "sha": "e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4",
      "reason": "인증 컴포넌트 리팩토링은 코드 품질 개선과 유지보수성 향상을 위한 중요한 작업입니다(+128/-95).",
      "score": 82
    },
    {
      "sha": "b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1",
      "reason": "JWT 토큰 검증 미들웨어는 인증 시스템의 핵심 보안 요소입니다.",
      "score": 85
    },
    {
      "sha": "i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8",
      "reason": "데이터베이스 쿼리 최적화는 성능 향상에 직접적인 영향을 미치는 중요한 개선 작업입니다.",
      "score": 78
    }
  ]
}
```

**설정**:
- Model: `gpt-4o`
- Temperature: `0.3`
- Max Tokens: `1000`
- Response Format: `json_object`

---

## Stage 2: 코드 리뷰

### 시스템 메시지

```
당신은 코드 리뷰 전문가입니다. 
커밋의 변경사항을 분석하여 기술적 품질, 임팩트, 리스크를 평가합니다.
```

### 사용자 프롬프트 (예시)

```
다음 커밋의 코드 변경사항을 리뷰해주세요.

커밋: Implement user authentication flow
리포지터리: studiobaton/review-app
변경 통계: +245/-32

변경된 파일들과 diff:

파일: src/components/auth/LoginForm.tsx
상태: added
변경: +89/-0

```diff
+import { useState } from 'react';
+import { signIn } from '@/lib/auth';
+import { Button } from '@/components/ui/button';
+import { Input } from '@/components/ui/input';
+
+export function LoginForm() {
+  const [email, setEmail] = useState('');
+  const [password, setPassword] = useState('');
+  const [loading, setLoading] = useState(false);
+  const [error, setError] = useState('');
+
+  const handleSubmit = async (e: React.FormEvent) => {
+    e.preventDefault();
+    setLoading(true);
+    setError('');
+
+    try {
+      await signIn({ email, password });
+      // Redirect to dashboard
+      window.location.href = '/dashboard';
+    } catch (err) {
+      setError(err instanceof Error ? err.message : 'Login failed');
+    } finally {
+      setLoading(false);
+    }
+  };
+
+  return (
+    <form onSubmit={handleSubmit} className="space-y-4">
+      <Input
+        type="email"
+        value={email}
+        onChange={(e) => setEmail(e.target.value)}
+        placeholder="Email"
+        required
+      />
+      <Input
+        type="password"
+        value={password}
+        onChange={(e) => setPassword(e.target.value)}
+        placeholder="Password"
+        required
+      />
+      {error && <p className="text-red-500">{error}</p>}
+      <Button type="submit" disabled={loading}>
+        {loading ? 'Signing in...' : 'Sign In'}
+      </Button>
+    </form>
+  );
+}
```

파일: src/lib/auth.ts
상태: added
변경: +67/-0

```diff
+import { hash, compare } from 'bcrypt';
+import { sign, verify } from 'jsonwebtoken';
+
+const JWT_SECRET = process.env.JWT_SECRET!;
+const SALT_ROUNDS = 10;
+
+interface SignInParams {
+  email: string;
+  password: string;
+}
+
+interface TokenPayload {
+  userId: string;
+  email: string;
+}
+
+export async function hashPassword(password: string): Promise<string> {
+  return hash(password, SALT_ROUNDS);
+}
+
+export async function verifyPassword(
+  password: string,
+  hashedPassword: string
+): Promise<boolean> {
+  return compare(password, hashedPassword);
+}
+
+export async function signIn({ email, password }: SignInParams) {
+  // DB에서 사용자 조회
+  const user = await db.user.findUnique({ where: { email } });
+  
+  if (!user || !(await verifyPassword(password, user.password))) {
+    throw new Error('Invalid credentials');
+  }
+
+  // JWT 토큰 생성
+  const token = sign(
+    { userId: user.id, email: user.email },
+    JWT_SECRET,
+    { expiresIn: '7d' }
+  );
+
+  return { token, user };
+}
+
+export function verifyToken(token: string): TokenPayload {
+  return verify(token, JWT_SECRET) as TokenPayload;
+}
```

파일: src/middleware.ts
상태: modified
변경: +45/-20

```diff
 import { NextResponse } from 'next/server';
 import type { NextRequest } from 'next/server';
+import { verifyToken } from '@/lib/auth';
 
 export function middleware(request: NextRequest) {
-  // 기존 로직...
+  const token = request.cookies.get('auth-token')?.value;
+
+  // 보호된 경로
+  const protectedPaths = ['/dashboard', '/settings', '/profile'];
+  const isProtectedPath = protectedPaths.some(path => 
+    request.nextUrl.pathname.startsWith(path)
+  );
+
+  if (isProtectedPath) {
+    if (!token) {
+      return NextResponse.redirect(new URL('/login', request.url));
+    }
+
+    try {
+      verifyToken(token);
+    } catch (error) {
+      return NextResponse.redirect(new URL('/login', request.url));
+    }
+  }
+
   return NextResponse.next();
 }
```

... (총 7개 파일)

다음 관점에서 분석해주세요:
1. 기술적 품질 (high/medium/low)
2. 복잡도 (high/medium/low)
3. 비즈니스/기술적 임팩트
4. 잠재적 리스크
5. 배운 점/인사이트

JSON 형식으로 응답:
{
  "summary": "커밋 요약 (2-3문장)",
  "technicalQuality": "high" | "medium" | "low",
  "complexity": "high" | "medium" | "low",
  "impact": ["임팩트 1", "임팩트 2"],
  "risks": ["리스크 1", "리스크 2"],
  "learnings": ["배운점 1", "배운점 2"],
  "filesAnalyzed": [
    {
      "path": "파일 경로",
      "changes": 변경 라인 수,
      "insight": "파일별 인사이트"
    }
  ]
}

반드시 유효한 JSON 형식으로만 응답하세요.
```

### LLM 응답 예시

```json
{
  "summary": "사용자 인증 시스템의 완전한 구현으로, 로그인 폼 컴포넌트, JWT 기반 인증 라이브러리, 그리고 미들웨어 보호 로직을 포함합니다. bcrypt를 사용한 안전한 비밀번호 해싱과 JWT를 통한 세션 관리가 적용되었습니다.",
  "technicalQuality": "high",
  "complexity": "medium",
  "impact": [
    "애플리케이션의 핵심 보안 기능 추가",
    "사용자 인증 및 권한 관리 시스템 구축",
    "보호된 경로에 대한 접근 제어 구현",
    "7일간 유효한 JWT 토큰으로 사용자 경험 개선"
  ],
  "risks": [
    "JWT_SECRET이 환경 변수로만 관리되므로 노출 시 보안 위험",
    "에러 메시지가 너무 구체적일 경우 공격자에게 정보 제공 가능성",
    "window.location.href를 사용한 하드 리다이렉트는 SPA의 상태를 잃을 수 있음"
  ],
  "learnings": [
    "bcrypt를 사용한 안전한 비밀번호 해싱 구현 방법",
    "JWT 토큰 기반 인증 시스템의 전체 플로우",
    "Next.js 미들웨어를 활용한 경로 보호 패턴",
    "React 상태 관리를 통한 폼 입력 및 로딩 상태 처리"
  ],
  "filesAnalyzed": [
    {
      "path": "src/components/auth/LoginForm.tsx",
      "changes": 89,
      "insight": "React 훅을 활용한 깔끔한 폼 컴포넌트 구현. 에러 핸들링과 로딩 상태 관리가 잘 되어 있음."
    },
    {
      "path": "src/lib/auth.ts",
      "changes": 67,
      "insight": "bcrypt와 JWT를 활용한 표준적인 인증 라이브러리 구현. 타입 안정성도 확보됨."
    },
    {
      "path": "src/middleware.ts",
      "changes": 65,
      "insight": "보호된 경로에 대한 토큰 검증 로직 추가. 인증 실패 시 적절한 리다이렉션 처리."
    }
  ]
}
```

**설정**:
- Model: `gpt-4o`
- Temperature: `0.3`
- Max Tokens: `1500`
- Response Format: `json_object`

---

## Stage 3-1: 주간 종합 분석

### 시스템 메시지

```
당신은 개발 활동 분석 전문가입니다. 
주간 업무를 종합하여 명확하고 통찰력 있는 분석을 제공합니다.
```

### 사용자 프롬프트 (예시)

```
다음은 이번 주의 주요 커밋 분석 결과입니다.

선별된 주요 커밋 (5개):
- Implement user authentication flow (사용자 인증 플로우는 애플리케이션의 핵심 보안 기능이며, 가장 큰 코드 변경량을 가지고 있습니다.)
- Implement password reset API (비밀번호 재설정 API는 중요한 보안 기능으로, 상당한 코드 변경이 포함되어 있습니다.)
- Refactor authentication components (인증 컴포넌트 리팩토링은 코드 품질 개선과 유지보수성 향상을 위한 중요한 작업입니다.)
- Add JWT token validation middleware (JWT 토큰 검증 미들웨어는 인증 시스템의 핵심 보안 요소입니다.)
- Optimize database queries (데이터베이스 쿼리 최적화는 성능 향상에 직접적인 영향을 미치는 중요한 개선 작업입니다.)

코드 리뷰 결과:

커밋: Implement user authentication flow
요약: 사용자 인증 시스템의 완전한 구현으로, 로그인 폼 컴포넌트, JWT 기반 인증 라이브러리, 그리고 미들웨어 보호 로직을 포함합니다.
기술 품질: high
임팩트: 애플리케이션의 핵심 보안 기능 추가, 사용자 인증 및 권한 관리 시스템 구축, 보호된 경로에 대한 접근 제어 구현

커밋: Implement password reset API
요약: 이메일 기반 비밀번호 재설정 기능을 구현했으며, 토큰 생성 및 검증 로직이 포함되어 있습니다.
기술 품질: high
임팩트: 사용자 계정 복구 기능 추가, 보안 토큰을 통한 안전한 비밀번호 재설정

커밋: Refactor authentication components
요약: 인증 관련 컴포넌트를 재사용 가능한 구조로 리팩토링하고, 공통 로직을 커스텀 훅으로 분리했습니다.
기술 품질: high
임팩트: 코드 중복 제거, 유지보수성 향상, 향후 기능 확장 용이

커밋: Add JWT token validation middleware
요약: Next.js 미들웨어에 JWT 토큰 검증 로직을 추가하여 보호된 경로에 대한 접근을 제어합니다.
기술 품질: medium
임팩트: API 보안 강화, 인증되지 않은 접근 차단

커밋: Optimize database queries
요약: N+1 쿼리 문제를 해결하고 인덱스를 추가하여 데이터베이스 성능을 개선했습니다.
기술 품질: high
임팩트: 페이지 로딩 속도 30% 향상, 데이터베이스 부하 감소

위 정보를 바탕으로 주간 업무를 종합 분석해주세요:
1. 전체 요약 (3-4문장)
2. 주요 활동 목록 (3-5개)
3. 작업 패턴 (집중형/분산형/유지보수형 등)
4. 기술적 하이라이트 (2-3개)
5. 인사이트/개선점 (2-3개)

JSON 형식으로 응답:
{
  "summary": "주간 업무 종합 요약",
  "keyActivities": ["활동 1", "활동 2", "활동 3"],
  "workPattern": "작업 패턴 설명",
  "technicalHighlights": ["하이라이트 1", "하이라이트 2"],
  "insights": ["인사이트 1", "인사이트 2"]
}

반드시 유효한 JSON 형식으로만 응답하세요.
```

### LLM 응답 예시

```json
{
  "summary": "이번 주는 사용자 인증 시스템 구축에 집중한 한 주였습니다. JWT 기반의 완전한 인증 플로우를 구현했으며, 로그인, 비밀번호 재설정, 경로 보호 등 핵심 보안 기능을 완성했습니다. 코드 품질 향상을 위한 리팩토링과 성능 최적화도 함께 진행하여 안정적이고 효율적인 시스템을 구축했습니다.",
  "keyActivities": [
    "JWT 기반 사용자 인증 시스템 구현 (로그인, 토큰 관리, 미들웨어)",
    "비밀번호 재설정 API 개발 (이메일 토큰 기반)",
    "인증 컴포넌트 리팩토링 및 커스텀 훅 분리",
    "데이터베이스 쿼리 최적화 (N+1 문제 해결, 인덱스 추가)",
    "보호된 경로에 대한 접근 제어 구현"
  ],
  "workPattern": "집중형 개발 패턴을 보였습니다. 인증 시스템이라는 하나의 큰 기능에 집중하여 관련된 프론트엔드, 백엔드, 미들웨어를 모두 구현했습니다. 기능 구현과 동시에 코드 품질 개선(리팩토링)과 성능 최적화를 병행하여 완성도 높은 결과물을 만들었습니다.",
  "technicalHighlights": [
    "bcrypt + JWT를 활용한 엔터프라이즈급 인증 시스템 구축: 안전한 비밀번호 해싱, 토큰 기반 세션 관리, 미들웨어 보호 로직이 모두 구현됨",
    "React 커스텀 훅 패턴을 활용한 코드 재사용성 향상: 인증 관련 로직을 추상화하여 여러 컴포넌트에서 활용 가능하도록 개선",
    "데이터베이스 성능 최적화로 30% 속도 향상: 실질적인 사용자 경험 개선 달성"
  ],
  "insights": [
    "보안 기능 구현 시 처음부터 전체 플로우를 고려한 설계가 중요함을 확인했습니다. 로그인, 토큰 검증, 경로 보호를 일관된 아키텍처로 구현하여 유지보수가 용이해졌습니다.",
    "기능 개발과 리팩토링을 함께 진행하는 것이 효율적입니다. 새로운 기능을 추가하면서 동시에 코드 구조를 개선하여 기술 부채를 줄였습니다.",
    "성능 최적화는 측정 가능한 지표(30% 향상)와 함께 진행하는 것이 중요합니다. 개선 효과를 명확히 파악할 수 있었습니다."
  ]
}
```

**설정**:
- Model: `gpt-4o`
- Temperature: `0.3`
- Max Tokens: `1500`
- Response Format: `json_object`

---

## Stage 3-2: 월간 종합 분석

### 시스템 메시지

```
당신은 개발 활동 분석 전문가입니다. 
월간 업무를 종합하여 성과와 성장을 분석하고 권장사항을 제공합니다.
```

### 사용자 프롬프트 (예시)

```
다음은 이번 달의 주차별 분석 결과입니다.

=== 1주차 ===
요약: 사용자 인증 시스템 구축에 집중한 한 주였습니다. JWT 기반의 완전한 인증 플로우를 구현했으며, 로그인, 비밀번호 재설정, 경로 보호 등 핵심 보안 기능을 완성했습니다.
주요 활동: JWT 기반 사용자 인증 시스템 구현, 비밀번호 재설정 API 개발, 인증 컴포넌트 리팩토링
패턴: 집중형

=== 2주차 ===
요약: 사용자 프로필 관리 기능을 구현했습니다. 프로필 편집, 아바타 업로드, 설정 관리 등 사용자 개인화 기능을 추가했으며, 이미지 처리 및 저장 로직을 최적화했습니다.
주요 활동: 프로필 편집 페이지 구현, 이미지 업로드 및 리사이징, 사용자 설정 관리 API
패턴: 집중형

=== 3주차 ===
요약: 실시간 알림 시스템을 구축했습니다. WebSocket을 활용한 실시간 통신 인프라를 구축하고, 알림 UI 컴포넌트와 백엔드 이벤트 처리 로직을 구현했습니다.
주요 활동: WebSocket 서버 구축, 실시간 알림 UI 구현, 이벤트 발행/구독 시스템 설계
패턴: 집중형

=== 4주차 ===
요약: 종합적인 테스트 및 버그 수정 주간이었습니다. 단위 테스트, 통합 테스트 작성과 함께 사용자 피드백을 바탕으로 UI/UX 개선 작업을 진행했습니다.
주요 활동: Jest/Testing Library 테스트 작성, 버그 수정, UI 접근성 개선
패턴: 유지보수형

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

반드시 유효한 JSON 형식으로만 응답하세요.
```

### LLM 응답 예시

```json
{
  "summary": "이번 달은 사용자 중심 기능 개발에 집중한 한 달이었습니다. 인증 시스템 구축부터 시작하여 프로필 관리, 실시간 알림까지 사용자 경험을 향상시키는 핵심 기능들을 순차적으로 완성했습니다. 각 주차마다 하나의 큰 기능에 집중하는 '집중형' 개발 패턴을 유지했으며, 마지막 주차에는 테스트 및 품질 개선에 시간을 할애했습니다. 기능 구현뿐만 아니라 성능 최적화와 테스트 커버리지 확보를 통해 안정적인 서비스 기반을 마련했습니다.",
  "weeklyBreakdown": [
    {
      "week": 1,
      "summary": "JWT 기반 인증 시스템 완성. 로그인, 비밀번호 재설정, 경로 보호 등 보안 기능 구축.",
      "keyActivity": "사용자 인증 시스템 구현"
    },
    {
      "week": 2,
      "summary": "사용자 프로필 관리 기능 추가. 프로필 편집, 아바타 업로드, 설정 관리 완성.",
      "keyActivity": "프로필 관리 기능 구현"
    },
    {
      "week": 3,
      "summary": "WebSocket 기반 실시간 알림 시스템 구축. 실시간 통신 인프라 및 UI 완성.",
      "keyActivity": "실시간 알림 시스템 구현"
    },
    {
      "week": 4,
      "summary": "테스트 작성 및 버그 수정. 단위/통합 테스트와 UI/UX 접근성 개선.",
      "keyActivity": "품질 개선 및 테스트"
    }
  ],
  "overallPattern": "이번 달은 '스프린트형 집중 개발' 패턴을 보였습니다. 각 주차마다 하나의 주요 기능(인증 → 프로필 → 알림 → 테스트)에 집중하여 완성도 높은 결과물을 만들어냈습니다. 3주간 기능 개발 후 1주간 품질 개선이라는 균형잡힌 리듬이 돋보입니다. 프론트엔드와 백엔드를 동시에 개발하는 풀스택 개발 방식을 취했으며, 각 기능을 완전히 완성한 후 다음 기능으로 넘어가는 체계적인 접근을 유지했습니다.",
  "achievements": [
    "엔터프라이즈급 사용자 관리 시스템 완성: 인증, 프로필, 알림을 포함한 완전한 사용자 경험 제공",
    "WebSocket 기반 실시간 통신 인프라 구축: 확장 가능한 이벤트 기반 아키텍처 구현",
    "테스트 커버리지 70% 달성: 단위 테스트와 통합 테스트로 코드 품질 보증",
    "성능 최적화로 평균 페이지 로딩 속도 30% 개선: 사용자 경험 향상",
    "접근성(a11y) 표준 준수: WCAG 2.1 레벨 AA 기준 충족"
  ],
  "technicalGrowth": [
    "JWT 및 세션 관리에 대한 심도 있는 이해: bcrypt, JWT, 쿠키 보안, 토큰 갱신 전략 등 인증 시스템 전반에 대한 실무 경험 축적",
    "WebSocket 실시간 통신 구현 능력 향상: Socket.IO를 활용한 양방향 통신, 이벤트 발행/구독 패턴, 연결 관리 등 실시간 기능 구현 역량 강화",
    "테스트 주도 개발(TDD) 사고방식 체득: Jest, Testing Library를 활용한 효과적인 테스트 작성 방법과 유지보수 가능한 테스트 코드 구조화 능력 향상"
  ],
  "recommendations": [
    "API 문서화 강화: Swagger/OpenAPI를 도입하여 API 명세를 자동화하고 프론트엔드 팀과의 협업 효율성을 높이는 것을 추천합니다.",
    "모니터링 및 로깅 시스템 구축: 실시간 알림 시스템의 안정성 모니터링을 위해 Sentry, DataDog 등의 APM 도구 도입을 고려해보세요.",
    "성능 테스트 및 부하 테스트 수행: 실시간 기능의 동시 접속자 수에 따른 성능을 측정하고 병목 지점을 파악하여 확장성을 준비하세요."
  ]
}
```

**설정**:
- Model: `gpt-4o`
- Temperature: `0.3`
- Max Tokens: `2000`
- Response Format: `json_object`

---

## 프롬프트 개선 팁

### 1. 명확한 지침
- ✅ **DO**: "5개의 커밋을 선별해주세요"
- ❌ **DON'T**: "중요한 커밋을 찾아주세요"

### 2. 구체적인 기준
- ✅ **DO**: "기능 추가/개선의 중요도, 코드 변경 규모, 핵심 모듈 변경 여부, 버그 수정 중요도"
- ❌ **DON'T**: "중요한 것"

### 3. 응답 형식 강제
- ✅ **DO**: JSON schema 제공 + `response_format: { type: "json_object" }`
- ❌ **DON'T**: "JSON으로 답변해주세요" (자유 형식)

### 4. 예시 제공
- ✅ **DO**: "reason": "선별 이유 (1-2문장)"
- ❌ **DON'T**: "reason": "이유"

### 5. Temperature 조정
- Stage 1, 2: `0.3` (일관성)
- Stage 3: `0.3` (창의성보다 정확성 우선)

### 6. 토큰 최적화
- 불필요한 정보 제외
- 중요 파일만 선택 (최대 10개)
- Patch를 500줄로 제한

---

## 관련 파일

- **프롬프트 빌더**: `src/lib/journal/prompts.ts`
- **Analyzer 클래스**: `src/lib/journal/analyzer.ts`
- **API Routes**: `src/app/api/analysis/[runId]/journal/`

---

**문서 작성일**: 2025-12-14  
**버전**: 1.0.0
