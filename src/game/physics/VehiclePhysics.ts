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

/** S1 평면 물리의 X/Z 벡터. +X는 오른쪽, -Z는 차량 전방이다. */
export interface Vec2 {
  x: number;
  z: number;
}

/** 물리 표면 분류 식별자다. */
export type SurfaceType = "asphalt" | "grass";

/** 노면별 그립·항력 배율을 물리 적분기에 전달한다. 배율은 무차원이다. */
export interface VehicleSurface {
  type: SurfaceType;
  gripMultiplier: number;
  dragMultiplier: number;
}

/** 차량 질량·기하·구동계·공력·서스펜션의 타입 있는 튜닝 경계다. 단위는 필드 접미사로 표시한다. */
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

/** 고정 스텝 사이에 유지되는 평면 차량 상태다. 위치는 m, 속도는 m/s, 힘은 N이다. */
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

/**
 * Rapier 브리지와 분리된 순수 평면 모델의 현재 초기 가정값이다.
 * 특정 차량 재현값으로 해석하지 않으며 실차 검증 전에는 `initial_assumption`으로 취급한다.
 */
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
  rearCorneringStiffness: 32_000,
  aeroDownforceCoefficient: 1.25,
  aeroBalanceFront: 0.43,
  dragCoefficient: 0.42,
  rollingResistance: 32,
  yawInertiaKgM2: 4_800,
  yawDamping: 1_800,
  suspension: DEFAULT_SUSPENSION_CONFIG,
};

/** 아스팔트의 기준 그립·항력 배율이다. */
export const ASPHALT_SURFACE: VehicleSurface = {
  type: "asphalt",
  gripMultiplier: 1,
  dragMultiplier: 1,
};

/** 잔디에서 그립을 낮추고 항력을 높이는 기준 배율이다. */
export const GRASS_SURFACE: VehicleSurface = {
  type: "grass",
  gripMultiplier: 0.38,
  dragMultiplier: 2.8,
};

// 내부 단위는 m/s²이며, 실제 환경별 중력 검증 전까지 표준 중력 초기값을 사용한다.
const GRAVITY_MPS2 = 9.81;
// 저속에서 slip angle 분모가 0으로 수렴하는 것을 막는 수치 안정화 임계값(m/s)이다.
const MIN_FORWARD_SPEED_FOR_SLIP = 0.5;
// 동일한 config 객체가 반복되는 120Hz 루프에서 변환 객체를 매번 만들지 않는다.
const drivetrainConfigCache = new WeakMap<VehiclePhysicsConfig, DrivetrainConfig>();

/** 물리 yaw에서 차량 전방인 -Z 단위 벡터를 만든다. */
function forwardVector(yawRad: number): Vec2 {
  return { x: Math.sin(yawRad), z: -Math.cos(yawRad) };
}

/** 물리 yaw에서 차량 오른쪽인 +X 회전 단위 벡터를 만든다. */
function rightVector(yawRad: number): Vec2 {
  return { x: Math.cos(yawRad), z: Math.sin(yawRad) };
}

/** X/Z 벡터를 다른 축에 투영할 때 사용한다. */
function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z;
}

/** 두 평면 벡터를 더한다. */
function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z };
}

/** 평면 벡터에 스칼라를 곱한다. */
function scale(value: Vec2, scalar: number): Vec2 {
  return { x: value.x * scalar, z: value.z * scalar };
}

/** 튜닝값과 입력을 지정된 범위로 제한한다. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 속도 상한을 방향을 유지한 채 적용해 비정상 수치 폭주를 막는다. */
function clampMagnitude(x: number, z: number, maxMagnitude: number): Vec2 {
  const magnitude = Math.hypot(x, z);
  if (magnitude <= maxMagnitude || magnitude === 0) {
    return { x, z };
  }

  const factor = maxMagnitude / magnitude;
  return { x: x * factor, z: z * factor };
}

/** VehiclePhysicsConfig를 순수 Drivetrain 입력 계약으로 변환하고 객체별로 캐시한다. */
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

/** 저속 횡속도 노이즈를 무시하고 나머지를 radian 슬립각으로 변환한다. */
function calculateSlipAngle(longitudinalSpeedMps: number, lateralSpeedMps: number): number {
  if (Math.abs(longitudinalSpeedMps) < MIN_FORWARD_SPEED_FOR_SLIP && Math.abs(lateralSpeedMps) < 0.1) {
    return 0;
  }

  return Math.atan2(lateralSpeedMps, Math.max(Math.abs(longitudinalSpeedMps), MIN_FORWARD_SPEED_FOR_SLIP));
}

/** 종·횡 타이어 힘의 합력이 마찰 한계를 넘지 않도록 같은 비율로 축소한다. */
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

/** 힘을 총합에 더하면서 중심에서의 yaw 토크 z 성분을 반환한다. */
function applyForceAtPoint(
  totalForce: Vec2,
  force: Vec2,
  pointFromCenter: Vec2,
): number {
  totalForce.x += force.x;
  totalForce.z += force.z;
  return pointFromCenter.x * force.z - pointFromCenter.z * force.x;
}

/** 트랙 시작 pose에서 리셋 가능한 완전한 차량 상태를 만든다. */
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

/** mutable 차량 상태와 휠별 중첩 객체를 모두 복사한다. */
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

/**
 * 차량 평면 상태를 한 고정 스텝 적분한다. 전·후 차축의 속도를 분리해 슬립각을 계산하고,
 * 공력·서스펜션·구동계·결합 타이어 힘을 같은 단계에서 합산한 뒤 semi-implicit Euler로 갱신한다.
 * 유효하지 않은 dt는 조용히 무시해 브라우저 지연이나 테스트 입력이 상태를 오염시키지 않게 한다.
 */
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

  // 구동계는 현재 휠 각속도를 우선 사용하고, 정지·초기 상태에서만 차량 속도로 대체한다.
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

  // 앞/뒤 lateral stiffness는 초기 가정이며, 두 차축의 정상 하중으로 마찰 한계를 결정한다.
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

  // 제동 배분과 조향력을 합친 뒤 타이어 마찰 원으로 제한해 한 입력이 다른 축의 힘을 무한히 침범하지 않게 한다.
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

  // 항력·구름저항은 현재 전진 방향의 반대로만 작용한다.
  const resistance = scale(forward, -(dragForceN + rollingResistanceForceN) * Math.sign(forwardSpeedMps || 1));
  totalForce.x += resistance.x;
  totalForce.z += resistance.z;

  const acceleration = scale(totalForce, 1 / config.massKg);
  // semi-implicit Euler: 힘으로 속도를 먼저 갱신한 뒤 새 속도로 위치를 적분한다.
  state.velocity.x += acceleration.x * dt;
  state.velocity.z += acceleration.z * dt;

  const cappedVelocity = clampMagnitude(state.velocity.x, state.velocity.z, 105);
  state.velocity.x = cappedVelocity.x;
  state.velocity.z = cappedVelocity.z;
  state.position.x += state.velocity.x * dt;
  state.position.z += state.velocity.z * dt;

  const yawTorque = frontTorque + rearTorque - state.yawRateRadS * config.yawDamping;
  // 토크 단위 N·m를 yaw 관성 kg·m²로 나눠 angular velocity를 갱신한다.
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

/** 한 번의 상승·하강 변속 명령을 차량의 유효 기어 범위에 적용한다. */
export function shiftGear(state: VehicleState, direction: -1 | 1, gearCount = DEFAULT_VEHICLE_CONFIG.gearRatios.length): void {
  state.gear = clamp(state.gear + direction, 1, gearCount);
}

/** 위치·방향을 제외한 동적 상태까지 초기값으로 되돌린다. */
export function resetVehicleState(state: VehicleState, position: Vec2 = { x: -10, z: 10 }, yawRad = Math.PI / 2): void {
  const initial = createInitialVehicleState(position, yawRad);
  Object.assign(state, initial);
}
