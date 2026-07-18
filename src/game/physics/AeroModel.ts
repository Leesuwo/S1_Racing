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
  downforceCoefficientNPerMps2: 1.25,
  dragCoefficientNPerMps2: 0.42,
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
