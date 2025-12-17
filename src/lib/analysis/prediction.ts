/**
 * WorkUnit 개수 예측 모듈
 *
 * 클러스터링 전에 예상 WorkUnit 개수를 계산하여
 * 진행률 표시에 활용합니다.
 */

export interface WorkUnitPrediction {
  min: number;
  expected: number;
  max: number;
}

/**
 * WorkUnit 개수를 사전 예측
 *
 * 클러스터링 알고리즘 특성 기반:
 * - 시간 갭(8시간)이 주요 결정 요소
 * - 평균적으로 커밋 10개당 1개 WorkUnit 생성
 * - 리포지토리별로 독립 클러스터링되므로 최소 리포 수만큼 생성
 *
 * @param totalCommits 총 커밋 수
 * @param repositoryCount 리포지토리 수
 * @returns 예상 범위 (min, expected, max)
 */
export function predictWorkUnitCount(
  totalCommits: number,
  repositoryCount: number
): WorkUnitPrediction {
  // 기본 추정: 커밋 10개당 1개 WorkUnit
  const baseEstimate = Math.ceil(totalCommits / 10);

  // 최소값: 리포 수 + 1 또는 기본 추정의 65%
  const minEstimate = Math.max(
    repositoryCount + 1,
    Math.floor(baseEstimate * 0.65)
  );

  // 최대값: 기본 추정의 140%
  const maxEstimate = Math.ceil(baseEstimate * 1.4);

  return {
    min: Math.max(1, minEstimate),
    expected: Math.max(1, baseEstimate),
    max: Math.max(1, maxEstimate),
  };
}

/**
 * 실제 개수에 따라 예측값 동적 조정
 *
 * 실제 개수가 max의 90%를 초과하면 예상 범위를 1.3배 상향
 *
 * @param current 현재 예측값
 * @param actualCount 실제 생성된 WorkUnit 수
 * @returns 조정된 예측값
 */
export function adjustPrediction(
  current: WorkUnitPrediction,
  actualCount: number
): WorkUnitPrediction {
  // 90% 임계치 초과 시 상향 조정
  if (actualCount > current.max * 0.9) {
    return {
      min: current.min,
      expected: Math.ceil(current.expected * 1.3),
      max: Math.ceil(current.max * 1.3),
    };
  }
  return current;
}
