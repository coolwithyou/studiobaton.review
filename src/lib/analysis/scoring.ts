import { ImpactConfig, ImpactFactors } from "@/types";

// ============================================
// 기본 설정
// ============================================

export const DEFAULT_IMPACT_CONFIG: ImpactConfig = {
  criticalPaths: [
    { pattern: "auth", weight: 2.0 },
    { pattern: "payment", weight: 2.5 },
    { pattern: "security", weight: 2.0 },
    { pattern: "core", weight: 1.8 },
    { pattern: "api", weight: 1.5 },
    { pattern: "database", weight: 1.8 },
    { pattern: "migration", weight: 1.5 },
  ],
  weights: {
    coreModule: 2.0,
    hotspotFile: 1.5,
    testFile: 0.8,
    configFile: 1.3,
    schemaChange: 1.8,
  },
  locCap: 500,
};

// ============================================
// 임팩트 스코어 계산
// ============================================

interface WorkUnitForScoring {
  additions: number;
  deletions: number;
  primaryPaths: string[];
  isHotfix: boolean;
  hasRevert: boolean;
}

export function calculateImpactScore(
  workUnit: WorkUnitForScoring,
  config: Partial<ImpactConfig> = {},
  hotspotFiles: Set<string> = new Set()
): { score: number; factors: ImpactFactors } {
  const cfg = { ...DEFAULT_IMPACT_CONFIG, ...config };

  const factors: ImpactFactors = {
    baseScore: 0,
    coreModuleBonus: 0,
    hotspotBonus: 0,
    testPenalty: 0,
    configBonus: 0,
    sizeScore: 0,
  };

  // 1. 기본 점수 (변경 규모, 캡 적용)
  const totalLoc = workUnit.additions + workUnit.deletions;
  const cappedLoc = Math.min(totalLoc, cfg.locCap);
  factors.baseScore = Math.log10(cappedLoc + 1) * 10;

  // 2. 크기 점수 (작은 변경에 페널티 없이 비례)
  factors.sizeScore = Math.min(cappedLoc / 100, 5);

  // 3. 핵심 모듈 가중치
  for (const path of workUnit.primaryPaths) {
    for (const critical of cfg.criticalPaths) {
      if (matchPath(path, critical.pattern)) {
        factors.coreModuleBonus += critical.weight;
      }
    }
  }
  // 중복 방지를 위해 캡 적용
  factors.coreModuleBonus = Math.min(factors.coreModuleBonus, 10);

  // 4. 핫스팟 파일 가중치
  const hotspotCount = workUnit.primaryPaths.filter((p) =>
    hotspotFiles.has(p)
  ).length;
  factors.hotspotBonus = hotspotCount * cfg.weights.hotspotFile;

  // 5. 테스트 파일 비중
  const testCount = workUnit.primaryPaths.filter(isTestFile).length;
  const testRatio =
    workUnit.primaryPaths.length > 0
      ? testCount / workUnit.primaryPaths.length
      : 0;

  if (testRatio > 0.8) {
    // 테스트만 있는 경우 약간 감점
    factors.testPenalty = -3;
  } else if (testRatio > 0 && testRatio <= 0.5) {
    // 테스트와 코드가 적절히 섞인 경우 보너스
    factors.testPenalty = 2;
  }

  // 6. 설정/스키마 변경 보너스
  if (workUnit.primaryPaths.some(isConfigFile)) {
    factors.configBonus += cfg.weights.configFile;
  }
  if (workUnit.primaryPaths.some(isSchemaFile)) {
    factors.configBonus += cfg.weights.schemaChange;
  }

  // 7. Hotfix/Revert 가중치
  if (workUnit.isHotfix) {
    factors.coreModuleBonus += 3; // 긴급 수정은 중요도 높음
  }
  if (workUnit.hasRevert) {
    factors.testPenalty -= 2; // Revert은 주의 필요
  }

  // 최종 점수 계산
  const score = Object.values(factors).reduce((a, b) => a + b, 0);

  return {
    score: Math.max(0, Math.round(score * 10) / 10),
    factors,
  };
}

// ============================================
// 경로 매칭
// ============================================

function matchPath(path: string, pattern: string): boolean {
  const lowerPath = path.toLowerCase();
  const lowerPattern = pattern.toLowerCase();

  // 단순 포함 검사
  if (lowerPath.includes(lowerPattern)) {
    return true;
  }

  // 디렉토리 이름 매칭
  const parts = lowerPath.split("/");
  return parts.some((part) => part === lowerPattern);
}

// ============================================
// 파일 타입 감지
// ============================================

export function isTestFile(path: string): boolean {
  const testPatterns = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /_test\.[jt]sx?$/,
    /_spec\.[jt]sx?$/,
    /test_.*\.[jt]sx?$/,
    /spec_.*\.[jt]sx?$/,
    /^tests?\//,
    /__tests__\//,
    /\.test\./,
    /\.spec\./,
  ];

  return testPatterns.some((p) => p.test(path));
}

export function isConfigFile(path: string): boolean {
  const configPatterns = [
    /\.config\.[jt]sx?$/,
    /\.env/,
    /config\.[jt]sx?$/,
    /settings\.[jt]sx?$/,
    /\.json$/,
    /\.ya?ml$/,
    /\.toml$/,
    /Dockerfile/,
    /docker-compose/,
    /nginx\.conf/,
  ];

  return configPatterns.some((p) => p.test(path));
}

export function isSchemaFile(path: string): boolean {
  const schemaPatterns = [
    /schema\.prisma$/,
    /schema\.[jt]sx?$/,
    /migrations?\//,
    /\.sql$/,
    /graphql$/,
    /\.proto$/,
  ];

  return schemaPatterns.some((p) => p.test(path));
}

export function isDocFile(path: string): boolean {
  const docPatterns = [
    /\.md$/,
    /\.mdx$/,
    /\.rst$/,
    /\.txt$/,
    /docs?\//,
    /README/i,
    /CHANGELOG/i,
    /LICENSE/i,
  ];

  return docPatterns.some((p) => p.test(path));
}

// ============================================
// 핫스팟 파일 계산
// ============================================

interface CommitForHotspot {
  files: { path: string }[];
}

export function calculateHotspotFiles(
  commits: CommitForHotspot[],
  topN: number = 20
): Set<string> {
  const pathCounts = new Map<string, number>();

  for (const commit of commits) {
    for (const file of commit.files) {
      pathCounts.set(file.path, (pathCounts.get(file.path) || 0) + 1);
    }
  }

  // 변경 빈도 상위 N개 파일
  const sorted = [...pathCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  return new Set(sorted.map(([path]) => path));
}

// ============================================
// 작업 유형 추론
// ============================================

export type WorkType =
  | "feature"
  | "bugfix"
  | "refactor"
  | "chore"
  | "docs"
  | "test";

export function inferWorkType(
  message: string,
  primaryPaths: string[]
): WorkType {
  const lowerMessage = message.toLowerCase();

  // 커밋 메시지 기반 추론
  if (/^feat|feature|add|implement/i.test(message)) return "feature";
  if (/^fix|bug|hotfix|patch/i.test(message)) return "bugfix";
  if (/^refactor|clean|improve/i.test(message)) return "refactor";
  if (/^docs?|readme|changelog/i.test(message)) return "docs";
  if (/^test|spec/i.test(message)) return "test";
  if (/^chore|ci|build|deps/i.test(message)) return "chore";

  // 파일 경로 기반 추론
  const testRatio =
    primaryPaths.filter(isTestFile).length / primaryPaths.length;
  if (testRatio > 0.7) return "test";

  const docRatio = primaryPaths.filter(isDocFile).length / primaryPaths.length;
  if (docRatio > 0.7) return "docs";

  const configRatio =
    primaryPaths.filter(isConfigFile).length / primaryPaths.length;
  if (configRatio > 0.7) return "chore";

  // 기본값
  if (lowerMessage.includes("fix")) return "bugfix";

  return "feature";
}

