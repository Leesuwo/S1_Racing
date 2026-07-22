/** 슬립에서 타이어 힘을 계산하는 순수 모델의 튜닝값. 단위는 N, m/s, rad이다. */
export interface TireModelConfig {
  referenceLoadN: number;
  loadSensitivityExponent: number;
  longitudinalStiffnessNPerSlip: number;
  corneringStiffnessNPerRad: number;
  minimumSlipSpeedMps: number;
}

/** 한 휠에 필요한 접지 하중·속도·회전 입력이다. 힘 단위는 N이다. */
export interface TireForceInput {
  normalForceN: number;
  frictionCoefficient: number;
  longitudinalSpeedMps: number;
  lateralSpeedMps: number;
  wheelAngularSpeedRadS: number;
  wheelRadiusM: number;
}

/** 계산된 슬립과 결합 타이어 힘. `frictionUsage`는 0..1 무차원 값이다. */
export interface TireForceState {
  slipRatio: number;
  slipAngleRad: number;
  longitudinalForceN: number;
  lateralForceN: number;
  maximumForceN: number;
  frictionUsage: number;
}

/** 실차 Magic Formula가 아닌 검증용 `initial_assumption` 계수다. */
export const DEFAULT_TIRE_MODEL_CONFIG: TireModelConfig = {
  referenceLoadN: 1_950,
  loadSensitivityExponent: 0.9,
  longitudinalStiffnessNPerSlip: 46_000,
  corneringStiffnessNPerRad: 38_000,
  minimumSlipSpeedMps: 0.5,
};

/** 결과 힘과 마찰 사용률을 계산하기 전 무차원 값을 제한한다. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** NaN·Infinity를 모델의 안전한 기본값으로 치환한다. */
function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/** 휠 접선 속도와 차량 종속도의 차이를 저속 분모 보호와 함께 계산한다. */
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

/** 종속도 대비 횡속도의 방향을 radian 슬립각으로 계산한다. */
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

/** 하중 민감도 지수로 정상 하중이 커질수록 효율이 낮아지는 최대 마찰력을 계산한다. */
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

/**
 * 종·횡 슬립을 각각 tanh 응답으로 변환한 뒤 결합 마찰 원 안으로 제한한다.
 * 접지가 없으면 모든 힘과 사용률을 0으로 반환해 NaN·무한 가속을 차단한다.
 */
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
