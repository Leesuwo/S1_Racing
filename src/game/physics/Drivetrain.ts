/** RPM 구간별 엔진 토크 곡선의 한 점이다. 토크 단위는 N·m이다. */
export interface TorqueCurvePoint {
  rpm: number;
  torqueNm: number;
}

/** 기어비·클러치·RPM 응답을 포함한 구동계 튜닝값이다. */
export interface DrivetrainConfig {
  gearRatios: readonly number[];
  finalDriveRatio: number;
  drivetrainEfficiency: number;
  wheelRadiusM: number;
  idleRpm: number;
  redlineRpm: number;
  maxEngineTorqueNm: number;
  engineBrakeTorqueNm: number;
  rpmResponseRpmPerSecond: number;
  torqueCurve: readonly TorqueCurvePoint[];
}

/** 고정 스텝 한 번에 구동계가 소비하는 차량·휠 상태다. */
export interface DrivetrainInput {
  gear: number;
  throttle: number;
  clutch: number;
  forwardSpeedMps: number;
  drivenWheelAngularSpeedRadS: number;
  previousRpm: number;
  dtSeconds: number;
}

/** 구동계가 타이어 계층으로 전달할 토크·힘·RPM 결과다. 힘 단위는 N, 토크는 N·m이다. */
export interface DrivetrainCommand {
  gearRatio: number;
  rpm: number;
  engineTorqueNm: number;
  driveTorqueNm: number;
  engineBrakeTorqueNm: number;
  wheelEngineBrakeTorqueNm: number;
  driveForceN: number;
  engineBrakeForceN: number;
  wheelAngularSpeedRadS: number;
}

/** 실차 측정으로 확정되지 않은 검증용 초기 토크 곡선이다. */
export const DEFAULT_TORQUE_CURVE: readonly TorqueCurvePoint[] = [
  { rpm: 900, torqueNm: 210 },
  { rpm: 2_500, torqueNm: 285 },
  { rpm: 4_500, torqueNm: 320 },
  { rpm: 6_500, torqueNm: 305 },
  { rpm: 8_000, torqueNm: 245 },
];

/** 비유한 RPM·토크 입력이 엔진 모델에 전파되지 않게 한다. */
function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/** RPM·클러치·효율처럼 범위가 정해진 값을 안전하게 제한한다. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** RPM이 고정 스텝당 허용 변화량을 넘지 않도록 목표값으로 접근시킨다. */
function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maxDelta;
}

/** 토크 곡선의 인접 두 점 사이를 선형 보간한다. 곡선 밖 RPM은 끝점으로 고정한다. */
export function interpolateEngineTorque(
  rpm: number,
  config: DrivetrainConfig,
): number {
  const points = config.torqueCurve.length >= 2
    ? config.torqueCurve
    : [
      { rpm: Math.max(1, config.idleRpm), torqueNm: Math.max(0, config.maxEngineTorqueNm) },
      { rpm: Math.max(config.idleRpm + 1, config.redlineRpm), torqueNm: Math.max(0, config.maxEngineTorqueNm) },
    ];
  const safeRpm = clamp(
    finiteOr(rpm, config.idleRpm),
    finiteOr(points[0].rpm, config.idleRpm),
    finiteOr(points[points.length - 1].rpm, config.redlineRpm),
  );

  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];
    if (safeRpm <= current.rpm) {
      const rpmRange = Math.max(1e-6, finiteOr(current.rpm) - finiteOr(previous.rpm));
      const ratio = (safeRpm - previous.rpm) / rpmRange;
      return Math.max(0, finiteOr(previous.torqueNm))
        + (Math.max(0, finiteOr(current.torqueNm)) - Math.max(0, finiteOr(previous.torqueNm))) * ratio;
    }
  }

  return Math.max(0, finiteOr(points[points.length - 1].torqueNm));
}

/**
 * 현재 기어와 휠 각속도로 결합 RPM·엔진 토크·후륜 구동 토크를 계산한다.
 * 클러치가 풀리면 휠 결합 RPM을 사용하지 않고 free-rev 경로를 사용하며,
 * 저스로틀·결합 상태에서만 엔진 브레이크를 생성한다.
 */
export function calculateDrivetrainCommand(
  input: DrivetrainInput,
  config: DrivetrainConfig,
): DrivetrainCommand {
  const gearIndex = clamp(Math.trunc(input.gear) - 1, 0, Math.max(0, config.gearRatios.length - 1));
  const gearRatio = Math.max(0, finiteOr(config.gearRatios[gearIndex] ?? 0));
  const wheelRadiusM = Math.max(0.01, Math.abs(finiteOr(config.wheelRadiusM, 0.36)));
  const throttle = clamp(finiteOr(input.throttle), 0, 1);
  const clutch = clamp(finiteOr(input.clutch), 0, 1);
  const wheelAngularSpeedRadS = finiteOr(
    input.drivenWheelAngularSpeedRadS,
    finiteOr(input.forwardSpeedMps) / wheelRadiusM,
  );
  const coupledRpm = Math.abs(wheelAngularSpeedRadS)
    * gearRatio
    * Math.max(0, finiteOr(config.finalDriveRatio, 1))
    * 60
    / (2 * Math.PI);
  const freeRevRpm = Math.max(0, finiteOr(config.idleRpm, 900)) + throttle * 1_500;
  const targetRpm = clamp(
    Math.max(config.idleRpm, coupledRpm + throttle * 120),
    config.idleRpm,
    config.redlineRpm,
  ) * (1 - clutch) + clamp(freeRevRpm, config.idleRpm, config.redlineRpm) * clutch;
  const rpm = clamp(
    moveTowards(
      clamp(finiteOr(input.previousRpm, config.idleRpm), config.idleRpm, config.redlineRpm),
      targetRpm,
      Math.max(1, finiteOr(config.rpmResponseRpmPerSecond, 24_000)) * Math.max(0, finiteOr(input.dtSeconds, 0)),
    ),
    config.idleRpm,
    config.redlineRpm,
  );
  const engineTorqueNm = throttle * interpolateEngineTorque(rpm, config);
  const driveTorqueNm = engineTorqueNm
    * gearRatio
    * Math.max(0, finiteOr(config.finalDriveRatio, 1))
    * clamp(finiteOr(config.drivetrainEfficiency, 1), 0, 1)
    * (1 - clutch);
  const forwardDirection = Math.sign(finiteOr(input.forwardSpeedMps) || wheelAngularSpeedRadS || 1);
  const canEngineBrake = throttle < 0.05 && clutch < 0.95 && Math.abs(wheelAngularSpeedRadS) > 0.5;
  const rpmRange = Math.max(1, config.redlineRpm - config.idleRpm);
  const engineBrakeStrength = clamp((rpm - config.idleRpm) / rpmRange, 0.15, 1);
  const engineBrakeTorqueNm = canEngineBrake
    ? Math.max(0, finiteOr(config.engineBrakeTorqueNm, 0)) * engineBrakeStrength
    : 0;
  const wheelEngineBrakeTorqueNm = engineBrakeTorqueNm
    * gearRatio
    * Math.max(0, finiteOr(config.finalDriveRatio, 1))
    * clamp(finiteOr(config.drivetrainEfficiency, 1), 0, 1)
    * (1 - clutch);

  return {
    gearRatio,
    rpm,
    engineTorqueNm,
    driveTorqueNm,
    engineBrakeTorqueNm,
    wheelEngineBrakeTorqueNm,
    driveForceN: forwardDirection * driveTorqueNm / wheelRadiusM,
    engineBrakeForceN: forwardDirection * wheelEngineBrakeTorqueNm / wheelRadiusM,
    wheelAngularSpeedRadS,
  };
}
