/**
 * 속도 제곱에 비례하는 다운포스·항력을 계산하는 순수 공력 모델이다.
 * 계수와 결과는 각각 N/(m/s)^2, N 단위를 사용하며 값은 초기 가정이다.
 */
/** 공력 계산에 사용하는 차체별 계수 설정이다. */
export interface AeroModelConfig {
  downforceCoefficientNPerMps2: number;
  dragCoefficientNPerMps2: number;
  frontBalance: number;
}

/** 현재 속도와 노면·공력 배율을 공력 모델에 전달하는 입력이다. */
export interface AeroInput {
  speedMps: number;
  surfaceDragMultiplier?: number;
  aeroMultiplier?: number;
}

/** 공력 계산 결과와 전륜·후륜 하중 분배를 담는다. */
export interface AeroForceState {
  speedMps: number;
  downforceN: number;
  frontDownforceN: number;
  rearDownforceN: number;
  dragForceN: number;
}

/** 특정 차량 검증 전까지 사용하는 시뮬레이션 초기 공력 가정이다. */
export const DEFAULT_AERO_MODEL_CONFIG: AeroModelConfig = {
  downforceCoefficientNPerMps2: 1.25,
  dragCoefficientNPerMps2: 0.42,
  frontBalance: 0.43,
};

/** NaN과 Infinity가 힘 계산으로 전파되지 않도록 대체값을 적용한다. */
function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/** 공력 balance처럼 닫힌 구간이어야 하는 값을 제한한다. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** 속도 제곱 법칙으로 다운포스와 속도 반대 방향 항력을 계산한다. */
export function calculateAeroForces(
  input: AeroInput,
  config: AeroModelConfig = DEFAULT_AERO_MODEL_CONFIG,
): AeroForceState {
  // 정지 상태에서 공력이 생기지 않도록 음수·비정상 속도를 0으로 정규화한다.
  const speedMps = Math.max(0, finiteOr(input.speedMps));
  // 두 공력 성분 모두 속도 제곱에 비례하므로 공통 중간값을 사용한다.
  const speedSquared = speedMps * speedMps;
  // 배율은 외부 조정값이므로 음수 공력이나 항력을 만들지 않는다.
  const aeroMultiplier = Math.max(0, finiteOr(input.aeroMultiplier ?? 1, 1));
  // 노면별 항력 배율을 같은 속도 제곱 항에 곱한다.
  const dragMultiplier = Math.max(0, finiteOr(input.surfaceDragMultiplier ?? 1, 1));
  // 공력 계수와 속도 제곱에서 전체 다운포스(N)를 계산한다.
  const downforceN = Math.max(0, finiteOr(config.downforceCoefficientNPerMps2)) * speedSquared * aeroMultiplier;
  // 항력 계수·속도 제곱·표면 배율에서 전체 항력(N)을 계산한다.
  const dragForceN = Math.max(0, finiteOr(config.dragCoefficientNPerMps2)) * speedSquared * dragMultiplier;
  // 전륜 배분을 [0, 1]로 닫아 후륜 배분과 합이 전체 하중이 되게 한다.
  const frontBalance = clamp(finiteOr(config.frontBalance, 0.5), 0, 1);

  return {
    speedMps,
    downforceN,
    frontDownforceN: downforceN * frontBalance,
    rearDownforceN: downforceN * (1 - frontBalance),
    dragForceN,
  };
}
