export interface AeroModelConfig {
  downforceCoefficientNPerMps2: number;
  dragCoefficientNPerMps2: number;
  frontBalance: number;
}

export interface AeroInput {
  speedMps: number;
  surfaceDragMultiplier?: number;
  aeroMultiplier?: number;
}

export interface AeroForceState {
  speedMps: number;
  downforceN: number;
  frontDownforceN: number;
  rearDownforceN: number;
  dragForceN: number;
}

export const DEFAULT_AERO_MODEL_CONFIG: AeroModelConfig = {
  // 4.4 N/(m/s)^2는 150 km/h에서 약 6.9 kN의 다운포스를 만드는
  // 2012 F1 범위의 initial_assumption이다. Mercedes-AMG의 기술 설명에서
  // 언급한 "차량 무게와 비슷한 다운포스"를 640 kg 기준으로 환산했다.
  downforceCoefficientNPerMps2: 4.4,
  // 2012년형 고다운포스 패키지의 직선 저항을 반영하기 위한 initial_assumption이다.
  dragCoefficientNPerMps2: 0.68,
  frontBalance: 0.43,
};

function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

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
