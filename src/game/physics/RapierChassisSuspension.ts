/**
 * Rapier 동적 차체와 네 개의 하향 raycast 접점을 차량 타이어 모델로
 * 연결하는 3D 물리 브리지다. +X 오른쪽, +Y 위, -Z 전방을 사용하며
 * 길이·시간·힘·토크는 m·s·N·N·m이다. 설정 수치는 initial_assumption이다.
 */
import RAPIER from "@dimforge/rapier3d-compat";
import { calculateAeroForces } from "./AeroModel";
import {
  calculateAllWheelKinematics,
  type WheelKinematicState,
} from "./WheelKinematics";
import {
  calculateTireForce,
  DEFAULT_TIRE_MODEL_CONFIG,
  type TireForceState,
  type TireModelConfig,
} from "./TireModel";

/** Rapier 접점과 운동학 결과에서 공유하는 고정 바퀴 식별자다. */
export type RaycastWheelId = "frontLeft" | "frontRight" | "rearLeft" | "rearRight";

/** Rapier에서 복사한 3차원 위치·속도·힘 벡터다. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 한 바퀴의 raycast 거리·압축·접촉점과 서스펜션 힘이다. */
export interface RaycastWheelContact {
  id: RaycastWheelId;
  grounded: boolean;
  distanceM: number;
  compressionM: number;
  compressionVelocityMps: number;
  suspensionForceN: number;
  point: Vec3 | null;
  normal: Vec3 | null;
}

/** 렌더링·시뮬레이션 브리지에 전달하는 차체 포즈와 속도 스냅샷이다. */
export interface RapierChassisSnapshot {
  position: Vec3;
  rotation: { x: number; y: number; z: number; w: number };
  linearVelocity: Vec3;
  angularVelocity: Vec3;
}

/** HUD와 검증에서 읽는 Rapier 차체·타이어 요약 지표다. */
export interface RapierSuspensionTelemetry {
  groundedWheelCount: number;
  chassisHeightM: number;
  referenceRideHeightM: number;
  maximumCompressionM: number;
  frontSteeringAngleRad: number;
  totalLongitudinalTireForceN: number;
  totalLateralTireForceN: number;
  maximumSlipRatio: number;
  maximumSlipAngleRad: number;
  maximumFrictionUsage: number;
  downforceN: number;
  dragForceN: number;
}

/** 한 fixed step에 적용할 조향·구동·브레이크·표면 제어 입력이다. */
export interface RapierTireControl {
  steeringInput: number;
  rearDriveForceN?: number;
  rearDriveTorqueNm?: number;
  engineBrakeTorqueNm?: number;
  brakeForceN: number;
  surfaceGripMultiplier: number;
  surfaceDragMultiplier?: number;
}

/** 바퀴별 TireModel 결과와 Rapier 접지·회전 상태를 결합한다. */
export interface RapierWheelTireState extends TireForceState {
  id: RaycastWheelId;
  grounded: boolean;
  wheelAngularSpeedRadS: number;
}

/** 기존 평면 시뮬레이션이 Rapier 차체에 전달하는 테스트 포즈다. */
export interface PlanarChassisPose {
  position: Pick<Vec3, "x" | "z">;
  velocity: Pick<Vec3, "x" | "z">;
  yawRad: number;
  yawRateRadS: number;
}

/** 차체 형상·서스펜션·타이어·공력의 Rapier 설정이다. 단위는 필드명에 따른다. */
export interface RapierChassisSuspensionConfig {
  massKg: number;
  wheelBaseM: number;
  frontAxleDistanceM: number;
  rearAxleDistanceM: number;
  trackWidthM: number;
  wheelRadiusM: number;
  maxSteeringAngleRad: number;
  mountHeightBelowCenterM: number;
  initialChassisHeightM: number;
  restLengthM: number;
  travelM: number;
  springRateNPerM: number;
  bumpDampingNsPerM: number;
  reboundDampingNsPerM: number;
  maxSuspensionForceN: number;
  wheelRotationalInertiaKgM2: number;
  aeroDownforceCoefficient: number;
  aeroBalanceFront: number;
  dragCoefficient: number;
  tire: TireModelConfig;
}

/** 특정 차량 데이터가 없을 때 사용하는 Rapier 초기 튜닝 가정이다. */
export const DEFAULT_RAPIER_CHASSIS_SUSPENSION_CONFIG: RapierChassisSuspensionConfig = {
  massKg: 780,
  wheelBaseM: 3.3,
  frontAxleDistanceM: 1.815,
  rearAxleDistanceM: 1.485,
  trackWidthM: 1.6,
  wheelRadiusM: 0.36,
  maxSteeringAngleRad: 0.45,
  mountHeightBelowCenterM: 0.12,
  initialChassisHeightM: 0.7,
  restLengthM: 0.35,
  travelM: 0.08,
  springRateNPerM: 155_000,
  bumpDampingNsPerM: 9_000,
  reboundDampingNsPerM: 14_000,
  maxSuspensionForceN: 28_000,
  wheelRotationalInertiaKgM2: 1.15,
  aeroDownforceCoefficient: 1.25,
  aeroBalanceFront: 0.43,
  dragCoefficient: 0.42,
  tire: DEFAULT_TIRE_MODEL_CONFIG,
};

// Map과 결과 객체를 항상 같은 순서로 생성해 네 바퀴의 의미를 결정론적으로 유지한다.
const FIXED_WHEEL_ORDER: readonly RaycastWheelId[] = [
  "frontLeft",
  "frontRight",
  "rearLeft",
  "rearRight",
];

// 단순 차체 collider의 half extents(m)와 밀도 계산용 부피(m³)다.
const CHASSIS_HALF_EXTENTS = { x: 0.9, y: 0.18, z: 1.65 } as const;
const CHASSIS_COLLIDER_VOLUME_M3 =
  8 * CHASSIS_HALF_EXTENTS.x * CHASSIS_HALF_EXTENTS.y * CHASSIS_HALF_EXTENTS.z;

// WASM 초기화는 두 차량 리그가 공유해 한 번만 수행한다.
let rapierInitialization: Promise<void> | null = null;

/** Rapier WASM 초기화 Promise를 캐시해 동시 생성을 안전하게 처리한다. */
function initializeRapier(): Promise<void> {
  rapierInitialization ??= RAPIER.init();
  return rapierInitialization;
}

/** 입력과 계산 결과를 물리적으로 허용된 닫힌 구간으로 제한한다. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 위치·힘 벡터의 합성에 사용하는 3D 덧셈이다. */
function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** 두 점 또는 속도 벡터의 차이를 계산한다. */
function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** 벡터를 스칼라로 배율 조정한다. */
function scale(value: Vec3, scalar: number): Vec3 {
  return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar };
}

/** ray 방향·접촉 법선 같은 방향 벡터를 정규화한다. */
function normalize(value: Vec3): Vec3 {
  // 0 길이 입력은 raycast가 아래를 향하도록 안전한 기본 법선을 사용한다.
  const length = Math.hypot(value.x, value.y, value.z);
  if (length <= 1e-8) {
    return { x: 0, y: -1, z: 0 };
  }

  return scale(value, 1 / length);
}

/** 두 3D 벡터의 내적을 평면 투영에 사용한다. */
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** 값을 접촉 법선에 수직인 접선 평면으로 투영한다. */
function projectOntoPlane(value: Vec3, normal: Vec3): Vec3 {
  return subtract(value, scale(normal, dot(value, normal)));
}

/** Rapier 사원수 회전을 벡터에 적용한다. */
function rotateByQuaternion(vector: Vec3, rotation: { x: number; y: number; z: number; w: number }): Vec3 {
  // 명시적 곱셈 전개로 외부 3D 라이브러리 없이 동일한 회전을 계산한다.
  const qx = rotation.x;
  const qy = rotation.y;
  const qz = rotation.z;
  const qw = rotation.w;
  const ix = qw * vector.x + qy * vector.z - qz * vector.y;
  const iy = qw * vector.y + qz * vector.x - qx * vector.z;
  const iz = qw * vector.z + qx * vector.y - qy * vector.x;
  const iw = -qx * vector.x - qy * vector.y - qz * vector.z;

  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}

/** 접지되지 않은 휠의 유한한 초기 접촉 상태를 생성한다. */
function emptyContact(id: RaycastWheelId): RaycastWheelContact {
  return {
    id,
    grounded: false,
    distanceM: Number.POSITIVE_INFINITY,
    compressionM: 0,
    compressionVelocityMps: 0,
    suspensionForceN: 0,
    point: null,
    normal: null,
  };
}

/** 접지되지 않은 휠의 유한한 초기 타이어 상태를 생성한다. */
function emptyTireState(id: RaycastWheelId): RapierWheelTireState {
  return {
    id,
    grounded: false,
    wheelAngularSpeedRadS: 0,
    slipRatio: 0,
    slipAngleRad: 0,
    longitudinalForceN: 0,
    lateralForceN: 0,
    maximumForceN: 0,
    frictionUsage: 0,
  };
}

/** 구버전 steering-only 호출과 새 구조화 입력을 동일한 제어 계약으로 정규화한다. */
function normalizeTireControl(control: RapierTireControl | number): RapierTireControl {
  if (typeof control === "number") {
    // 기존 테스트·호출자가 넘기는 숫자 조향은 나머지 힘을 중립으로 채운다.
    return {
      steeringInput: control,
      rearDriveForceN: 0,
      rearDriveTorqueNm: 0,
      engineBrakeTorqueNm: 0,
      brakeForceN: 0,
      surfaceGripMultiplier: 1,
      surfaceDragMultiplier: 1,
    };
  }

  // 구조화된 입력도 각 힘·배율의 최소/최대 경계를 적용한다.
  return {
    steeringInput: clamp(control.steeringInput, -1, 1),
    rearDriveForceN: Number.isFinite(control.rearDriveForceN) ? control.rearDriveForceN : undefined,
    rearDriveTorqueNm: Number.isFinite(control.rearDriveTorqueNm) ? control.rearDriveTorqueNm : undefined,
    engineBrakeTorqueNm: Math.max(
      0,
      Number.isFinite(control.engineBrakeTorqueNm ?? 0) ? control.engineBrakeTorqueNm ?? 0 : 0,
    ),
    brakeForceN: Math.max(0, control.brakeForceN),
    surfaceGripMultiplier: clamp(control.surfaceGripMultiplier, 0, 3),
    surfaceDragMultiplier: clamp(control.surfaceDragMultiplier ?? 1, 0, 5),
  };
}

/** 설정의 차축 거리와 트레드에서 네 휠 장착점의 차체 로컬 좌표를 생성한다. */
function createWheelMounts(config: RapierChassisSuspensionConfig): Record<RaycastWheelId, Vec3> {
  // 좌우 위치는 trackWidth의 절반으로 대칭 배치한다.
  const halfTrackM = config.trackWidthM * 0.5;

  return {
    frontLeft: { x: -halfTrackM, y: -config.mountHeightBelowCenterM, z: -config.frontAxleDistanceM },
    frontRight: { x: halfTrackM, y: -config.mountHeightBelowCenterM, z: -config.frontAxleDistanceM },
    rearLeft: { x: -halfTrackM, y: -config.mountHeightBelowCenterM, z: config.rearAxleDistanceM },
    rearRight: { x: halfTrackM, y: -config.mountHeightBelowCenterM, z: config.rearAxleDistanceM },
  };
}

/**
 * Rapier owns the dynamic chassis and four downward scene-query rays. M1D
 * supplies rear-drive and engine-brake torque, while M1C calculates each
 * grounded wheel's slip and combined tire force before the Rapier world step.
 * M1E adds front/rear downforce and velocity-opposing drag at the same step.
 */
export class RapierChassisSuspension {
  /** 동적 강체와 query collider를 소유하는 Rapier 물리 월드다. */
  private readonly world: RAPIER.World;
  /** 힘과 포즈를 실제로 소유하는 단일 차체 강체다. */
  private readonly chassis: RAPIER.RigidBody;
  /** 차체 로컬 휠 장착점의 읽기 전용 설정이다. */
  private readonly wheelMounts: Record<RaycastWheelId, Vec3>;
  /** 마지막 fixed step에서 관측한 네 휠 접촉 상태다. */
  private readonly contacts = new Map<RaycastWheelId, RaycastWheelContact>();
  /** 감쇠 속도를 계산하기 위한 이전 휠 압축량(m)이다. */
  private readonly previousCompression = new Map<RaycastWheelId, number>();
  /** HUD와 구동계가 읽는 네 휠 타이어 힘 상태다. */
  private readonly tireStates = new Map<RaycastWheelId, RapierWheelTireState>();
  /** 간이 휠 회전 적분 상태(rad/s)다. */
  private readonly wheelAngularSpeeds = new Map<RaycastWheelId, number>();
  /** 마지막 fixed step에 적용한 조향 입력(-1..1)이다. */
  private steeringInput = 0;
  /** 현재 노면에서 계산한 항력 배율이다. */
  private surfaceDragMultiplier = 1;

  private constructor(
    private readonly config: RapierChassisSuspensionConfig,
    world: RAPIER.World,
    chassis: RAPIER.RigidBody,
  ) {
    // Rapier 객체와 네 바퀴별 초기 Map을 고정 순서로 구성한다.
    this.world = world;
    this.chassis = chassis;
    this.wheelMounts = createWheelMounts(config);

    for (const id of FIXED_WHEEL_ORDER) {
      this.contacts.set(id, emptyContact(id));
      this.previousCompression.set(id, 0);
      this.tireStates.set(id, emptyTireState(id));
      this.wheelAngularSpeeds.set(id, 0);
    }
  }

  static async create(
    config: RapierChassisSuspensionConfig = DEFAULT_RAPIER_CHASSIS_SUSPENSION_CONFIG,
  ): Promise<RapierChassisSuspension> {
    // 여러 차량이 동시에 생성되어도 WASM 초기화는 캐시된 Promise를 공유한다.
    await initializeRapier();

    // 현재 단계의 테스트 지면은 평탄한 120Hz 물리 월드다.
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 120;

    // 지면은 넓은 정적 collider로 raycast와 차체 충돌의 공통 기준이 된다.
    const ground = RAPIER.ColliderDesc.cuboid(100, 0.2, 100)
      .setTranslation(0, -0.2, 0)
      .setFriction(1);
    world.createCollider(ground);

    // 차체는 잠들지 않게 하고 CCD를 켜 초기 고속 접촉 누락을 줄인다.
    const chassisBody = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, config.initialChassisHeightM, 0)
      .setLinearDamping(0.12)
      .setAngularDamping(3.2)
      .setCanSleep(false)
      .setCcdEnabled(true);
    const chassis = world.createRigidBody(chassisBody);
    // 단순 box collider 부피에 맞춘 밀도로 목표 질량을 근사한다.
    const chassisDensityKgPerM3 = Math.max(0.001, config.massKg / CHASSIS_COLLIDER_VOLUME_M3);
    // 차체 collider는 지면과의 실제 접촉 및 자기 ray 제외 기준으로 사용된다.
    const chassisCollider = RAPIER.ColliderDesc.cuboid(
      CHASSIS_HALF_EXTENTS.x,
      CHASSIS_HALF_EXTENTS.y,
      CHASSIS_HALF_EXTENTS.z,
    )
      .setDensity(chassisDensityKgPerM3)
      .setFriction(0.9);
    world.createCollider(chassisCollider, chassis);

    return new RapierChassisSuspension(config, world, chassis);
  }

  /** 한 fixed step에서 서스펜션·공력·타이어 힘을 적용하고 Rapier를 진행한다. */
  step(dtSeconds: number, control: RapierTireControl | number = this.steeringInput): void {
    // 잘못된 dt는 부분 힘 적용을 남길 수 있으므로 전체 step을 건너뛴다.
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
      return;
    }

    // 숫자 legacy 입력도 새 구조화 입력으로 통일한다.
    const tireControl = normalizeTireControl(control);
    this.steeringInput = tireControl.steeringInput;
    this.surfaceDragMultiplier = tireControl.surfaceDragMultiplier ?? 1;
    this.world.timestep = dtSeconds;
    // 힘 적용 순서를 고정해야 같은 fixed step에서 모든 계층이 같은 접점을 본다.
    this.applySuspensionForces(dtSeconds);
    this.applyAeroForces(tireControl);
    this.applyTireForces(dtSeconds, tireControl);
    this.world.step();
    this.chassis.resetForces(false);
    this.chassis.resetTorques(false);
  }

  /** Rapier 차체 포즈와 선·각속도를 외부 계층용 값 객체로 복사한다. */
  getSnapshot(): RapierChassisSnapshot {
    // Rapier의 참조 객체를 노출하지 않아 렌더러가 월드를 직접 변경하지 못하게 한다.
    const position = this.chassis.translation();
    const rotation = this.chassis.rotation();
    const linearVelocity = this.chassis.linvel();
    const angularVelocity = this.chassis.angvel();

    return {
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      linearVelocity: { x: linearVelocity.x, y: linearVelocity.y, z: linearVelocity.z },
      angularVelocity: { x: angularVelocity.x, y: angularVelocity.y, z: angularVelocity.z },
    };
  }

  /** 네 휠 접촉 Map을 고정 순서의 복사 객체로 반환한다. */
  getWheelContacts(): Record<RaycastWheelId, RaycastWheelContact> {
    return Object.fromEntries(
      FIXED_WHEEL_ORDER.map((id) => [id, { ...this.contacts.get(id)! }]),
    ) as Record<RaycastWheelId, RaycastWheelContact>;
  }

  /** 현재 차체 포즈와 접점에서 네 휠의 운동학 상태를 계산한다. */
  getWheelKinematics(): Record<RaycastWheelId, WheelKinematicState> {
    // 모든 휠이 같은 Rapier 포즈 스냅샷을 사용하도록 상태를 먼저 읽는다.
    const position = this.chassis.translation();
    const rotation = this.chassis.rotation();
    const linearVelocity = this.chassis.linvel();
    const angularVelocity = this.chassis.angvel();

    return calculateAllWheelKinematics(
      {
        frontAxleDistanceM: this.config.frontAxleDistanceM,
        rearAxleDistanceM: this.config.rearAxleDistanceM,
        trackWidthM: this.config.trackWidthM,
        mountHeightBelowCenterM: this.config.mountHeightBelowCenterM,
        wheelRadiusM: this.config.wheelRadiusM,
        maxSteeringAngleRad: this.config.maxSteeringAngleRad,
      },
      {
        chassisPosition: { x: position.x, y: position.y, z: position.z },
        chassisRotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
        chassisLinearVelocity: { x: linearVelocity.x, y: linearVelocity.y, z: linearVelocity.z },
        chassisAngularVelocity: { x: angularVelocity.x, y: angularVelocity.y, z: angularVelocity.z },
        steeringInput: this.steeringInput,
        // 비접지 휠은 null로 전달해 운동학 모듈의 기본 wheel center를 사용한다.
        contactPoints: Object.fromEntries(
          FIXED_WHEEL_ORDER.map((id) => [id, this.contacts.get(id)?.point ?? null]),
        ) as Partial<Record<RaycastWheelId, Vec3 | null>>,
      },
    );
  }

  /** 네 휠의 타이어 힘·슬립·회전 상태를 복사해 외부 계층에 제공한다. */
  getWheelTireStates(): Record<RaycastWheelId, RapierWheelTireState> {
    return Object.fromEntries(
      FIXED_WHEEL_ORDER.map((id) => [id, { ...this.tireStates.get(id)! }]),
    ) as Record<RaycastWheelId, RapierWheelTireState>;
  }

  /** Legacy helper for deterministic test setup. Runtime planar ownership is Rapier from M1C onward. */
  syncPlanarPosition(position: Pick<Vec3, "x" | "z">): void {
    // 수직 위치와 수직 물리는 Rapier가 계속 소유하므로 평면 좌표만 덮어쓴다.
    const translation = this.chassis.translation();
    this.chassis.setTranslation({ x: position.x, y: translation.y, z: position.z }, true);
  }

  /** 외부 평면 포즈를 Rapier 차체의 위치·yaw·평면 속도로 동기화한다. */
  syncPlanarPose(pose: PlanarChassisPose): void {
    // 높이와 수직 속도는 유지해 기존 지면 접촉 안정성을 보존한다.
    const translation = this.chassis.translation();
    const linearVelocity = this.chassis.linvel();
    // Rapier quaternion의 Y 회전 부호는 프로젝트 physics yaw와 반대다.
    const halfYawRad = -pose.yawRad * 0.5;

    this.chassis.setTranslation({ x: pose.position.x, y: translation.y, z: pose.position.z }, true);
    this.chassis.setRotation({ x: 0, y: Math.sin(halfYawRad), z: 0, w: Math.cos(halfYawRad) }, true);
    this.chassis.setLinvel({ x: pose.velocity.x, y: linearVelocity.y, z: pose.velocity.z }, true);
    this.chassis.setAngvel({ x: 0, y: -pose.yawRateRadS, z: 0 }, true);
  }

  /** 차체와 네 휠의 동적 상태를 테스트 시작 상태로 되돌린다. */
  reset(): void {
    this.chassis.setTranslation({ x: 0, y: this.config.initialChassisHeightM, z: 0 }, true);
    this.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.chassis.resetForces(false);
    this.chassis.resetTorques(false);
    this.surfaceDragMultiplier = 1;

    for (const id of FIXED_WHEEL_ORDER) {
      this.contacts.set(id, emptyContact(id));
      this.previousCompression.set(id, 0);
      this.tireStates.set(id, emptyTireState(id));
      this.wheelAngularSpeeds.set(id, 0);
    }
  }

  /** 접지 수, 압축, 슬립, 마찰 사용률과 공력 요약을 반환한다. */
  getTelemetry(): RapierSuspensionTelemetry {
    // Map 값을 배열로 복사해 한 번의 HUD 샘플이 일관된 상태를 보게 한다.
    const contacts = [...this.contacts.values()];
    const tires = [...this.tireStates.values()];
    const aero = this.calculateCurrentAero(this.surfaceDragMultiplier);

    return {
      groundedWheelCount: contacts.filter((contact) => contact.grounded).length,
      chassisHeightM: this.chassis.translation().y,
      referenceRideHeightM: this.getReferenceRideHeightM(),
      maximumCompressionM: Math.max(...contacts.map((contact) => contact.compressionM)),
      frontSteeringAngleRad: this.steeringInput * this.config.maxSteeringAngleRad,
      totalLongitudinalTireForceN: tires.reduce((sum, tire) => sum + tire.longitudinalForceN, 0),
      totalLateralTireForceN: tires.reduce((sum, tire) => sum + tire.lateralForceN, 0),
      maximumSlipRatio: Math.max(...tires.map((tire) => Math.abs(tire.slipRatio))),
      maximumSlipAngleRad: Math.max(...tires.map((tire) => Math.abs(tire.slipAngleRad))),
      maximumFrictionUsage: Math.max(...tires.map((tire) => tire.frictionUsage)),
      downforceN: aero.downforceN,
      dragForceN: aero.dragForceN,
    };
  }

  /** Rapier 월드가 보유한 WASM 자원을 해제한다. */
  dispose(): void {
    this.world.free();
  }

  private applySuspensionForces(dtSeconds: number): void {
    // 차체 pose를 한 번 읽어 네 ray가 동일한 fixed-step 기준을 사용하게 한다.
    const translation = this.chassis.translation();
    const rotation = this.chassis.rotation();
    const rayDirection = normalize(rotateByQuaternion({ x: 0, y: -1, z: 0 }, rotation));
    const maxRayLengthM = this.config.restLengthM + this.config.travelM;

    for (const id of FIXED_WHEEL_ORDER) {
      // 로컬 장착점을 월드로 옮겨 각 휠 ray의 원점을 만든다.
      const mountOffset = rotateByQuaternion(this.wheelMounts[id], rotation);
      const origin = add({ x: translation.x, y: translation.y, z: translation.z }, mountOffset);
      const ray = new RAPIER.Ray(origin, rayDirection);
      // 차체 자신은 제외해 자기 collider를 지면 접점으로 오인하지 않게 한다.
      const hit = this.world.castRayAndGetNormal(
        ray,
        maxRayLengthM,
        true,
        undefined,
        undefined,
        undefined,
        this.chassis,
      );

      if (!hit) {
        // 공중에 뜬 휠은 이전 압축도 지워 다음 접지 때 감쇠가 튀지 않게 한다.
        this.previousCompression.set(id, 0);
        this.contacts.set(id, emptyContact(id));
        continue;
      }

      // restLength에서 ray 거리를 빼 압축량(m)을 얻고 travel 범위에 고정한다.
      const compressionM = clamp(this.config.restLengthM - hit.timeOfImpact, 0, this.config.travelM);
      const previousCompressionM = this.previousCompression.get(id) ?? 0;
      // 이전 압축과의 차이를 fixed dt로 나눠 압축 속도(m/s)를 구한다.
      const compressionVelocityMps = (compressionM - previousCompressionM) / dtSeconds;
      // 압축과 반발에 서로 다른 감쇠 계수를 적용한다.
      const dampingNsPerM = compressionVelocityMps >= 0
        ? this.config.bumpDampingNsPerM
        : this.config.reboundDampingNsPerM;
      // 스프링 + 댐퍼 힘을 양수·최대힘 범위로 제한한다.
      const suspensionForceN = clamp(
        compressionM * this.config.springRateNPerM + compressionVelocityMps * dampingNsPerM,
        0,
        this.config.maxSuspensionForceN,
      );
      const point = add(origin, scale(rayDirection, hit.timeOfImpact));
      const normal = normalize(hit.normal);

      // 접촉 법선 힘을 작용점에 적용해 차체 pitch/roll 토크도 전달한다.
      this.chassis.addForceAtPoint(scale(normal, suspensionForceN), point, true);
      this.previousCompression.set(id, compressionM);
      this.contacts.set(id, {
        id,
        grounded: true,
        distanceM: hit.timeOfImpact,
        compressionM,
        compressionVelocityMps,
        suspensionForceN,
        point,
        normal,
      });
    }
  }

  private applyTireForces(dtSeconds: number, control: RapierTireControl): void {
    // 모든 휠이 동일한 차체 포즈 스냅샷에서 접점 운동학을 계산한다.
    const wheelKinematics = this.getWheelKinematics();
    // 후륜 구동 토크와 엔진 브레이크는 좌우 후륜에 절반씩 분배한다.
    const rearDriveTorqueNm = (
      control.rearDriveTorqueNm
      ?? (control.rearDriveForceN ?? 0) * this.config.wheelRadiusM
    ) * 0.5;
    const rearEngineBrakeTorqueNm = Math.max(0, control.engineBrakeTorqueNm ?? 0) * 0.5;
    const totalBrakeTorqueNm = control.brakeForceN * this.config.wheelRadiusM;
    // 휠 관성 0은 회전 적분의 분모가 될 수 없으므로 최소값을 둔다.
    const wheelInertiaKgM2 = Math.max(0.05, this.config.wheelRotationalInertiaKgM2);

    for (const id of FIXED_WHEEL_ORDER) {
      // 이전 각속도는 이번 슬립 계산과 다음 step 회전 상태를 연결한다.
      const contact = this.contacts.get(id)!;
      const previousAngularSpeedRadS = this.wheelAngularSpeeds.get(id) ?? 0;

      if (!contact.grounded || !contact.point || !contact.normal) {
        // 비접지 휠은 힘을 적용하지 않고 회전만 천천히 감쇠한다.
        this.tireStates.set(id, emptyTireState(id));
        this.wheelAngularSpeeds.set(id, previousAngularSpeedRadS * 0.998);
        continue;
      }

      // 접점 종·횡 속도와 휠 회전에서 tire model 슬립을 계산한다.
      const kinematics = wheelKinematics[id];
      const tire = calculateTireForce(
        {
          normalForceN: contact.suspensionForceN,
          frictionCoefficient: 1.55 * control.surfaceGripMultiplier,
          longitudinalSpeedMps: kinematics.longitudinalSpeedMps,
          lateralSpeedMps: kinematics.lateralSpeedMps,
          wheelAngularSpeedRadS: previousAngularSpeedRadS,
          wheelRadiusM: this.config.wheelRadiusM,
        },
        this.config.tire,
      );
      // 경사진 접촉면에서도 바퀴 방향을 표면 접선으로 투영한다.
      const forward = normalize(projectOntoPlane(kinematics.forward, contact.normal));
      const right = normalize(projectOntoPlane(kinematics.right, contact.normal));
      const tireForce = add(
        scale(forward, tire.longitudinalForceN),
        scale(right, tire.lateralForceN),
      );
      // 현재 단계는 후륜 구동이므로 전륜에는 구동·엔진 브레이크 토크가 없다.
      const isFrontWheel = id.startsWith("front");
      const driveTorqueNm = isFrontWheel ? 0 : rearDriveTorqueNm;
      const engineBrakeTorqueNm = isFrontWheel ? 0 : rearEngineBrakeTorqueNm;
      const brakeShare = isFrontWheel ? 0.29 : 0.21;
      // 정지 근처에는 이전 각속도보다 종방향 속도를 우선해 브레이크 부호를 정한다.
      const speedDirection = Math.sign(
        Math.abs(previousAngularSpeedRadS) > 0.1
          ? previousAngularSpeedRadS
          : kinematics.longitudinalSpeedMps || 1,
      );
      const brakeTorqueNm = totalBrakeTorqueNm * brakeShare * speedDirection;
      // 토크 평형을 휠 관성으로 나눠 회전 가속도(rad/s²)를 얻는다.
      const angularAccelerationRadS2 = (
        driveTorqueNm
        - engineBrakeTorqueNm * speedDirection
        - brakeTorqueNm
        - tire.longitudinalForceN * this.config.wheelRadiusM
      ) / wheelInertiaKgM2;
      // 잘못된 힘 입력으로 휠 회전이 발산하지 않도록 ±500 rad/s에서 제한한다.
      const nextAngularSpeedRadS = clamp(
        previousAngularSpeedRadS + angularAccelerationRadS2 * dtSeconds,
        -500,
        500,
      );

      this.chassis.addForceAtPoint(tireForce, contact.point, true);
      this.wheelAngularSpeeds.set(id, nextAngularSpeedRadS);
      this.tireStates.set(id, {
        id,
        grounded: true,
        wheelAngularSpeedRadS: nextAngularSpeedRadS,
        ...tire,
      });
    }
  }

  private applyAeroForces(control: RapierTireControl): void {
    // 노면 항력 배율을 현재 입력에 반영한 뒤 공력 힘을 계산한다.
    const aero = this.calculateCurrentAero(control.surfaceDragMultiplier ?? 1);
    const translation = this.chassis.translation();
    const rotation = this.chassis.rotation();
    const linearVelocity = this.chassis.linvel();
    const horizontalSpeedMps = Math.hypot(linearVelocity.x, linearVelocity.z);

    // 정지 상태에는 속도 방향이 없으므로 항력 벡터를 만들지 않는다.
    if (aero.dragForceN > 0 && horizontalSpeedMps > 1e-6) {
      this.chassis.addForce({
        x: -linearVelocity.x / horizontalSpeedMps * aero.dragForceN,
        y: 0,
        z: -linearVelocity.z / horizontalSpeedMps * aero.dragForceN,
      }, true);
    }

    // 다운포스 작용점을 앞·뒤 차축으로 나눠 하중 배분을 유지한다.
    const frontOffset = rotateByQuaternion(
      { x: 0, y: 0, z: -this.config.frontAxleDistanceM },
      rotation,
    );
    const rearOffset = rotateByQuaternion(
      { x: 0, y: 0, z: this.config.rearAxleDistanceM },
      rotation,
    );
    const frontPoint = add(translation, frontOffset);
    const rearPoint = add(translation, rearOffset);

    this.chassis.addForceAtPoint({ x: 0, y: -aero.frontDownforceN, z: 0 }, frontPoint, true);
    this.chassis.addForceAtPoint({ x: 0, y: -aero.rearDownforceN, z: 0 }, rearPoint, true);
  }

  private calculateCurrentAero(surfaceDragMultiplier: number) {
    // 수평 속도만 사용해 수직 낙하가 항력을 만들지 않게 한다.
    const velocity = this.chassis.linvel();
    return calculateAeroForces({
      speedMps: Math.hypot(velocity.x, velocity.z),
      surfaceDragMultiplier,
    }, {
      downforceCoefficientNPerMps2: this.config.aeroDownforceCoefficient,
      dragCoefficientNPerMps2: this.config.dragCoefficient,
      frontBalance: this.config.aeroBalanceFront,
    });
  }

  private getReferenceRideHeightM(): number {
    // 차체 중량을 네 스프링에 균등 분배한 단순 기준 승차 높이다.
    const staticCompressionM = clamp(
      (this.config.massKg * 9.81) / (FIXED_WHEEL_ORDER.length * this.config.springRateNPerM),
      0,
      this.config.travelM,
    );

    return this.config.mountHeightBelowCenterM + this.config.restLengthM - staticCompressionM;
  }
}
