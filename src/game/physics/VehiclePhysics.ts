/**
 * S1 Racing의 결정론적 평면 차량 물리 모델이다. +X는 오른쪽, +Y는 위,
 * -Z는 전방이며 거리·시간·질량·힘·토크는 각각 m·s·kg·N·N·m을 사용한다.
 * 설정 수치는 차량 확정값이 아닌 initial_assumption이며 주행감은 simulation_required다.
 */
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

/** 차량 물리 계산에 사용하는 평면 위치·속도 벡터다. */
export interface Vec2 {
  x: number;
  z: number;
}

/** 물리 표면의 분류 식별자다. */
export type SurfaceType = "asphalt" | "grass";

/** 표면별 타이어 그립과 항력 배율이다. */
export interface VehicleSurface {
  type: SurfaceType;
  gripMultiplier: number;
  dragMultiplier: number;
}

/** 차량 질량, 기하, 구동계, 타이어와 안정화 계수의 전체 설정이다. */
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

/** 한 fixed step 이후 차량의 위치·동역학·텔레메트리 상태다. */
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

/** 프로토타입 차량 물리에 사용하는 초기 튜닝 가정이다. 단위는 각 필드명에 따른다. */
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

/** 잔디의 감소한 그립과 증가한 항력 배율이다. */
export const GRASS_SURFACE: VehicleSurface = {
  type: "grass",
  gripMultiplier: 0.38,
  dragMultiplier: 2.8,
};

// 중력 가속도(m/s²)는 정적 축 하중과 횡가속도 계산에 공통 사용한다.
const GRAVITY_MPS2 = 9.81;
// 저속 슬립각 계산의 0 나눗셈과 조향 발산을 막는 최소 전진 속도(m/s)다.
const MIN_FORWARD_SPEED_FOR_SLIP = 0.5;
// 동일한 설정 객체에 대한 변환 비용을 줄이되 설정 변경 감지는 객체 식별자로 보장한다.
const drivetrainConfigCache = new WeakMap<VehiclePhysicsConfig, DrivetrainConfig>();

/** yaw 기준 차량 전방 단위 벡터를 반환한다. */
function forwardVector(yawRad: number): Vec2 {
  return { x: Math.sin(yawRad), z: -Math.cos(yawRad) };
}

/** yaw 기준 차량 오른쪽 단위 벡터를 반환한다. */
function rightVector(yawRad: number): Vec2 {
  return { x: Math.cos(yawRad), z: Math.sin(yawRad) };
}

/** 두 평면 벡터의 내적을 속도·힘 방향 성분에 사용한다. */
function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z;
}

/** 두 평면 벡터를 더한다. */
function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z };
}

/** 평면 벡터를 스칼라로 배율 조정한다. */
function scale(value: Vec2, scalar: number): Vec2 {
  return { x: value.x * scalar, z: value.z * scalar };
}

/** 조향·입력 보간값을 지정된 구간에 고정한다. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 최대 속도 제한으로 비정상적인 수치 발산을 방지한다. */
function clampMagnitude(x: number, z: number, maxMagnitude: number): Vec2 {
  // 이미 안전한 크기이거나 정지 상태면 원래 벡터를 보존한다.
  const magnitude = Math.hypot(x, z);
  if (magnitude <= maxMagnitude || magnitude === 0) {
    return { x, z };
  }

  // 크기만 축소하고 방향은 보존한다.
  const factor = maxMagnitude / magnitude;
  return { x: x * factor, z: z * factor };
}

/** 차량 설정을 순수 구동계 설정으로 매핑하고 객체별로 캐시한다. */
function getDrivetrainConfig(config: VehiclePhysicsConfig): DrivetrainConfig {
  // 같은 config 객체에 대한 변환 결과는 이후 fixed step에서 재사용한다.
  const cached = drivetrainConfigCache.get(config);
  if (cached) {
    return cached;
  }

  // 기본 최대 토크가 바뀐 사용자 설정만 중간 RPM 점에 반영한다.
  const torqueCurve = config.maxEngineTorqueNm === DEFAULT_TORQUE_CURVE[2].torqueNm
    ? DEFAULT_TORQUE_CURVE
    : DEFAULT_TORQUE_CURVE.map((point) => (
      point.rpm === 4_500 ? { rpm: point.rpm, torqueNm: config.maxEngineTorqueNm } : point
    ));
  // VehiclePhysicsConfig와 DrivetrainConfig의 경계를 명시적으로 변환한다.
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

/** 저속 0 나눗셈을 방어하며 차량 좌표계 기준 슬립각(rad)을 반환한다. */
function calculateSlipAngle(longitudinalSpeedMps: number, lateralSpeedMps: number): number {
  if (Math.abs(longitudinalSpeedMps) < MIN_FORWARD_SPEED_FOR_SLIP && Math.abs(lateralSpeedMps) < 0.1) {
    return 0;
  }

  return Math.atan2(lateralSpeedMps, Math.max(Math.abs(longitudinalSpeedMps), MIN_FORWARD_SPEED_FOR_SLIP));
}

/** 종·횡 타이어 힘을 결합 마찰원 안으로 동일 비율 축소한다. */
function limitCombinedTireForce(
  longitudinalForceN: number,
  lateralForceN: number,
  maximumForceN: number,
): { longitudinalForceN: number; lateralForceN: number } {
  // 두 힘의 합력이 최대력을 넘지 않으면 원래 방향과 크기를 유지한다.
  const magnitude = Math.hypot(longitudinalForceN, lateralForceN);
  if (magnitude <= maximumForceN || magnitude === 0) {
    return { longitudinalForceN, lateralForceN };
  }

  // 마찰원 경계를 넘은 경우 힘 벡터 전체를 같은 비율로 줄인다.
  const factor = maximumForceN / magnitude;
  return {
    longitudinalForceN: longitudinalForceN * factor,
    lateralForceN: lateralForceN * factor,
  };
}

/** 힘을 차체 중심에 합산하고 작용점의 yaw 토크(N·m)를 반환한다. */
function applyForceAtPoint(
  totalForce: Vec2,
  force: Vec2,
  pointFromCenter: Vec2,
): number {
  totalForce.x += force.x;
  totalForce.z += force.z;
  return pointFromCenter.x * force.z - pointFromCenter.z * force.x;
}

/** 지정된 시작 위치와 방향에서 모든 차량 상태를 중립으로 생성한다. */
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

/** 렌더 보간이나 외부 동기화에 사용할 깊은 상태 복사본을 만든다. */
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

/** 입력을 한 fixed step 동안 적분해 차량 상태를 갱신한다. */
export function stepVehicle(
  state: VehicleState,
  input: VehicleControlInput,
  dt: number,
  config: VehiclePhysicsConfig = DEFAULT_VEHICLE_CONFIG,
  surface: VehicleSurface = ASPHALT_SURFACE,
): void {
  // 호출자가 잘못된 dt를 전달하면 상태를 부분 갱신하지 않고 안전하게 무시한다.
  if (!Number.isFinite(dt) || dt <= 0) {
    return;
  }

  // 입력 계약을 다시 제한해 직접 호출하는 테스트·AI도 동일한 물리 범위를 사용한다.
  const safeSteering = clamp(input.steering, -1, 1);
  // throttle과 brake는 페달 계약의 [0, 1] 범위로 제한한다.
  const throttle = clamp(input.throttle, 0, 1);
  const brake = clamp(input.brake, 0, 1);
  // 현재 차체 방향의 직교 기저를 한 step에서 재사용한다.
  const forward = forwardVector(state.yawRad);
  const right = rightVector(state.yawRad);

  // 병진 속도를 차량 전방·우측 성분으로 분해한다.
  const forwardSpeedMps = dot(state.velocity, forward);
  // 횡속도와 전체 속도(m/s)는 타이어 힘과 조향 감쇠에 사용한다.
  const lateralSpeedMps = dot(state.velocity, right);
  const speedMps = Math.hypot(state.velocity.x, state.velocity.z);
  // 고속에서 조향 응답을 줄여 초기 평면 모델의 yaw 발산을 완화한다.
  const steeringAngleRad = safeSteering * config.maxSteeringAngleRad * clamp(1 - speedMps / 95, 0.25, 1);

  // yaw rate가 차축 오프셋에서 만드는 접점 속도를 계산한다.
  const frontVelocity = add(state.velocity, scale(right, state.yawRateRadS * config.frontAxleDistanceM));
  // rear axle의 yaw 접선 속도는 반대 부호의 오프셋을 사용한다.
  const rearVelocity = add(state.velocity, scale(right, -state.yawRateRadS * config.rearAxleDistanceM));
  // steering angle이 반영된 앞 차축의 월드 기준 방향이다.
  const frontForward = forwardVector(state.yawRad + steeringAngleRad);
  const frontRight = rightVector(state.yawRad + steeringAngleRad);

  // 조향된 앞바퀴와 차체 방향의 종·횡 속도 성분이다.
  const frontLongitudinalSpeed = dot(frontVelocity, frontForward);
  // 앞·뒤 축의 lateral speed는 각 타이어 슬립각의 입력이다.
  const frontLateralSpeed = dot(frontVelocity, frontRight);
  const rearLongitudinalSpeed = dot(rearVelocity, forward);
  const rearLateralSpeed = dot(rearVelocity, right);

  // 구동계는 기존 RPM과 외부 Rapier 후륜 각속도를 함께 읽는다.
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
  // 구동계 명령에서 이후 힘·텔레메트리에 필요한 값을 추출한다.
  const rpm = drivetrain.rpm;
  // 엔진 토크(N·m)와 종방향 순힘(N)은 별도 텔레메트리·적분 값이다.
  const engineTorqueNm = drivetrain.engineTorqueNm;
  const engineForceN = drivetrain.driveForceN - drivetrain.engineBrakeForceN;
  // 브레이크 힘은 진행 방향에 맞춰 종방향 저항으로 만든다.
  const brakeForceN = Math.sign(forwardSpeedMps || 1) * brake * config.maxBrakeForceN;
  // 현재 표면 항력 배율을 적용한 공력 결과를 계산한다.
  const aero = calculateAeroForces({ speedMps, surfaceDragMultiplier: surface.dragMultiplier }, {
    downforceCoefficientNPerMps2: config.aeroDownforceCoefficient,
    dragCoefficientNPerMps2: config.dragCoefficient,
    frontBalance: config.aeroBalanceFront,
  });
  // 공력 결과를 서스펜션 하중과 저항 계산에 분배한다.
  const downforceN = aero.downforceN;
  // 공력과 구름 저항은 이후 종가속도 추정과 실제 저항력에 함께 사용된다.
  const dragForceN = aero.dragForceN;
  const rollingResistanceForceN = config.rollingResistance * Math.abs(forwardSpeedMps);
  // 하중 이동 입력에 사용할 1차 종가속도 추정값이다.
  const longitudinalAccelerationEstimateMps2 =
    (engineForceN - brakeForceN - Math.sign(forwardSpeedMps || 1) * (dragForceN + rollingResistanceForceN)) / config.massKg;
  // 정적 하중·공력·가속도에서 네 바퀴의 정상 하중을 계산한다.
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
  // 타이어별 좌우 하중을 축 합으로 묶어 초기 모델의 축 마찰 한계로 사용한다.
  const frontNormalForceN = suspension.loadsN.frontLeft + suspension.loadsN.frontRight;
  // 뒤축 하중은 후륜 구동과 rear lateral force의 최대 한계가 된다.
  const rearNormalForceN = suspension.loadsN.rearLeft + suspension.loadsN.rearRight;
  // 두 차축의 속도 성분에서 부호 있는 슬립각(rad)을 얻는다.
  const frontSlipAngle = calculateSlipAngle(frontLongitudinalSpeed, frontLateralSpeed);
  const rearSlipAngle = calculateSlipAngle(rearLongitudinalSpeed, rearLateralSpeed);
  // 노면 배율을 기준 타이어 마찰계수에 곱한다.
  const surfaceGrip = config.tireGripCoefficient * surface.gripMultiplier;
  // 각 차축이 제공할 수 있는 결합 최대력(N)이다.
  const frontMaximumForceN = frontNormalForceN * surfaceGrip;
  const rearMaximumForceN = rearNormalForceN * surfaceGrip;

  // 슬립각에 비례한 횡력을 최대 마찰력으로 제한한다.
  const frontLateralForceN = clamp(
    -config.frontCorneringStiffness * frontSlipAngle,
    -frontMaximumForceN,
    frontMaximumForceN,
  );
  // rear slip angle도 같은 방식으로 rear normal load 한계에 묶는다.
  const rearLateralForceN = clamp(
    -config.rearCorneringStiffness * rearSlipAngle,
    -rearMaximumForceN,
    rearMaximumForceN,
  );

  // 제동력은 전후 차축에 초기 가정 비율로 나눈다.
  const frontLongitudinalForceN = -brakeForceN * 0.58;
  // rear longitudinal force에는 후륜 구동 순힘과 rear brake share가 함께 포함된다.
  const rearLongitudinalForceN = engineForceN - brakeForceN * 0.42;

  // 각 차축의 종·횡 힘을 마찰원 안으로 결합한다.
  const frontTireForce = limitCombinedTireForce(
    frontLongitudinalForceN,
    frontLateralForceN,
    frontMaximumForceN,
  );
  // 후륜 종·횡 힘도 동일한 마찰원 규칙으로 제한한다.
  const rearTireForce = limitCombinedTireForce(
    rearLongitudinalForceN,
    rearLateralForceN,
    rearMaximumForceN,
  );

  // 차축 힘을 차량 월드 좌표로 변환한다.
  const frontForce = add(
    scale(frontForward, frontTireForce.longitudinalForceN),
    scale(frontRight, frontTireForce.lateralForceN),
  );
  // rear 힘은 조향되지 않은 차체 전방·우측 기저로 월드 변환한다.
  const rearForce = add(
    scale(forward, rearTireForce.longitudinalForceN),
    scale(right, rearTireForce.lateralForceN),
  );

  // 모든 접점 힘을 합산할 버퍼와 작용점 토크다.
  const totalForce: Vec2 = { x: 0, z: 0 };
  // 앞 차축 힘이 만드는 yaw torque(N·m)다.
  const frontTorque = applyForceAtPoint(
    totalForce,
    frontForce,
    scale(forward, config.frontAxleDistanceM),
  );
  // 뒤 차축 작용점은 전방 기준 음의 longitudinal offset이다.
  const rearTorque = applyForceAtPoint(
    totalForce,
    rearForce,
    scale(forward, -config.rearAxleDistanceM),
  );

  // 항력·구름 저항은 현재 전진 방향 반대의 힘으로 적용한다.
  const resistance = scale(forward, -(dragForceN + rollingResistanceForceN) * Math.sign(forwardSpeedMps || 1));
  totalForce.x += resistance.x;
  totalForce.z += resistance.z;

  // 질량으로 힘을 나눠 속도와 위치를 semi-implicit Euler로 적분한다.
  const acceleration = scale(totalForce, 1 / config.massKg);
  state.velocity.x += acceleration.x * dt;
  state.velocity.z += acceleration.z * dt;

  // 초기 모델의 최대 평면 속도를 제한해 잘못된 설정이 무한히 커지지 않게 한다.
  const cappedVelocity = clampMagnitude(state.velocity.x, state.velocity.z, 105);
  state.velocity.x = cappedVelocity.x;
  state.velocity.z = cappedVelocity.z;
  state.position.x += state.velocity.x * dt;
  state.position.z += state.velocity.z * dt;

  // 차축 토크와 yaw damping을 합쳐 회전 상태를 적분한다.
  const yawTorque = frontTorque + rearTorque - state.yawRateRadS * config.yawDamping;
  state.yawRateRadS += yawTorque / config.yawInertiaKgM2 * dt;
  state.yawRad += state.yawRateRadS * dt;

  // 적분 결과와 같은 step의 입력·텔레메트리를 상태에 커밋한다.
  state.steeringInput = safeSteering;
  state.throttle = throttle;
  state.brake = brake;
  state.speedMps = Math.hypot(state.velocity.x, state.velocity.z);
  state.forwardSpeedMps = dot(state.velocity, forwardVector(state.yawRad));
  state.lateralSpeedMps = dot(state.velocity, rightVector(state.yawRad));
  state.lateralAccelerationMps2 = state.speedMps > 0.5
    ? Math.abs(totalForce.x * right.x + totalForce.z * right.z) / config.massKg
    : 0;
  // 이후 HUD와 외부 Rapier 리그가 읽을 공력·구동계 결과를 커밋한다.
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

/** 수동 변속 요청을 유효한 1..gearCount 범위에 적용한다. */
export function shiftGear(state: VehicleState, direction: -1 | 1, gearCount = DEFAULT_VEHICLE_CONFIG.gearRatios.length): void {
  state.gear = clamp(state.gear + direction, 1, gearCount);
}

/** 차량 상태를 데이터 정의 시작 위치·방향과 중립 구동 상태로 되돌린다. */
export function resetVehicleState(state: VehicleState, position: Vec2 = { x: -10, z: 10 }, yawRad = Math.PI / 2): void {
  // 새 객체를 만든 뒤 병합해 휠별 중첩 상태까지 함께 초기화한다.
  const initial = createInitialVehicleState(position, yawRad);
  Object.assign(state, initial);
}
