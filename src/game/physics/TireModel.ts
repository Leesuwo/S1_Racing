export interface TireModelConfig {
  referenceLoadN: number;
  loadSensitivityExponent: number;
  longitudinalStiffnessNPerSlip: number;
  corneringStiffnessNPerRad: number;
  minimumSlipSpeedMps: number;
}

export interface TireForceInput {
  normalForceN: number;
  frictionCoefficient: number;
  longitudinalSpeedMps: number;
  lateralSpeedMps: number;
  wheelAngularSpeedRadS: number;
  wheelRadiusM: number;
}

export interface TireForceState {
  slipRatio: number;
  slipAngleRad: number;
  longitudinalForceN: number;
  lateralForceN: number;
  maximumForceN: number;
  frictionUsage: number;
}

export const DEFAULT_TIRE_MODEL_CONFIG: TireModelConfig = {
  referenceLoadN: 1_950,
  loadSensitivityExponent: 0.9,
  longitudinalStiffnessNPerSlip: 46_000,
  corneringStiffnessNPerRad: 38_000,
  minimumSlipSpeedMps: 0.5,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function calculateSlipRatio(
  longitudinalSpeedMps: number,
  wheelAngularSpeedRadS: number,
  wheelRadiusM: number,
  minimumSlipSpeedMps = DEFAULT_TIRE_MODEL_CONFIG.minimumSlipSpeedMps,
): number {
  const safeRadiusM = Math.max(0.01, Math.abs(finiteOr(wheelRadiusM, 0.36)));
  const longitudinalSpeed = finiteOr(longitudinalSpeedMps);
  const wheelSurfaceSpeed = finiteOr(wheelAngularSpeedRadS) * safeRadiusM;
  const denominator = Math.max(Math.abs(longitudinalSpeed), Math.max(0.01, minimumSlipSpeedMps));

  return clamp((wheelSurfaceSpeed - longitudinalSpeed) / denominator, -4, 4);
}

export function calculateSlipAngle(
  longitudinalSpeedMps: number,
  lateralSpeedMps: number,
  minimumSlipSpeedMps = DEFAULT_TIRE_MODEL_CONFIG.minimumSlipSpeedMps,
): number {
  const longitudinalSpeed = finiteOr(longitudinalSpeedMps);
  const lateralSpeed = finiteOr(lateralSpeedMps);
  const denominator = Math.max(Math.abs(longitudinalSpeed), Math.max(0.01, minimumSlipSpeedMps));

  return Math.atan2(lateralSpeed, denominator);
}

export function calculateLoadSensitiveMaximumForce(
  normalForceN: number,
  frictionCoefficient: number,
  config: TireModelConfig = DEFAULT_TIRE_MODEL_CONFIG,
): number {
  const safeLoadN = Math.max(0, finiteOr(normalForceN));
  const safeFriction = Math.max(0, finiteOr(frictionCoefficient));
  const referenceLoadN = Math.max(1, finiteOr(config.referenceLoadN, 1_950));
  const exponent = clamp(finiteOr(config.loadSensitivityExponent, 0.9), 0.5, 1);

  return safeFriction * referenceLoadN * Math.pow(safeLoadN / referenceLoadN, exponent);
}

export function calculateTireForce(
  input: TireForceInput,
  config: TireModelConfig = DEFAULT_TIRE_MODEL_CONFIG,
): TireForceState {
  const maximumForceN = calculateLoadSensitiveMaximumForce(
    input.normalForceN,
    input.frictionCoefficient,
    config,
  );
  const slipRatio = calculateSlipRatio(
    input.longitudinalSpeedMps,
    input.wheelAngularSpeedRadS,
    input.wheelRadiusM,
    config.minimumSlipSpeedMps,
  );
  const slipAngleRad = calculateSlipAngle(
    input.longitudinalSpeedMps,
    input.lateralSpeedMps,
    config.minimumSlipSpeedMps,
  );

  if (maximumForceN <= 1e-6) {
    return {
      slipRatio,
      slipAngleRad,
      longitudinalForceN: 0,
      lateralForceN: 0,
      maximumForceN: 0,
      frictionUsage: 0,
    };
  }

  const rawLongitudinalForceN = maximumForceN * Math.tanh(
    slipRatio * Math.max(0, finiteOr(config.longitudinalStiffnessNPerSlip)) / maximumForceN,
  );
  const rawLateralForceN = -maximumForceN * Math.tanh(
    slipAngleRad * Math.max(0, finiteOr(config.corneringStiffnessNPerRad)) / maximumForceN,
  );
  const rawUsage = Math.hypot(rawLongitudinalForceN, rawLateralForceN) / maximumForceN;
  const scale = rawUsage > 1 ? 1 / rawUsage : 1;

  return {
    slipRatio,
    slipAngleRad,
    longitudinalForceN: rawLongitudinalForceN * scale,
    lateralForceN: rawLateralForceN * scale,
    maximumForceN,
    frictionUsage: Math.min(1, rawUsage),
  };
}
