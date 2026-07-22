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

/** Rapier raycast와 로컬 운동학이 공유하는 네 휠 식별자다. */
export type RaycastWheelId = "frontLeft" | "frontRight" | "rearLeft" | "rearRight";

/** Rapier를 외부로 노출하지 않기 위한 3D 좌표 계약이다. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 한 스텝의 하향 ray 접지·스프링 결과다. 길이는 m, 힘은 N이다. */
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

/** 차체의 world pose와 선형·각속도 스냅샷이다. */
export interface RapierChassisSnapshot {
  position: Vec3;
  rotation: { x: number; y: number; z: number; w: number };
  linearVelocity: Vec3;
  angularVelocity: Vec3;
}

/** HUD와 평면 시뮬레이션 동기화에 사용하는 Rapier 요약 텔레메트리다. */
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

/** 타이어 힘 계산 전 Rapier에 전달하는 조향·구동·노면 배율이다. */
export interface RapierTireControl {
  steeringInput: number;
  rearDriveForceN?: number;
  rearDriveTorqueNm?: number;
  engineBrakeTorqueNm?: number;
  brakeForceN: number;
  surfaceGripMultiplier: number;
  surfaceDragMultiplier?: number;
}

/** 접지 여부와 휠 회전 피드백을 포함한 순수 타이어 결과다. */
export interface RapierWheelTireState extends TireForceState {
  id: RaycastWheelId;
  grounded: boolean;
  wheelAngularSpeedRadS: number;
}

/** 평면 시뮬레이션의 X/Z pose를 Rapier 차체에 주입하는 경계다. */
export interface PlanarChassisPose {
  position: Pick<Vec3, "x" | "z">;
  velocity: Pick<Vec3, "x" | "z">;
  yawRad: number;
  yawRateRadS: number;
}

/** Rapier 차체·휠·공력·타이어의 초기 가정 튜닝값이다. 단위는 필드 접미사로 표시한다. */
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

/**
 * 실차 측정으로 확정되지 않은 Rapier 브리지 초기값이다. collider 밀도는 massKg와
 * 차체 부피로 유도해 회전 관성이 0이 되는 상태를 피한다.
 */
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

// raycast·타이어·리셋·텔레메트리의 반복 순서를 고정해 테스트 결과의 순서를 안정화한다.
const FIXED_WHEEL_ORDER: readonly RaycastWheelId[] = [
  "frontLeft",
  "frontRight",
  "rearLeft",
  "rearRight",
];

// collider half extents(m)는 시각 모델과 대략 맞춘 초기 가정이다.
const CHASSIS_HALF_EXTENTS = { x: 0.9, y: 0.18, z: 1.65 } as const;
// 밀도(kg/m³)를 massKg에서 계산할 때 사용하는 cuboid 전체 부피(m³)다.
const CHASSIS_COLLIDER_VOLUME_M3 =
  8 * CHASSIS_HALF_EXTENTS.x * CHASSIS_HALF_EXTENTS.y * CHASSIS_HALF_EXTENTS.z;

let rapierInitialization: Promise<void> | null = null;

/** WebAssembly 초기화 Promise를 공유해 여러 장면 생성이 중복 초기화하지 않게 한다. */
function initializeRapier(): Promise<void> {
  rapierInitialization ??= RAPIER.init();
  return rapierInitialization;
}

/** Rapier 힘·입력 배율의 범위를 안전하게 제한한다. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 3D 벡터의 성분별 덧셈이다. */
function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** 3D 벡터의 성분별 뺄셈이다. */
function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** 벡터에 스칼라를 곱한다. */
function scale(value: Vec3, scalar: number): Vec3 {
  return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar };
}

/** ray 방향·접지 법선이 0 길이일 때 하향 방향으로 복구한다. */
function normalize(value: Vec3): Vec3 {
  const length = Math.hypot(value.x, value.y, value.z);
  if (length <= 1e-8) {
    return { x: 0, y: -1, z: 0 };
  }

  return scale(value, 1 / length);
}

/** 힘을 평면 법선 방향으로 투영할 때 사용하는 내적이다. */
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** 벡터에서 법선 방향 성분을 제거해 접지면에 놓는다. */
function projectOntoPlane(value: Vec3, normal: Vec3): Vec3 {
  return subtract(value, scale(normal, dot(value, normal)));
}

/** Rapier quaternion으로 local 장착점·방향을 world 좌표로 회전한다. */
function rotateByQuaternion(vector: Vec3, rotation: { x: number; y: number; z: number; w: number }): Vec3 {
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

/** 미접지 휠의 명시적 초기 접촉 상태다. 무한 거리는 접지 판정 실패와 구분한다. */
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

/** 미접지 휠의 힘·슬립·회전 피드백을 모두 0으로 초기화한다. */
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

/** 레거시 숫자 조향 입력과 새 구조 입력을 하나의 안전한 계약으로 정규화한다. */
function normalizeTireControl(control: RapierTireControl | number): RapierTireControl {
  if (typeof control === "number") {
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

/** 차체 중심 기준 네 휠의 local 장착점을 만든다. */
function createWheelMounts(config: RapierChassisSuspensionConfig): Record<RaycastWheelId, Vec3> {
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
  private readonly world: RAPIER.World;
  private readonly chassis: RAPIER.RigidBody;
  private readonly wheelMounts: Record<RaycastWheelId, Vec3>;
  private readonly contacts = new Map<RaycastWheelId, RaycastWheelContact>();
  private readonly previousCompression = new Map<RaycastWheelId, number>();
  private readonly tireStates = new Map<RaycastWheelId, RapierWheelTireState>();
  private readonly wheelAngularSpeeds = new Map<RaycastWheelId, number>();
  private steeringInput = 0;
  private surfaceDragMultiplier = 1;

  private constructor(
    private readonly config: RapierChassisSuspensionConfig,
    world: RAPIER.World,
    chassis: RAPIER.RigidBody,
  ) {
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

  /** Rapier WebAssembly와 접지 ground, 밀도 기반 동적 차체를 생성한다. */
  static async create(
    config: RapierChassisSuspensionConfig = DEFAULT_RAPIER_CHASSIS_SUSPENSION_CONFIG,
  ): Promise<RapierChassisSuspension> {
    await initializeRapier();

    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 120;

    // 현재 마일스톤은 평면 검증 트랙이므로 큰 정적 평면 하나만 둔다.
    const ground = RAPIER.ColliderDesc.cuboid(100, 0.2, 100)
      .setTranslation(0, -0.2, 0)
      .setFriction(1);
    world.createCollider(ground);

    const chassisBody = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, config.initialChassisHeightM, 0)
      .setLinearDamping(0.12)
      .setAngularDamping(3.2)
      .setCanSleep(false)
      .setCcdEnabled(true);
    const chassis = world.createRigidBody(chassisBody);
    // 질량을 density로 환산해 collider가 양의 회전 관성을 생성하게 한다.
    const chassisDensityKgPerM3 = Math.max(0.001, config.massKg / CHASSIS_COLLIDER_VOLUME_M3);
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

  /**
   * 고정 dt 순서로 서스펜션, 공력, 타이어 힘을 적용한 뒤 Rapier를 한 번 적분한다.
   * 적분 후 force/torque를 지워 다음 스텝에 이전 외력이 누적되지 않게 한다.
   */
  step(dtSeconds: number, control: RapierTireControl | number = this.steeringInput): void {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
      return;
    }

    const tireControl = normalizeTireControl(control);
    this.steeringInput = tireControl.steeringInput;
    this.surfaceDragMultiplier = tireControl.surfaceDragMultiplier ?? 1;
    this.world.timestep = dtSeconds;
    this.applySuspensionForces(dtSeconds);
    this.applyAeroForces(tireControl);
    this.applyTireForces(dtSeconds, tireControl);
    this.world.step();
    this.chassis.resetForces(false);
    this.chassis.resetTorques(false);
  }

  /** 렌더링·외부 시뮬레이션 동기화용 불변 복사 스냅샷을 반환한다. */
  getSnapshot(): RapierChassisSnapshot {
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

  /** 휠별 접촉 상태를 내부 Map과 분리된 객체로 반환한다. */
  getWheelContacts(): Record<RaycastWheelId, RaycastWheelContact> {
    return Object.fromEntries(
      FIXED_WHEEL_ORDER.map((id) => [id, { ...this.contacts.get(id)! }]),
    ) as Record<RaycastWheelId, RaycastWheelContact>;
  }

  /** 현재 차체 pose와 접지점을 순수 휠 운동학 계산기로 전달한다. */
  getWheelKinematics(): Record<RaycastWheelId, WheelKinematicState> {
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
        contactPoints: Object.fromEntries(
          FIXED_WHEEL_ORDER.map((id) => [id, this.contacts.get(id)?.point ?? null]),
        ) as Partial<Record<RaycastWheelId, Vec3 | null>>,
      },
    );
  }

  /** 최신 접지 휠 타이어 상태를 호출자 변형과 분리해 반환한다. */
  getWheelTireStates(): Record<RaycastWheelId, RapierWheelTireState> {
    return Object.fromEntries(
      FIXED_WHEEL_ORDER.map((id) => [id, { ...this.tireStates.get(id)! }]),
    ) as Record<RaycastWheelId, RapierWheelTireState>;
  }

  /** 결정적인 테스트 설정을 위한 레거시 위치 동기화 도우미다. 런타임 평면 pose의 소유자는 Rapier다. */
  syncPlanarPosition(position: Pick<Vec3, "x" | "z">): void {
    const translation = this.chassis.translation();
    this.chassis.setTranslation({ x: position.x, y: translation.y, z: position.z }, true);
  }

  /** 평면 pose를 Rapier 차체의 X/Z 위치·Y 회전·수평 속도로 동기화한다. */
  syncPlanarPose(pose: PlanarChassisPose): void {
    const translation = this.chassis.translation();
    const linearVelocity = this.chassis.linvel();
    const halfYawRad = -pose.yawRad * 0.5;

    this.chassis.setTranslation({ x: pose.position.x, y: translation.y, z: pose.position.z }, true);
    this.chassis.setRotation({ x: 0, y: Math.sin(halfYawRad), z: 0, w: Math.cos(halfYawRad) }, true);
    this.chassis.setLinvel({ x: pose.velocity.x, y: linearVelocity.y, z: pose.velocity.z }, true);
    this.chassis.setAngvel({ x: 0, y: -pose.yawRateRadS, z: 0 }, true);
  }

  /** 차체 pose·외력·휠 접촉·슬립·회전 피드백을 시작 상태로 되돌린다. */
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

  /** 매 스텝의 접지 수·압축·타이어 힘·공력을 HUD용 요약으로 계산한다. */
  getTelemetry(): RapierSuspensionTelemetry {
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

  /** Rapier world와 native 리소스를 해제한다. 이후 메서드 호출은 허용하지 않는다. */
  dispose(): void {
    this.world.free();
  }

  /** 각 휠 장착점에서 지면을 raycast하고 스프링·댐퍼 힘을 접지점에 적용한다. */
  private applySuspensionForces(dtSeconds: number): void {
    const translation = this.chassis.translation();
    const rotation = this.chassis.rotation();
    const rayDirection = normalize(rotateByQuaternion({ x: 0, y: -1, z: 0 }, rotation));
    const maxRayLengthM = this.config.restLengthM + this.config.travelM;

    for (const id of FIXED_WHEEL_ORDER) {
      const mountOffset = rotateByQuaternion(this.wheelMounts[id], rotation);
      const origin = add({ x: translation.x, y: translation.y, z: translation.z }, mountOffset);
      const ray = new RAPIER.Ray(origin, rayDirection);
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
        // 접지를 잃으면 이전 압축을 끊어 다음 재접지에서 비정상적인 댐퍼 impulse를 막는다.
        this.previousCompression.set(id, 0);
        this.contacts.set(id, emptyContact(id));
        continue;
      }

      const compressionM = clamp(this.config.restLengthM - hit.timeOfImpact, 0, this.config.travelM);
      const previousCompressionM = this.previousCompression.get(id) ?? 0;
      const compressionVelocityMps = (compressionM - previousCompressionM) / dtSeconds;
      const dampingNsPerM = compressionVelocityMps >= 0
        ? this.config.bumpDampingNsPerM
        : this.config.reboundDampingNsPerM;
      const suspensionForceN = clamp(
        compressionM * this.config.springRateNPerM + compressionVelocityMps * dampingNsPerM,
        0,
        this.config.maxSuspensionForceN,
      );
      const point = add(origin, scale(rayDirection, hit.timeOfImpact));
      const normal = normalize(hit.normal);

      // 스프링 힘은 ray 방향이 아니라 실제 지면 법선을 따라 적용해 경사 지면에도 일관되게 반응한다.
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

  /** 접지 휠별 슬립 기반 타이어 힘과 후륜 휠 회전 관성을 한 고정 스텝에 적용한다. */
  private applyTireForces(dtSeconds: number, control: RapierTireControl): void {
    const wheelKinematics = this.getWheelKinematics();
    const rearDriveTorqueNm = (
      control.rearDriveTorqueNm
      ?? (control.rearDriveForceN ?? 0) * this.config.wheelRadiusM
    ) * 0.5;
    const rearEngineBrakeTorqueNm = Math.max(0, control.engineBrakeTorqueNm ?? 0) * 0.5;
    const totalBrakeTorqueNm = control.brakeForceN * this.config.wheelRadiusM;
    const wheelInertiaKgM2 = Math.max(0.05, this.config.wheelRotationalInertiaKgM2);

    for (const id of FIXED_WHEEL_ORDER) {
      const contact = this.contacts.get(id)!;
      const previousAngularSpeedRadS = this.wheelAngularSpeeds.get(id) ?? 0;

      if (!contact.grounded || !contact.point || !contact.normal) {
        // 공중 휠은 타이어 힘을 만들지 않되 회전 속도는 약하게 감쇠해 재접지 spike를 줄인다.
        this.tireStates.set(id, emptyTireState(id));
        this.wheelAngularSpeeds.set(id, previousAngularSpeedRadS * 0.998);
        continue;
      }

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
      const forward = normalize(projectOntoPlane(kinematics.forward, contact.normal));
      const right = normalize(projectOntoPlane(kinematics.right, contact.normal));
      const tireForce = add(
        scale(forward, tire.longitudinalForceN),
        scale(right, tire.lateralForceN),
      );
      const isFrontWheel = id.startsWith("front");
      // 후륜 구동 토크·엔진 브레이크와 제동 배분은 현재 초기 가정이며, 앞바퀴에는 구동 토크를 주지 않는다.
      const driveTorqueNm = isFrontWheel ? 0 : rearDriveTorqueNm;
      const engineBrakeTorqueNm = isFrontWheel ? 0 : rearEngineBrakeTorqueNm;
      const brakeShare = isFrontWheel ? 0.29 : 0.21;
      const speedDirection = Math.sign(
        Math.abs(previousAngularSpeedRadS) > 0.1
          ? previousAngularSpeedRadS
          : kinematics.longitudinalSpeedMps || 1,
      );
      const brakeTorqueNm = totalBrakeTorqueNm * brakeShare * speedDirection;
      const angularAccelerationRadS2 = (
        driveTorqueNm
        - engineBrakeTorqueNm * speedDirection
        - brakeTorqueNm
        - tire.longitudinalForceN * this.config.wheelRadiusM
      ) / wheelInertiaKgM2;
      const nextAngularSpeedRadS = clamp(
        previousAngularSpeedRadS + angularAccelerationRadS2 * dtSeconds,
        -500,
        500,
      );

      // 타이어 힘은 계산된 접지점에 적용해야 횡력으로 yaw 토크가 실제 차체에 전달된다.
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

  /** 속도 반대 항력과 전·후 적용점 다운포스를 Rapier 차체에 적용한다. */
  private applyAeroForces(control: RapierTireControl): void {
    const aero = this.calculateCurrentAero(control.surfaceDragMultiplier ?? 1);
    const translation = this.chassis.translation();
    const rotation = this.chassis.rotation();
    const linearVelocity = this.chassis.linvel();
    const horizontalSpeedMps = Math.hypot(linearVelocity.x, linearVelocity.z);

    if (aero.dragForceN > 0 && horizontalSpeedMps > 1e-6) {
      // 속도가 0이면 방향을 나눌 수 없으므로 항력을 생략한다.
      this.chassis.addForce({
        x: -linearVelocity.x / horizontalSpeedMps * aero.dragForceN,
        y: 0,
        z: -linearVelocity.z / horizontalSpeedMps * aero.dragForceN,
      }, true);
    }

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

    // 전·후 차축에 나누어 작용시켜 다운포스가 차체 피치·하중에도 연결되도록 한다.
    this.chassis.addForceAtPoint({ x: 0, y: -aero.frontDownforceN, z: 0 }, frontPoint, true);
    this.chassis.addForceAtPoint({ x: 0, y: -aero.rearDownforceN, z: 0 }, rearPoint, true);
  }

  /** 현재 수평 속도로 공력 모델을 샘플링한다. */
  private calculateCurrentAero(surfaceDragMultiplier: number) {
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

  /** 정적 중력과 스프링 상수로 계산한 기준 ride height(m)다. */
  private getReferenceRideHeightM(): number {
    const staticCompressionM = clamp(
      (this.config.massKg * 9.81) / (FIXED_WHEEL_ORDER.length * this.config.springRateNPerM),
      0,
      this.config.travelM,
    );

    return this.config.mountHeightBelowCenterM + this.config.restLengthM - staticCompressionM;
  }
}
