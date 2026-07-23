/**
 * 휠 속도와 접지 하중에서 종·횡 슬립 및 결합 타이어 힘을 계산하는 순수 모델이다.
 * 수치는 실제 타이어를 재현하는 값이 아닌 initial_assumption이며 simulation_required다.
 */
/** 하중 민감도와 슬립 강성을 포함한 타이어 모델 설정이다. */
export interface TireModelConfig {
  referenceLoadN: number;
  loadSensitivityExponent: number;
  longitudinalStiffnessNPerSlip: number;
  corneringStiffnessNPerRad: number;
  minimumSlipSpeedMps: number;
}

/** 한 접지 휠의 속도·회전·하중 입력이다. */
export interface TireForceInput {
  normalForceN: number;
  frictionCoefficient: number;
  longitudinalSpeedMps: number;
  lateralSpeedMps: number;
  wheelAngularSpeedRadS: number;
  wheelRadiusM: number;
}

/** 슬립과 마찰원 제한을 적용한 타이어 힘 결과다. */
export interface TireForceState {
  slipRatio: number;
  slipAngleRad: number;
  longitudinalForceN: number;
  lateralForceN: number;
  maximumForceN: number;
  frictionUsage: number;
}

/** 단위가 명시된 초기 타이어 그립 가정이다. */
export const DEFAULT_TIRE_MODEL_CONFIG: TireModelConfig = {
  referenceLoadN: 1_950,
  loadSensitivityExponent: 0.9,
  longitudinalStiffnessNPerSlip: 46_000,
  corneringStiffnessNPerRad: 38_000,
  minimumSlipSpeedMps: 0.5,
};

/** 타이어 힘이 허용 마찰원을 넘지 않도록 값을 제한한다. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** 센서·물리 중간값의 NaN/Infinity를 안전한 값으로 치환한다. */
function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/** 바퀴 접선 속도와 지면 속도의 차이를 부호 있는 종방향 슬립으로 계산한다. */
export function calculateSlipRatio(
  longitudinalSpeedMps: number,
  wheelAngularSpeedRadS: number,
  wheelRadiusM: number,
  minimumSlipSpeedMps = DEFAULT_TIRE_MODEL_CONFIG.minimumSlipSpeedMps,
): number {
  // 휠 반지름과 분모에 최소값을 둬 정지 근처 0 나눗셈을 피한다.
  const safeRadiusM = Math.max(0.01, Math.abs(finiteOr(wheelRadiusM, 0.36)));
  // 입력 종속도와 휠 접선 속도(m/s)를 각각 유한한 값으로 정규화한다.
  const longitudinalSpeed = finiteOr(longitudinalSpeedMps);
  const wheelSurfaceSpeed = finiteOr(wheelAngularSpeedRadS) * safeRadiusM;
  // 정지 근처에서도 슬립 부호를 유지할 수 있는 최소 분모(m/s)다.
  const denominator = Math.max(Math.abs(longitudinalSpeed), Math.max(0.01, minimumSlipSpeedMps));

  // 지나치게 큰 슬립은 초기 가정 모델의 안정성을 위해 ±4에서 자른다.
  return clamp((wheelSurfaceSpeed - longitudinalSpeed) / denominator, -4, 4);
}

/** 종방향 속도를 기준으로 부호 있는 횡슬립각(rad)을 계산한다. */
export function calculateSlipAngle(
  longitudinalSpeedMps: number,
  lateralSpeedMps: number,
  minimumSlipSpeedMps = DEFAULT_TIRE_MODEL_CONFIG.minimumSlipSpeedMps,
): number {
  // 차체 속도의 횡·종 성분을 유한한 중간값으로 만든다.
  const longitudinalSpeed = finiteOr(longitudinalSpeedMps);
  const lateralSpeed = finiteOr(lateralSpeedMps);
  const denominator = Math.max(Math.abs(longitudinalSpeed), Math.max(0.01, minimumSlipSpeedMps));

  return Math.atan2(lateralSpeed, denominator);
}

/** 하중 민감도 지수로 정상 하중에서 사용할 최대 마찰력을 계산한다. */
export function calculateLoadSensitiveMaximumForce(
  normalForceN: number,
  frictionCoefficient: number,
  config: TireModelConfig = DEFAULT_TIRE_MODEL_CONFIG,
): number {
  // 실제 하중이 0이면 힘도 0이며, 기준 하중은 분모 보호를 위해 최소 1 N으로 둔다.
  const safeLoadN = Math.max(0, finiteOr(normalForceN));
  // 마찰계수는 음수가 될 수 없으며 노면 배율을 이미 포함할 수 있다.
  const safeFriction = Math.max(0, finiteOr(frictionCoefficient));
  const referenceLoadN = Math.max(1, finiteOr(config.referenceLoadN, 1_950));
  const exponent = clamp(finiteOr(config.loadSensitivityExponent, 0.9), 0.5, 1);

  return safeFriction * referenceLoadN * Math.pow(safeLoadN / referenceLoadN, exponent);
}

/** 종·횡 슬립으로 힘을 계산하고 마찰원 안으로 결합 제한한다. */
export function calculateTireForce(
  input: TireForceInput,
  config: TireModelConfig = DEFAULT_TIRE_MODEL_CONFIG,
): TireForceState {
  // 최대력과 두 슬립을 먼저 산출해 모든 후속 힘이 같은 접지 상태를 사용하게 한다.
  const maximumForceN = calculateLoadSensitiveMaximumForce(
    input.normalForceN,
    input.frictionCoefficient,
    config,
  );
  // 힘 계산에 사용할 종슬립과 횡슬립을 같은 minimum speed 정책으로 계산한다.
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

  // 접지 하중이 없으면 방향이 정의되지 않으므로 유한한 0 힘을 반환한다.
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

  // tanh 곡선은 작은 슬립에서 선형에 가깝고 큰 슬립에서 최대력에 수렴한다.
  const rawLongitudinalForceN = maximumForceN * Math.tanh(
    slipRatio * Math.max(0, finiteOr(config.longitudinalStiffnessNPerSlip)) / maximumForceN,
  );
  // 횡력은 횡속도/슬립각을 반대하는 부호로 계산한다.
  const rawLateralForceN = -maximumForceN * Math.tanh(
    slipAngleRad * Math.max(0, finiteOr(config.corneringStiffnessNPerRad)) / maximumForceN,
  );
  // 종·횡 힘의 벡터 크기를 마찰원 사용률로 계산한다.
  const rawUsage = Math.hypot(rawLongitudinalForceN, rawLateralForceN) / maximumForceN;
  // 사용률이 1을 넘으면 두 힘을 같은 비율로 축소해 결합 한계를 지킨다.
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
