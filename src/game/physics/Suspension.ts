export type WheelPosition = "frontLeft" | "frontRight" | "rearLeft" | "rearRight";

export interface WheelValues {
  frontLeft: number;
  frontRight: number;
  rearLeft: number;
  rearRight: number;
}

export interface SuspensionConfig {
  centerOfMassHeightM: number;
  trackWidthM: number;
  travelM: number;
  springRateNPerM: number;
  bumpDampingNsPerM: number;
  reboundDampingNsPerM: number;
}

export const DEFAULT_SUSPENSION_CONFIG: SuspensionConfig = {
  centerOfMassHeightM: 0.32,
  trackWidthM: 1.6,
  travelM: 0.08,
  springRateNPerM: 155_000,
  bumpDampingNsPerM: 9_000,
  reboundDampingNsPerM: 14_000,
};

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

export interface SuspensionStepResult {
  loadsN: WheelValues;
  compressionM: WheelValues;
  compressionVelocityMps: WheelValues;
  springForceN: WheelValues;
  damperForceN: WheelValues;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

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

export function zeroWheelValues(): WheelValues {
  return {
    frontLeft: 0,
    frontRight: 0,
    rearLeft: 0,
    rearRight: 0,
  };
}

export function calculateSuspensionStep(input: SuspensionStepInput): SuspensionStepResult {
  const config = input.config ?? DEFAULT_SUSPENSION_CONFIG;
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
