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
  // 640 kg F1 기준 정적 바퀴 하중에 가까운 참조 하중이다. 실차 타이어
  // 데이터가 아니므로 공력 하중과 함께 simulation_required로 관리한다.
  referenceLoadN: 1_700,
  // 하중이 증가할수록 마찰력이 선형보다 느리게 증가하는 slick tire 가정이다.
  loadSensitivityExponent: 0.87,
  // 낮은 슬립에서 구동·제동력이 빠르게 올라오도록 하는 initial_assumption이다.
  longitudinalStiffnessNPerSlip: 58_000,
  // F1 slick의 최대 횡력 구간을 작은 슬립각에 두기 위한 initial_assumption이다.
  corneringStiffnessNPerRad: 52_000,
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
