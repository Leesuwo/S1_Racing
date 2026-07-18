export interface TorqueCurvePoint {
  rpm: number;
  torqueNm: number;
}

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

export interface DrivetrainInput {
  gear: number;
  throttle: number;
  clutch: number;
  forwardSpeedMps: number;
  drivenWheelAngularSpeedRadS: number;
  previousRpm: number;
  dtSeconds: number;
}

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

export const DEFAULT_TORQUE_CURVE: readonly TorqueCurvePoint[] = [
  { rpm: 900, torqueNm: 210 },
  { rpm: 2_500, torqueNm: 285 },
  { rpm: 4_500, torqueNm: 320 },
  { rpm: 6_500, torqueNm: 305 },
  { rpm: 8_000, torqueNm: 245 },
];

function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maxDelta;
}

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
