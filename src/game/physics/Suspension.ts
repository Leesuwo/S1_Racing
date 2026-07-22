/** 차량 평면에서 좌우·전후 위치가 고정된 네 바퀴 식별자다. */
export type WheelPosition = "frontLeft" | "frontRight" | "rearLeft" | "rearRight";

/** 휠별 스칼라 값을 같은 키 구조로 전달한다. */
export interface WheelValues {
  frontLeft: number;
  frontRight: number;
  rearLeft: number;
  rearRight: number;
}

/** 선형 스프링·댐퍼 서스펜션의 기하·계수다. 길이 단위는 m, 힘은 N이다. */
export interface SuspensionConfig {
  centerOfMassHeightM: number;
  trackWidthM: number;
  travelM: number;
  springRateNPerM: number;
  bumpDampingNsPerM: number;
  reboundDampingNsPerM: number;
}

/** 실제 차종으로 확정되지 않은 서스펜션 `initial_assumption` 값이다. */
export const DEFAULT_SUSPENSION_CONFIG: SuspensionConfig = {
  centerOfMassHeightM: 0.32,
  trackWidthM: 1.6,
  travelM: 0.08,
  springRateNPerM: 155_000,
  bumpDampingNsPerM: 9_000,
  reboundDampingNsPerM: 14_000,
};

/** 한 고정 스텝의 정적 하중·공력·가감속 입력이다. 가속도 단위는 m/s²다. */
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

/** 휠별 정상 하중·압축·스프링·댐퍼 결과다. */
export interface SuspensionStepResult {
  loadsN: WheelValues;
  compressionM: WheelValues;
  compressionVelocityMps: WheelValues;
  springForceN: WheelValues;
  damperForceN: WheelValues;
}

/** 잘못된 수치가 스프링 하중 계산으로 전파되지 않게 한다. */
function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** 압축량과 하중 전달량을 물리적으로 허용된 범위에 둔다. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 차축 하중과 좌우 하중 이동량을 두 휠 하중으로 분배한다. */
function splitAxleLoad(
  axleLoadN: number,
  lateralTransferN: number,
  outsideIsRight: boolean,
): { leftN: number; rightN: number } {
  const halfTransferN = lateralTransferN * 0.5;
  const leftN = axleLoadN * 0.5 + (outsideIsRight ? -halfTransferN : halfTransferN);
  const rightN = axleLoadN * 0.5 + (outsideIsRight ? halfTransferN : -halfTransferN);

  return {
    leftN: Math.max(0, leftN),
    rightN: Math.max(0, rightN),
  };
}

/** 휠별 수치를 모두 0으로 채운다. 리셋·접지 해제의 명시적 기본 상태다. */
export function zeroWheelValues(): WheelValues {
  return {
    frontLeft: 0,
    frontRight: 0,
    rearLeft: 0,
    rearRight: 0,
  };
}

/**
 * 하중 이동을 포함한 한 고정 스텝의 휠 하중과 선형 서스펜션 응답을 계산한다.
 * 압축 속도가 양수면 bump damping, 음수면 rebound damping을 선택하며 결과는 순수하다.
 */
export function calculateSuspensionStep(input: SuspensionStepInput): SuspensionStepResult {
  const config = input.config ?? DEFAULT_SUSPENSION_CONFIG;
  const dtSeconds = Math.max(finiteOr(input.dtSeconds, 1 / 120), 1e-6);
  const wheelBaseM = Math.max(finiteOr(input.wheelBaseM, 3.3), 0.1);
  const trackWidthM = Math.max(finiteOr(config.trackWidthM, 1.6), 0.1);
  const massKg = Math.max(finiteOr(input.massKg, 780), 0);
  const centerOfMassHeightM = Math.max(finiteOr(config.centerOfMassHeightM, 0.32), 0);

  // 종가속도 양수는 후륜으로, 횡가속도 양수는 우측 외륜으로 하중을 이동시킨다.
  const longitudinalTransferN =
    massKg * finiteOr(input.longitudinalAccelerationMps2, 0) * centerOfMassHeightM / wheelBaseM;
  const lateralTransferN =
    Math.abs(massKg * finiteOr(input.lateralAccelerationMps2, 0) * centerOfMassHeightM / trackWidthM);

  const frontAxleLoadN = Math.max(
    0,
    finiteOr(input.staticFrontAxleLoadN, 0) + finiteOr(input.frontAeroLoadN, 0) - longitudinalTransferN,
  );
  const rearAxleLoadN = Math.max(
    0,
    finiteOr(input.staticRearAxleLoadN, 0) + finiteOr(input.rearAeroLoadN, 0) + longitudinalTransferN,
  );
  const outsideIsRight = finiteOr(input.lateralAccelerationMps2, 0) >= 0;
  const front = splitAxleLoad(frontAxleLoadN, lateralTransferN, outsideIsRight);
  const rear = splitAxleLoad(rearAxleLoadN, lateralTransferN, outsideIsRight);
  const loadsN: WheelValues = {
    frontLeft: front.leftN,
    frontRight: front.rightN,
    rearLeft: rear.leftN,
    rearRight: rear.rightN,
  };

  const compressionM = zeroWheelValues();
  const compressionVelocityMps = zeroWheelValues();
  const springForceN = zeroWheelValues();
  const damperForceN = zeroWheelValues();
  const springRateNPerM = Math.max(finiteOr(config.springRateNPerM, 155_000), 1);
  const travelM = Math.max(finiteOr(config.travelM, 0.08), 0);

  for (const wheel of Object.keys(loadsN) as WheelPosition[]) {
    const targetCompressionM = clamp(loadsN[wheel] / springRateNPerM, 0, travelM);
    const previousCompression = clamp(finiteOr(input.previousCompressionM[wheel], 0), 0, travelM);
    const wheelCompressionVelocityMps = (targetCompressionM - previousCompression) / dtSeconds;
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
