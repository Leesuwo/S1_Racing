/** 속도 제곱 공력 모델의 계수 묶음. 계수의 힘 단위는 N/(m/s)^2다. */
export interface AeroModelConfig {
  downforceCoefficientNPerMps2: number;
  dragCoefficientNPerMps2: number;
  frontBalance: number;
}

/** 공력 계산 입력. 속도는 평면 속력 m/s, 배율은 무차원이다. */
export interface AeroInput {
  speedMps: number;
  surfaceDragMultiplier?: number;
  aeroMultiplier?: number;
}

/** 전·후 다운포스와 진행 반대 항력을 포함한 한 스텝의 공력 결과다. 힘 단위는 N이다. */
export interface AeroForceState {
  speedMps: number;
  downforceN: number;
  frontDownforceN: number;
  rearDownforceN: number;
  dragForceN: number;
}

/** 실제 차량 데이터로 확정되지 않은 M1 초기 가정값이다. */
export const DEFAULT_AERO_MODEL_CONFIG: AeroModelConfig = {
  downforceCoefficientNPerMps2: 1.25,
  dragCoefficientNPerMps2: 0.42,
  frontBalance: 0.43,
};

/** 비유한 계산 결과가 물리식으로 전파되지 않도록 대체값을 적용한다. */
function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/** 공력 balance처럼 비율로 사용되는 값을 유효 범위에 둔다. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * `F = C * v^2` 형태로 다운포스와 항력을 계산한다. 정지 시 힘은 0이며,
 * frontBalance는 전체 다운포스를 전·후 차축으로 나누고 표면 배율은 항력에만 적용된다.
 */
export function calculateAeroForces(
  input: AeroInput,
  config: AeroModelConfig = DEFAULT_AERO_MODEL_CONFIG,
): AeroForceState {
  const speedMps = Math.max(0, finiteOr(input.speedMps));
  const speedSquared = speedMps * speedMps;
  const aeroMultiplier = Math.max(0, finiteOr(input.aeroMultiplier ?? 1, 1));
  const dragMultiplier = Math.max(0, finiteOr(input.surfaceDragMultiplier ?? 1, 1));
  const downforceN = Math.max(0, finiteOr(config.downforceCoefficientNPerMps2)) * speedSquared * aeroMultiplier;
  const dragForceN = Math.max(0, finiteOr(config.dragCoefficientNPerMps2)) * speedSquared * dragMultiplier;
  const frontBalance = clamp(finiteOr(config.frontBalance, 0.5), 0, 1);

  return {
    speedMps,
    downforceN,
    frontDownforceN: downforceN * frontBalance,
    rearDownforceN: downforceN * (1 - frontBalance),
    dragForceN,
  };
}
