/**
 * 차축 하중 이동과 네 바퀴 스프링·댐퍼 상태를 계산하는 순수 서스펜션 모델이다.
 * 길이 단위는 m, 하중은 N, 감쇠 계수는 N·s/m이며 수치는 initial_assumption이다.
 */
/** 차량 기준으로 식별하는 네 바퀴 위치다. */
export type WheelPosition = "frontLeft" | "frontRight" | "rearLeft" | "rearRight";

/** 네 바퀴에 대응하는 값을 한 객체로 묶은 상태다. */
export interface WheelValues {
  frontLeft: number;
  frontRight: number;
  rearLeft: number;
  rearRight: number;
}

/** 하중 이동과 스프링·댐퍼 계산에 필요한 차체 설정이다. */
export interface SuspensionConfig {
  centerOfMassHeightM: number;
  trackWidthM: number;
  travelM: number;
  springRateNPerM: number;
  bumpDampingNsPerM: number;
  reboundDampingNsPerM: number;
}

/** 차량 확정 데이터가 없을 때 사용하는 초기 서스펜션 가정이다. */
export const DEFAULT_SUSPENSION_CONFIG: SuspensionConfig = {
  centerOfMassHeightM: 0.32,
  trackWidthM: 1.6,
  travelM: 0.08,
  springRateNPerM: 155_000,
  bumpDampingNsPerM: 9_000,
  reboundDampingNsPerM: 14_000,
};

/** 한 fixed step에서 서스펜션이 읽는 하중·가속도·이전 압축 상태다. */
export interface SuspensionStepInput {
  massKg: number;
  wheelBaseM: number;
  staticFrontAxleLoadN: number;
  staticRearAxleLoadN: number;
  frontAeroLoadN: number;
  rearAeroLoadN: number;
  longitudinalAccelerationMps2: number;
  lateralAccelerationMps2: number;
  previousCompressionM: WheelValues;
  dtSeconds: number;
  config?: SuspensionConfig;
}

/** 네 바퀴의 하중과 압축·힘 결과다. */
export interface SuspensionStepResult {
  loadsN: WheelValues;
  compressionM: WheelValues;
  compressionVelocityMps: WheelValues;
  springForceN: WheelValues;
  damperForceN: WheelValues;
}

/** 외부 입력이 만든 비정상 수치를 안전한 대체값으로 바꾼다. */
function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** 압축량과 하중을 물리적으로 허용된 범위에 고정한다. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 차축 전체 하중을 좌우 바퀴로 나누고 바깥쪽 하중을 반영한다. */
function splitAxleLoad(
  axleLoadN: number,
  lateralTransferN: number,
  outsideIsRight: boolean,
): { leftN: number; rightN: number } {
  // lateralTransferN은 두 바퀴 사이의 총 이동량이므로 각 바퀴에는 절반씩 반영한다.
  const halfTransferN = lateralTransferN * 0.5;
  // 바깥쪽이 어느 방향인지에 따라 좌우 하중을 반대로 배분한다.
  const leftN = axleLoadN * 0.5 + (outsideIsRight ? -halfTransferN : halfTransferN);
  const rightN = axleLoadN * 0.5 + (outsideIsRight ? halfTransferN : -halfTransferN);

  return {
    leftN: Math.max(0, leftN),
    rightN: Math.max(0, rightN),
  };
}

/** 네 바퀴 값을 중립 상태인 0으로 초기화한다. */
export function zeroWheelValues(): WheelValues {
  return {
    frontLeft: 0,
    frontRight: 0,
    rearLeft: 0,
    rearRight: 0,
  };
}

/** 한 fixed step의 축 하중 이동, 목표 압축량, 스프링·댐퍼 힘을 계산한다. */
export function calculateSuspensionStep(input: SuspensionStepInput): SuspensionStepResult {
  // 선택적 설정이 없을 때도 동일한 기본 단위와 방어값으로 계산한다.
  const config = input.config ?? DEFAULT_SUSPENSION_CONFIG;
  // dt와 기하 치수는 압축 속도·하중 이동의 분모이므로 최소값을 둔다.
  const dtSeconds = Math.max(finiteOr(input.dtSeconds, 1 / 120), 1e-6);
  const wheelBaseM = Math.max(finiteOr(input.wheelBaseM, 3.3), 0.1);
  const trackWidthM = Math.max(finiteOr(config.trackWidthM, 1.6), 0.1);
  const massKg = Math.max(finiteOr(input.massKg, 780), 0);
  const centerOfMassHeightM = Math.max(finiteOr(config.centerOfMassHeightM, 0.32), 0);

  // Positive longitudinal acceleration transfers load rearward. Positive
  // lateral acceleration means the vehicle is accelerating to the right, so
  // the right-side wheels are the outside wheels.
  const longitudinalTransferN =
    massKg * finiteOr(input.longitudinalAccelerationMps2, 0) * centerOfMassHeightM / wheelBaseM;
  // lateral acceleration의 절대값으로 좌우 하중 이동량(N)을 계산한다.
  const lateralTransferN =
    Math.abs(massKg * finiteOr(input.lateralAccelerationMps2, 0) * centerOfMassHeightM / trackWidthM);

  const frontAxleLoadN = Math.max(
    0,
    finiteOr(input.staticFrontAxleLoadN, 0) + finiteOr(input.frontAeroLoadN, 0) - longitudinalTransferN,
  );
  // 가속 시 rear axle에 더해지는 총 rear normal load(N)다.
  const rearAxleLoadN = Math.max(
    0,
    finiteOr(input.staticRearAxleLoadN, 0) + finiteOr(input.rearAeroLoadN, 0) + longitudinalTransferN,
  );
  // 양의 횡가속도를 우회전·우측 바깥쪽으로 해석한다.
  const outsideIsRight = finiteOr(input.lateralAccelerationMps2, 0) >= 0;
  const front = splitAxleLoad(frontAxleLoadN, lateralTransferN, outsideIsRight);
  const rear = splitAxleLoad(rearAxleLoadN, lateralTransferN, outsideIsRight);
  const loadsN: WheelValues = {
    frontLeft: front.leftN,
    frontRight: front.rightN,
    rearLeft: rear.leftN,
    rearRight: rear.rightN,
  };

  // 다음 상태를 채울 네 바퀴별 출력 버퍼다.
  // 네 바퀴 결과를 채울 상태 버퍼다.
  const compressionM = zeroWheelValues();
  const compressionVelocityMps = zeroWheelValues();
  const springForceN = zeroWheelValues();
  const damperForceN = zeroWheelValues();
  // 스프링 계수와 travel은 압축량을 계산하는 설정 단위 그대로 사용한다.
  const springRateNPerM = Math.max(finiteOr(config.springRateNPerM, 155_000), 1);
  const travelM = Math.max(finiteOr(config.travelM, 0.08), 0);

  // 각 바퀴의 하중을 스프링 변위로 바꾸고 이전 상태 대비 감쇠력을 계산한다.
  for (const wheel of Object.keys(loadsN) as WheelPosition[]) {
    // 목표 압축량을 travel 안에 제한해 과도한 공력·하중에도 상태가 발산하지 않게 한다.
    const targetCompressionM = clamp(loadsN[wheel] / springRateNPerM, 0, travelM);
    // 이전 압축과의 차이를 dt로 나누어 압축 속도(m/s)를 얻는다.
    const previousCompression = clamp(finiteOr(input.previousCompressionM[wheel], 0), 0, travelM);
    // 현재 목표 압축과 이전 압축의 차이를 속도(m/s)로 환산한다.
    const wheelCompressionVelocityMps = (targetCompressionM - previousCompression) / dtSeconds;
    // 압축과 반발에 서로 다른 감쇠 계수를 적용한다.
    const dampingRate = wheelCompressionVelocityMps >= 0
      ? config.bumpDampingNsPerM
      : config.reboundDampingNsPerM;

    compressionM[wheel] = targetCompressionM;
    compressionVelocityMps[wheel] = wheelCompressionVelocityMps;
    springForceN[wheel] = targetCompressionM * springRateNPerM;
    damperForceN[wheel] = wheelCompressionVelocityMps * dampingRate;
  }

  return {
    loadsN,
    compressionM,
    compressionVelocityMps,
    springForceN,
    damperForceN,
  };
}
