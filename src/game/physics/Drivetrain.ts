/**
 * 기어비·토크 곡선·클러치 상태를 엔진 회전수와 바퀴 구동 명령으로
 * 변환하는 순수 구동계 모델이다. 수치는 실제 차량 확정값이 아닌
 * initial_assumption이며 차량 검증은 simulation_required다.
 */
/** RPM 구간의 엔진 토크를 정의하는 곡선 한 점이다. */
export interface TorqueCurvePoint {
  rpm: number;
  torqueNm: number;
}

/** 구동계의 기어·효율·회전 응답 및 토크 곡선 설정이다. */
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

/** 한 fixed step에서 구동계가 읽는 입력 상태다. */
export interface DrivetrainInput {
  gear: number;
  throttle: number;
  clutch: number;
  forwardSpeedMps: number;
  drivenWheelAngularSpeedRadS: number;
  previousRpm: number;
  dtSeconds: number;
}

/** 구동계 계산이 차량 물리로 넘기는 토크·힘·RPM 결과다. */
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

/** 튜닝 가능한 초기 토크 곡선 가정이다. RPM은 rpm, 토크는 N·m이다. */
export const DEFAULT_TORQUE_CURVE: readonly TorqueCurvePoint[] = [
  { rpm: 900, torqueNm: 210 },
  { rpm: 2_500, torqueNm: 285 },
  { rpm: 4_500, torqueNm: 320 },
  { rpm: 6_500, torqueNm: 305 },
  { rpm: 8_000, torqueNm: 245 },
];

/** 비정상 수치가 엔진 상태를 오염시키지 않도록 대체값을 적용한다. */
function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/** 기어 인덱스·입력 비율을 유효한 닫힌 구간으로 제한한다. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** RPM처럼 시간에 따라 움직이는 상태의 1틱 변화량을 제한한다. */
function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maxDelta;
}

/** 토크 곡선의 인접 두 점을 선형 보간해 현재 RPM의 토크를 반환한다. */
export function interpolateEngineTorque(
  rpm: number,
  config: DrivetrainConfig,
): number {
  // 잘못된 곡선도 최소 두 점으로 보완해 보간 루프가 안전하게 동작하게 한다.
  const points = config.torqueCurve.length >= 2
    ? config.torqueCurve
    : [
      { rpm: Math.max(1, config.idleRpm), torqueNm: Math.max(0, config.maxEngineTorqueNm) },
      { rpm: Math.max(config.idleRpm + 1, config.redlineRpm), torqueNm: Math.max(0, config.maxEngineTorqueNm) },
    ];
  // 입력 RPM을 곡선의 끝점 범위로 제한해 extrapolation을 피한다.
  const safeRpm = clamp(
    finiteOr(rpm, config.idleRpm),
    finiteOr(points[0].rpm, config.idleRpm),
    finiteOr(points[points.length - 1].rpm, config.redlineRpm),
  );

  // 현재 RPM을 포함하는 첫 구간에서 선형 보간한다.
  for (let index = 1; index < points.length; index += 1) {
    // 앞·뒤 곡선 점은 동일한 단위(rpm, N·m)를 공유한다.
    const current = points[index];
    // 이전 곡선 점과 현재 곡선 점 사이의 RPM 구간을 보간한다.
    const previous = points[index - 1];
    if (safeRpm <= current.rpm) {
      // 두 점의 RPM 차이는 0이 될 수 없도록 최소 간격을 둔다.
      const rpmRange = Math.max(1e-6, finiteOr(current.rpm) - finiteOr(previous.rpm));
      // 현재 RPM이 해당 구간에서 차지하는 0..1 보간 비율이다.
      const ratio = (safeRpm - previous.rpm) / rpmRange;
      return Math.max(0, finiteOr(previous.torqueNm))
        + (Math.max(0, finiteOr(current.torqueNm)) - Math.max(0, finiteOr(previous.torqueNm))) * ratio;
    }
  }

  return Math.max(0, finiteOr(points[points.length - 1].torqueNm));
}

export function calculateDrivetrainCommand(
  input: DrivetrainInput,
  config: DrivetrainConfig,
): DrivetrainCommand {
  // 외부 gear는 1부터 시작하므로 배열 인덱스로 변환한 뒤 마지막 기어에 고정한다.
  const gearIndex = clamp(Math.trunc(input.gear) - 1, 0, Math.max(0, config.gearRatios.length - 1));
  // 반지름 0은 힘 변환의 분모가 되므로 최소 안전값을 사용한다.
  const gearRatio = Math.max(0, finiteOr(config.gearRatios[gearIndex] ?? 0));
  // 휠 반지름은 힘↔토크 변환의 공통 분모(m)다.
  const wheelRadiusM = Math.max(0.01, Math.abs(finiteOr(config.wheelRadiusM, 0.36)));
  // 페달과 클러치는 물리 입력 계약의 닫힌 범위로 다시 제한한다.
  const throttle = clamp(finiteOr(input.throttle), 0, 1);
  const clutch = clamp(finiteOr(input.clutch), 0, 1);
  // 후륜 각속도가 없던 호출도 차량 종방향 속도로 일관된 RPM을 얻는다.
  const wheelAngularSpeedRadS = finiteOr(
    input.drivenWheelAngularSpeedRadS,
    finiteOr(input.forwardSpeedMps) / wheelRadiusM,
  );
  // 클러치가 연결된 경우 바퀴 회전으로 결정되는 엔진 RPM이다.
  const coupledRpm = Math.abs(wheelAngularSpeedRadS)
    * gearRatio
    * Math.max(0, finiteOr(config.finalDriveRatio, 1))
    * 60
    / (2 * Math.PI);
  // 클러치가 분리된 경우 throttle에 따라 상승하는 독립 회전수다.
  const freeRevRpm = Math.max(0, finiteOr(config.idleRpm, 900)) + throttle * 1_500;
  // 연결 RPM과 free-rev RPM을 클러치 비율로 혼합한 목표 엔진 RPM이다.
  const targetRpm = clamp(
    Math.max(config.idleRpm, coupledRpm + throttle * 120),
    config.idleRpm,
    config.redlineRpm,
  ) * (1 - clutch) + clamp(freeRevRpm, config.idleRpm, config.redlineRpm) * clutch;
  // 엔진 RPM 응답을 유한한 dt만큼만 이동시켜 즉시 점프를 방지한다.
  const rpm = clamp(
    moveTowards(
      clamp(finiteOr(input.previousRpm, config.idleRpm), config.idleRpm, config.redlineRpm),
      targetRpm,
      Math.max(1, finiteOr(config.rpmResponseRpmPerSecond, 24_000)) * Math.max(0, finiteOr(input.dtSeconds, 0)),
    ),
    config.idleRpm,
    config.redlineRpm,
  );
  // 현재 RPM 토크 곡선에 throttle을 곱한 엔진 토크(N·m)다.
  const engineTorqueNm = throttle * interpolateEngineTorque(rpm, config);
  // 기어·final drive·효율·클러치가 반영된 바퀴 전달 토크(N·m)다.
  const driveTorqueNm = engineTorqueNm
    * gearRatio
    * Math.max(0, finiteOr(config.finalDriveRatio, 1))
    * clamp(finiteOr(config.drivetrainEfficiency, 1), 0, 1)
    * (1 - clutch);
  // 힘의 진행 방향은 차량 속도, 바퀴 회전, 기본 전진 순서로 결정한다.
  const forwardDirection = Math.sign(finiteOr(input.forwardSpeedMps) || wheelAngularSpeedRadS || 1);
  // throttle을 놓고 클러치가 연결된 회전 바퀴가 있을 때만 엔진 브레이크를 건다.
  const canEngineBrake = throttle < 0.05 && clutch < 0.95 && Math.abs(wheelAngularSpeedRadS) > 0.5;
  // 엔진 브레이크 강도를 idle~redline RPM 구간으로 정규화한다.
  const rpmRange = Math.max(1, config.redlineRpm - config.idleRpm);
  // idle에서도 작은 엔진 저항이 남고 redline에서 최대가 되도록 제한한다.
  const engineBrakeStrength = clamp((rpm - config.idleRpm) / rpmRange, 0.15, 1);
  // 조건을 만족할 때만 엔진 브레이크 토크를 생성한다.
  const engineBrakeTorqueNm = canEngineBrake
    ? Math.max(0, finiteOr(config.engineBrakeTorqueNm, 0)) * engineBrakeStrength
    : 0;
  // 엔진 브레이크를 최종 구동계 비로 바퀴 토크로 환산한다.
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
