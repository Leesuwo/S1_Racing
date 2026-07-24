import type { VehicleControlInput } from "../input/VehicleControlInput";
import { calculateAeroForces } from "./AeroModel";
import {
  calculateDrivetrainCommand,
  DEFAULT_TORQUE_CURVE,
  type DrivetrainConfig,
} from "./Drivetrain";
import {
  calculateSuspensionStep,
  DEFAULT_SUSPENSION_CONFIG,
  type SuspensionConfig,
  type WheelValues,
  zeroWheelValues,
} from "./Suspension";

export interface Vec2 {
  x: number;
  z: number;
}

export type SurfaceType = "asphalt" | "grass";

export interface VehicleSurface {
  type: SurfaceType;
  gripMultiplier: number;
  dragMultiplier: number;
}

export interface VehiclePhysicsConfig {
  massKg: number;
  wheelBaseM: number;
  frontAxleDistanceM: number;
  rearAxleDistanceM: number;
  wheelRadiusM: number;
  maxSteeringAngleRad: number;
  maxBrakeForceN: number;
  maxEngineTorqueNm: number;
  engineBrakeTorqueNm: number;
  engineRpmResponseRpmPerSecond: number;
  finalDriveRatio: number;
  drivetrainEfficiency: number;
  gearRatios: readonly number[];
  idleRpm: number;
  redlineRpm: number;
  tireGripCoefficient: number;
  frontCorneringStiffness: number;
  rearCorneringStiffness: number;
  aeroDownforceCoefficient: number;
  aeroBalanceFront: number;
  dragCoefficient: number;
  rollingResistance: number;
  yawInertiaKgM2: number;
  yawDamping: number;
  suspension: SuspensionConfig;
}

export interface VehicleState {
  position: Vec2;
  velocity: Vec2;
  yawRad: number;
  yawRateRadS: number;
  gear: number;
  rpm: number;
  steeringInput: number;
  throttle: number;
  brake: number;
  speedMps: number;
  forwardSpeedMps: number;
  lateralSpeedMps: number;
  lateralAccelerationMps2: number;
  downforceN: number;
  dragForceN: number;
  engineForceN: number;
  wheelLoadsN: WheelValues;
  wheelCompressionM: WheelValues;
  wheelCompressionVelocityMps: WheelValues;
  surface: SurfaceType;
  engineTorqueNm: number;
  driveTorqueNm: number;
  engineBrakeTorqueNm: number;
  drivenWheelAngularSpeedRadS: number;
}

export const DEFAULT_VEHICLE_CONFIG: VehiclePhysicsConfig = {
  massKg: 780,
  wheelBaseM: 3.3,
  frontAxleDistanceM: 1.815,
  rearAxleDistanceM: 1.485,
  wheelRadiusM: 0.36,
  maxSteeringAngleRad: 0.45,
  maxBrakeForceN: 14_500,
  maxEngineTorqueNm: 320,
  finalDriveRatio: 3.6,
  drivetrainEfficiency: 0.9,
  engineBrakeTorqueNm: 110,
  engineRpmResponseRpmPerSecond: 24_000,
  gearRatios: [3.2, 2.2, 1.65, 1.32, 1.1, 0.94, 0.82, 0.72],
  idleRpm: 900,
  redlineRpm: 8_000,
  tireGripCoefficient: 1.55,
  frontCorneringStiffness: 28_000,
  // 후륜의 초기 횡강성(N/rad)을 앞축보다 높게 두어 고속 복합 코너에서 과도한 후미 회전을 억제한다.
  rearCorneringStiffness: 70_000,
  aeroDownforceCoefficient: 1.25,
  aeroBalanceFront: 0.43,
  dragCoefficient: 0.42,
  rollingResistance: 32,
  yawInertiaKgM2: 4_800,
  yawDamping: 1_800,
  suspension: DEFAULT_SUSPENSION_CONFIG,
};

export const ASPHALT_SURFACE: VehicleSurface = {
  type: "asphalt",
  gripMultiplier: 1,
  dragMultiplier: 1,
};

export const GRASS_SURFACE: VehicleSurface = {
  type: "grass",
  gripMultiplier: 0.38,
  dragMultiplier: 2.8,
};

const GRAVITY_MPS2 = 9.81;
const MIN_FORWARD_SPEED_FOR_SLIP = 0.5;
const drivetrainConfigCache = new WeakMap<VehiclePhysicsConfig, DrivetrainConfig>();

function forwardVector(yawRad: number): Vec2 {
  return { x: Math.sin(yawRad), z: -Math.cos(yawRad) };
}

function rightVector(yawRad: number): Vec2 {
  return { x: Math.cos(yawRad), z: Math.sin(yawRad) };
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z;
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z };
}

function scale(value: Vec2, scalar: number): Vec2 {
  return { x: value.x * scalar, z: value.z * scalar };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampMagnitude(x: number, z: number, maxMagnitude: number): Vec2 {
  const magnitude = Math.hypot(x, z);
  if (magnitude <= maxMagnitude || magnitude === 0) {
    return { x, z };
  }

  const factor = maxMagnitude / magnitude;
  return { x: x * factor, z: z * factor };
}

function getDrivetrainConfig(config: VehiclePhysicsConfig): DrivetrainConfig {
  const cached = drivetrainConfigCache.get(config);
  if (cached) {
    return cached;
  }

  const torqueCurve = config.maxEngineTorqueNm === DEFAULT_TORQUE_CURVE[2].torqueNm
    ? DEFAULT_TORQUE_CURVE
    : DEFAULT_TORQUE_CURVE.map((point) => (
      point.rpm === 4_500 ? { rpm: point.rpm, torqueNm: config.maxEngineTorqueNm } : point
    ));
  const drivetrainConfig: DrivetrainConfig = {
    gearRatios: config.gearRatios,
    finalDriveRatio: config.finalDriveRatio,
    drivetrainEfficiency: config.drivetrainEfficiency,
    wheelRadiusM: config.wheelRadiusM,
    idleRpm: config.idleRpm,
    redlineRpm: config.redlineRpm,
    maxEngineTorqueNm: config.maxEngineTorqueNm,
    engineBrakeTorqueNm: config.engineBrakeTorqueNm,
    rpmResponseRpmPerSecond: config.engineRpmResponseRpmPerSecond,
    torqueCurve,
  };
  drivetrainConfigCache.set(config, drivetrainConfig);
  return drivetrainConfig;
}

function calculateSlipAngle(longitudinalSpeedMps: number, lateralSpeedMps: number): number {
  if (Math.abs(longitudinalSpeedMps) < MIN_FORWARD_SPEED_FOR_SLIP && Math.abs(lateralSpeedMps) < 0.1) {
    return 0;
  }

  return Math.atan2(lateralSpeedMps, Math.max(Math.abs(longitudinalSpeedMps), MIN_FORWARD_SPEED_FOR_SLIP));
}

function limitCombinedTireForce(
  longitudinalForceN: number,
  lateralForceN: number,
  maximumForceN: number,
): { longitudinalForceN: number; lateralForceN: number } {
  const magnitude = Math.hypot(longitudinalForceN, lateralForceN);
  if (magnitude <= maximumForceN || magnitude === 0) {
    return { longitudinalForceN, lateralForceN };
  }

  const factor = maximumForceN / magnitude;
  return {
    longitudinalForceN: longitudinalForceN * factor,
    lateralForceN: lateralForceN * factor,
  };
}

function applyForceAtPoint(
  totalForce: Vec2,
  force: Vec2,
  pointFromCenter: Vec2,
): number {
  totalForce.x += force.x;
  totalForce.z += force.z;
  return pointFromCenter.x * force.z - pointFromCenter.z * force.x;
}

export function createInitialVehicleState(
  position: Vec2 = { x: -10, z: 10 },
  yawRad = Math.PI / 2,
): VehicleState {
  return {
    position: { ...position },
    velocity: { x: 0, z: 0 },
    yawRad,
    yawRateRadS: 0,
    gear: 1,
    rpm: DEFAULT_VEHICLE_CONFIG.idleRpm,
    steeringInput: 0,
    throttle: 0,
    brake: 0,
    speedMps: 0,
    forwardSpeedMps: 0,
    lateralSpeedMps: 0,
    lateralAccelerationMps2: 0,
    downforceN: 0,
    dragForceN: 0,
    engineForceN: 0,
    wheelLoadsN: zeroWheelValues(),
    wheelCompressionM: zeroWheelValues(),
    wheelCompressionVelocityMps: zeroWheelValues(),
    surface: "asphalt",
    engineTorqueNm: 0,
    driveTorqueNm: 0,
    engineBrakeTorqueNm: 0,
    drivenWheelAngularSpeedRadS: 0,
  };
}

export function cloneVehicleState(state: VehicleState): VehicleState {
  return {
    ...state,
    position: { ...state.position },
    velocity: { ...state.velocity },
    wheelLoadsN: { ...state.wheelLoadsN },
    wheelCompressionM: { ...state.wheelCompressionM },
    wheelCompressionVelocityMps: { ...state.wheelCompressionVelocityMps },
  };
}

export function stepVehicle(
  state: VehicleState,
  input: VehicleControlInput,
  dt: number,
  config: VehiclePhysicsConfig = DEFAULT_VEHICLE_CONFIG,
  surface: VehicleSurface = ASPHALT_SURFACE,
): void {
  if (!Number.isFinite(dt) || dt <= 0) {
    return;
  }

  const safeSteering = clamp(input.steering, -1, 1);
  const throttle = clamp(input.throttle, 0, 1);
  const brake = clamp(input.brake, 0, 1);
  const forward = forwardVector(state.yawRad);
  const right = rightVector(state.yawRad);

  const forwardSpeedMps = dot(state.velocity, forward);
  const lateralSpeedMps = dot(state.velocity, right);
  const speedMps = Math.hypot(state.velocity.x, state.velocity.z);
  const steeringAngleRad = safeSteering * config.maxSteeringAngleRad * clamp(1 - speedMps / 95, 0.25, 1);

  const frontVelocity = add(state.velocity, scale(right, state.yawRateRadS * config.frontAxleDistanceM));
  const rearVelocity = add(state.velocity, scale(right, -state.yawRateRadS * config.rearAxleDistanceM));
  const frontForward = forwardVector(state.yawRad + steeringAngleRad);
  const frontRight = rightVector(state.yawRad + steeringAngleRad);

  const frontLongitudinalSpeed = dot(frontVelocity, frontForward);
  const frontLateralSpeed = dot(frontVelocity, frontRight);
  const rearLongitudinalSpeed = dot(rearVelocity, forward);
  const rearLateralSpeed = dot(rearVelocity, right);

  const drivetrain = calculateDrivetrainCommand({
    gear: state.gear,
    throttle,
    clutch: input.clutch,
    forwardSpeedMps,
    drivenWheelAngularSpeedRadS: Math.abs(state.drivenWheelAngularSpeedRadS) > 0.5
      ? state.drivenWheelAngularSpeedRadS
      : forwardSpeedMps / config.wheelRadiusM,
    previousRpm: state.rpm,
    dtSeconds: dt,
  }, getDrivetrainConfig(config));
  const rpm = drivetrain.rpm;
  const engineTorqueNm = drivetrain.engineTorqueNm;
  const engineForceN = drivetrain.driveForceN - drivetrain.engineBrakeForceN;
  const brakeForceN = Math.sign(forwardSpeedMps || 1) * brake * config.maxBrakeForceN;
  const aero = calculateAeroForces({ speedMps, surfaceDragMultiplier: surface.dragMultiplier }, {
    downforceCoefficientNPerMps2: config.aeroDownforceCoefficient,
    dragCoefficientNPerMps2: config.dragCoefficient,
    frontBalance: config.aeroBalanceFront,
  });
  const downforceN = aero.downforceN;
  const dragForceN = aero.dragForceN;
  const rollingResistanceForceN = config.rollingResistance * Math.abs(forwardSpeedMps);
  const longitudinalAccelerationEstimateMps2 =
    (engineForceN - brakeForceN - Math.sign(forwardSpeedMps || 1) * (dragForceN + rollingResistanceForceN)) / config.massKg;
  const suspension = calculateSuspensionStep({
    massKg: config.massKg,
    wheelBaseM: config.wheelBaseM,
    staticFrontAxleLoadN: config.massKg * GRAVITY_MPS2 * (config.rearAxleDistanceM / config.wheelBaseM),
    staticRearAxleLoadN: config.massKg * GRAVITY_MPS2 * (config.frontAxleDistanceM / config.wheelBaseM),
    frontAeroLoadN: downforceN * config.aeroBalanceFront,
    rearAeroLoadN: downforceN * (1 - config.aeroBalanceFront),
    longitudinalAccelerationMps2: longitudinalAccelerationEstimateMps2,
    lateralAccelerationMps2: state.lateralAccelerationMps2,
    previousCompressionM: state.wheelCompressionM,
    dtSeconds: dt,
    config: config.suspension,
  });
  const frontNormalForceN = suspension.loadsN.frontLeft + suspension.loadsN.frontRight;
  const rearNormalForceN = suspension.loadsN.rearLeft + suspension.loadsN.rearRight;
  const frontSlipAngle = calculateSlipAngle(frontLongitudinalSpeed, frontLateralSpeed);
  const rearSlipAngle = calculateSlipAngle(rearLongitudinalSpeed, rearLateralSpeed);
  const surfaceGrip = config.tireGripCoefficient * surface.gripMultiplier;
  const frontMaximumForceN = frontNormalForceN * surfaceGrip;
  const rearMaximumForceN = rearNormalForceN * surfaceGrip;

  const frontLateralForceN = clamp(
    -config.frontCorneringStiffness * frontSlipAngle,
    -frontMaximumForceN,
    frontMaximumForceN,
  );
  const rearLateralForceN = clamp(
    -config.rearCorneringStiffness * rearSlipAngle,
    -rearMaximumForceN,
    rearMaximumForceN,
  );

  const frontLongitudinalForceN = -brakeForceN * 0.58;
  const rearLongitudinalForceN = engineForceN - brakeForceN * 0.42;

  const frontTireForce = limitCombinedTireForce(
    frontLongitudinalForceN,
    frontLateralForceN,
    frontMaximumForceN,
  );
  const rearTireForce = limitCombinedTireForce(
    rearLongitudinalForceN,
    rearLateralForceN,
    rearMaximumForceN,
  );

  const frontForce = add(
    scale(frontForward, frontTireForce.longitudinalForceN),
    scale(frontRight, frontTireForce.lateralForceN),
  );
  const rearForce = add(
    scale(forward, rearTireForce.longitudinalForceN),
    scale(right, rearTireForce.lateralForceN),
  );

  const totalForce: Vec2 = { x: 0, z: 0 };
  const frontTorque = applyForceAtPoint(
    totalForce,
    frontForce,
    scale(forward, config.frontAxleDistanceM),
  );
  const rearTorque = applyForceAtPoint(
    totalForce,
    rearForce,
    scale(forward, -config.rearAxleDistanceM),
  );

  const resistance = scale(forward, -(dragForceN + rollingResistanceForceN) * Math.sign(forwardSpeedMps || 1));
  totalForce.x += resistance.x;
  totalForce.z += resistance.z;

  const acceleration = scale(totalForce, 1 / config.massKg);
  state.velocity.x += acceleration.x * dt;
  state.velocity.z += acceleration.z * dt;

  const cappedVelocity = clampMagnitude(state.velocity.x, state.velocity.z, 105);
  state.velocity.x = cappedVelocity.x;
  state.velocity.z = cappedVelocity.z;
  state.position.x += state.velocity.x * dt;
  state.position.z += state.velocity.z * dt;

  const yawTorque = frontTorque + rearTorque - state.yawRateRadS * config.yawDamping;
  state.yawRateRadS += yawTorque / config.yawInertiaKgM2 * dt;
  state.yawRad += state.yawRateRadS * dt;

  state.steeringInput = safeSteering;
  state.throttle = throttle;
  state.brake = brake;
  state.speedMps = Math.hypot(state.velocity.x, state.velocity.z);
  state.forwardSpeedMps = dot(state.velocity, forwardVector(state.yawRad));
  state.lateralSpeedMps = dot(state.velocity, rightVector(state.yawRad));
  state.lateralAccelerationMps2 = state.speedMps > 0.5
    ? Math.abs(totalForce.x * right.x + totalForce.z * right.z) / config.massKg
    : 0;
  state.downforceN = downforceN;
  state.dragForceN = dragForceN;
  state.engineForceN = engineForceN;
  state.engineTorqueNm = engineTorqueNm;
  state.driveTorqueNm = drivetrain.driveTorqueNm;
  state.engineBrakeTorqueNm = drivetrain.wheelEngineBrakeTorqueNm;
  state.drivenWheelAngularSpeedRadS = drivetrain.wheelAngularSpeedRadS;
  state.wheelLoadsN = suspension.loadsN;
  state.wheelCompressionM = suspension.compressionM;
  state.wheelCompressionVelocityMps = suspension.compressionVelocityMps;
  state.rpm = rpm;
  state.surface = surface.type;
}

export function shiftGear(state: VehicleState, direction: -1 | 1, gearCount = DEFAULT_VEHICLE_CONFIG.gearRatios.length): void {
  state.gear = clamp(state.gear + direction, 1, gearCount);
}

export function resetVehicleState(state: VehicleState, position: Vec2 = { x: -10, z: 10 }, yawRad = Math.PI / 2): void {
  const initial = createInitialVehicleState(position, yawRad);
  Object.assign(state, initial);
}
