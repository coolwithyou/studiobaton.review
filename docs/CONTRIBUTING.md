# 기여 가이드

## 개발 환경 설정

1. 저장소 포크 및 클론
2. 의존성 설치: `npm install`
3. 환경변수 설정: `.env.example` → `.env`
4. 데이터베이스 마이그레이션: `npx prisma migrate dev`
5. 개발 서버 실행: `npm run dev` (포트 3020)

## 코드 컨벤션

### TypeScript

- **타입 정의**: `src/types/index.ts`에 공통 타입 선언
- **엄격 모드**: `strict: true` 준수
- **Null 체크**: `?.` 연산자 적극 활용

### 파일 구조

```
src/
├── app/              # 라우팅 (Pages/API)
├── components/       # React 컴포넌트
├── lib/              # 유틸리티, 비즈니스 로직
└── types/            # 타입 정의
```

### 네이밍

- **파일명**: kebab-case (`work-unit.ts`)
- **컴포넌트**: PascalCase (`ActivityChart`)
- **함수**: camelCase (`getUserOctokit`)
- **상수**: UPPER_SNAKE_CASE (`DEFAULT_CONFIG`)

## 커밋 메시지

```
feat: 새 기능 추가
fix: 버그 수정
refactor: 리팩토링
docs: 문서 변경
chore: 빌드/설정 변경
test: 테스트 추가
```

## Pull Request

1. Feature 브랜치 생성: `git checkout -b feat/your-feature`
2. 변경 사항 커밋
3. 테스트 실행: `npm run build && npm run lint`
4. PR 생성
5. 코드 리뷰 대기

## 테스트 작성

```typescript
// lib/analysis/clustering.test.ts
import { describe, it, expect } from 'vitest';
import { clusterCommits } from './clustering';

describe('clusterCommits', () => {
  it('should cluster by time gap', () => {
    const commits = [...];
    const result = clusterCommits(commits);
    expect(result).toHaveLength(2);
  });
});
```

## 새 기능 제안

Issues 탭에서:
- 명확한 제목
- 배경 및 목적 설명
- 예상 구현 방법
- (선택) Mock UI/API 스펙
