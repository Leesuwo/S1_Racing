import RAPIER from "@dimforge/rapier3d-compat";
import {
  calculateAllWheelKinematics,
  type WheelKinematicState,
} from "./WheelKinematics";

export type RaycastWheelId = "frontLeft" | "frontRight" | "rearLeft" | "rearRight";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

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

export interface RapierChassisSnapshot {
  position: Vec3;
  rotation: { x: number; y: number; z: number; w: number };
  linearVelocity: Vec3;
  angularVelocity: Vec3;
}

export interface RapierSuspensionTelemetry {
  groundedWheelCount: number;
  chassisHeightM: number;
  referenceRideHeightM: number;
  maximumCompressionM: number;
  frontSteeringAngleRad: number;
}

export interface PlanarChassisPose {
  position: Pick<Vec3, "x" | "z">;
  velocity: Pick<Vec3, "x" | "z">;
  yawRad: number;
  yawRateRadS: number;
}

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
}

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
};

const FIXED_WHEEL_ORDER: readonly RaycastWheelId[] = [
  "frontLeft",
  "frontRight",
  "rearLeft",
  "rearRight",
];

let rapierInitialization: Promise<void> | null = null;

function initializeRapier(): Promise<void> {
  rapierInitialization ??= RAPIER.init();
  return rapierInitialization;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(value: Vec3, scalar: number): Vec3 {
  return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar };
}

function normalize(value: Vec3): Vec3 {
  const length = Math.hypot(value.x, value.y, value.z);
  if (length <= 1e-8) {
    return { x: 0, y: -1, z: 0 };
  }

  return scale(value, 1 / length);
}

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
 * Milestone 1A vertical suspension rig. It owns a Rapier dynamic chassis and
 * performs four downward scene-query raycasts against a ground collider.
 * Longitudinal tire forces remain in VehiclePhysics until Milestone 1B/1C.
 */
export class RapierChassisSuspension {
  private readonly world: RAPIER.World;
  private readonly chassis: RAPIER.RigidBody;
  private readonly wheelMounts: Record<RaycastWheelId, Vec3>;
  private readonly contacts = new Map<RaycastWheelId, RaycastWheelContact>();
  private readonly previousCompression = new Map<RaycastWheelId, number>();
  private steeringInput = 0;

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
    }
  }

  static async create(
    config: RapierChassisSuspensionConfig = DEFAULT_RAPIER_CHASSIS_SUSPENSION_CONFIG,
  ): Promise<RapierChassisSuspension> {
    await initializeRapier();

    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 120;

    const ground = RAPIER.ColliderDesc.cuboid(100, 0.2, 100)
      .setTranslation(0, -0.2, 0)
      .setFriction(1);
    world.createCollider(ground);

    const chassisBody = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, config.initialChassisHeightM, 0)
      .setAdditionalMass(config.massKg)
      .setLinearDamping(0.12)
      .setAngularDamping(3.2)
      .setCanSleep(false)
      .setCcdEnabled(true);
    const chassis = world.createRigidBody(chassisBody);
    const chassisCollider = RAPIER.ColliderDesc.cuboid(0.9, 0.18, 1.65)
      .setDensity(0)
      .setFriction(0.9);
    world.createCollider(chassisCollider, chassis);

    return new RapierChassisSuspension(config, world, chassis);
  }

  step(dtSeconds: number, steeringInput = this.steeringInput): void {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
      return;
    }

    this.steeringInput = clamp(steeringInput, -1, 1);
    this.world.timestep = dtSeconds;
    this.applySuspensionForces(dtSeconds);
    this.world.step();
    this.chassis.resetForces(false);
    this.chassis.resetTorques(false);
  }

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

  getWheelContacts(): Record<RaycastWheelId, RaycastWheelContact> {
    return Object.fromEntries(
      FIXED_WHEEL_ORDER.map((id) => [id, { ...this.contacts.get(id)! }]),
    ) as Record<RaycastWheelId, RaycastWheelContact>;
  }

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

  /**
   * The planar prototype owns X/Z position and yaw until tire forces move into
   * Rapier. This keeps the M1A vertical contact rig attached to the visible car
   * without granting Rapier a second, conflicting planar integrator.
   */
  syncPlanarPosition(position: Pick<Vec3, "x" | "z">): void {
    const translation = this.chassis.translation();
    this.chassis.setTranslation({ x: position.x, y: translation.y, z: position.z }, true);
  }

  syncPlanarPose(pose: PlanarChassisPose): void {
    const translation = this.chassis.translation();
    const linearVelocity = this.chassis.linvel();
    const halfYawRad = -pose.yawRad * 0.5;

    this.chassis.setTranslation({ x: pose.position.x, y: translation.y, z: pose.position.z }, true);
    this.chassis.setRotation({ x: 0, y: Math.sin(halfYawRad), z: 0, w: Math.cos(halfYawRad) }, true);
    this.chassis.setLinvel({ x: pose.velocity.x, y: linearVelocity.y, z: pose.velocity.z }, true);
    this.chassis.setAngvel({ x: 0, y: -pose.yawRateRadS, z: 0 }, true);
  }

  reset(): void {
    this.chassis.setTranslation({ x: 0, y: this.config.initialChassisHeightM, z: 0 }, true);
    this.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.chassis.resetForces(false);
    this.chassis.resetTorques(false);

    for (const id of FIXED_WHEEL_ORDER) {
      this.contacts.set(id, emptyContact(id));
      this.previousCompression.set(id, 0);
    }
  }

  getTelemetry(): RapierSuspensionTelemetry {
    const contacts = [...this.contacts.values()];

    return {
      groundedWheelCount: contacts.filter((contact) => contact.grounded).length,
      chassisHeightM: this.chassis.translation().y,
      referenceRideHeightM: this.getReferenceRideHeightM(),
      maximumCompressionM: Math.max(...contacts.map((contact) => contact.compressionM)),
      frontSteeringAngleRad: this.steeringInput * this.config.maxSteeringAngleRad,
    };
  }

  dispose(): void {
    this.world.free();
  }

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

  private getReferenceRideHeightM(): number {
    const staticCompressionM = clamp(
      (this.config.massKg * 9.81) / (FIXED_WHEEL_ORDER.length * this.config.springRateNPerM),
      0,
      this.config.travelM,
    );

    return this.config.mountHeightBelowCenterM + this.config.restLengthM - staticCompressionM;
  }
}
