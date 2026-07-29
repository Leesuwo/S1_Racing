/**
 * M4A 공유 Rapier 다차량 차체 충돌 세계다.
 * 차체별 cuboid collider를 하나의 World에 넣어 실제 형상·회전·질량 기반 접촉을
 * 해결한다. 추진력·타이어·AI 입력은 VehicleSimulation과 RaceSession의 책임으로 남긴다.
 */
import RAPIER from "@dimforge/rapier3d-compat";
import type { TestTrackCollisionSegment, TestTrackCurbSegment, TestTrackDefinition } from "../../tracks/TestTrack";
import type {
  RaceCollisionBodyInput,
  RaceCollisionBodyOutput,
  RaceCollisionEvent,
  RaceCollisionStepResult,
  RaceCollisionWorld,
} from "./RaceCollisionWorld";

/** M4A 차체의 초기 cuboid 반폭·반높이·반길이다. 수치는 initial_assumption이다. */
const CHASSIS_HALF_EXTENTS = { x: 0.9, y: 0.22, z: 1.65 } as const;
/** 차체 중심 높이는 평면 충돌에서 바닥과 분리하기 위한 초기 가정(m)이다. */
const CHASSIS_HEIGHT_M = 0.7;

let rapierInitialization: Promise<void> | null = null;

/** Rapier WASM 초기화를 한 번만 공유한다. */
function initializeRapier(): Promise<void> {
  rapierInitialization ??= RAPIER.init();
  return rapierInitialization;
}

/** 각도 차이를 -π..π 범위로 정규화한다. */
function normalizeAngle(angleRad: number): number {
  let normalized = angleRad;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

/** 유한한 입력만 Rapier에 전달해 NaN이 물리 세계로 퍼지지 않게 한다. */
function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** 프로젝트 yaw(+전방 -Z)를 Rapier의 Y축 quaternion으로 변환한다. */
function yawToRotation(yawRad: number): { x: number; y: number; z: number; w: number } {
  const halfYaw = -finiteOr(yawRad, 0) * 0.5;
  return { x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) };
}

/** Rapier Y축 quaternion을 프로젝트 yaw로 역변환한다. */
function rotationToYaw(rotation: { y: number; w: number }): number {
  return normalizeAngle(-2 * Math.atan2(rotation.y, rotation.w));
}

/** 트랙 선분을 Rapier 고정 cuboid로 만들어 화면과 같은 원본을 사용한다. */
function createStaticSegmentCollider(
  world: RAPIER.World,
  segment: TestTrackCollisionSegment | TestTrackCurbSegment,
): RAPIER.Collider | null {
  const deltaX = segment.end.x - segment.start.x;
  const deltaZ = segment.end.z - segment.start.z;
  const lengthM = Math.hypot(deltaX, deltaZ);
  if (lengthM <= 1e-6) return null;
  const angleRad = Math.atan2(-deltaZ, deltaX);
  const halfHeightM = Math.max(0.001, segment.heightM * 0.5);
  const halfWidthM = "thicknessM" in segment ? segment.thicknessM * 0.5 : segment.widthM * 0.5;
  const descriptor = RAPIER.ColliderDesc.cuboid(
    lengthM * 0.5,
    halfHeightM,
    Math.max(0.001, halfWidthM),
  )
    .setTranslation(
      (segment.start.x + segment.end.x) * 0.5,
      halfHeightM,
      (segment.start.z + segment.end.z) * 0.5,
    )
    .setRotation({ x: 0, y: Math.sin(angleRad * 0.5), z: 0, w: Math.cos(angleRad * 0.5) })
    .setFriction("thicknessM" in segment ? 0.82 : 1.05);
  if ("restitution" in segment) descriptor.setRestitution(Math.max(0, Math.min(1, segment.restitution)));
  return world.createCollider(descriptor);
}

/** 공유 Rapier 차체 충돌 구현체다. 생성은 WASM 초기화 때문에 비동기다. */
export class RapierMultiCarCollision implements RaceCollisionWorld {
  private readonly bodies = new Map<string, RAPIER.RigidBody>();
  private readonly colliders = new Map<string, RAPIER.Collider>();
  private constructor(private readonly world: RAPIER.World) {}

  /** 트랙 정적 경계와 동적 차체를 소유하는 공유 충돌 세계를 생성한다. */
  static async create(track?: TestTrackDefinition): Promise<RapierMultiCarCollision> {
    await initializeRapier();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 120;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(200, 0.2, 200)
        .setTranslation(0, -0.2, 0)
        .setFriction(1),
    );
    track?.collisionWalls?.forEach((segment) => createStaticSegmentCollider(world, segment));
    track?.curbs?.forEach((segment) => createStaticSegmentCollider(world, segment));
    return new RapierMultiCarCollision(world);
  }

  /** 참가자 목록과 동일한 차체를 생성하고 이후 fixed step에서 포즈를 동기화한다. */
  private ensureBodies(inputs: readonly RaceCollisionBodyInput[]): void {
    inputs.forEach((input) => {
      if (this.bodies.has(input.id)) return;
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(input.position.x, CHASSIS_HEIGHT_M, input.position.z)
          .setRotation(yawToRotation(input.yawRad))
          .setLinearDamping(0.05)
          .setAngularDamping(1.2)
          .setCanSleep(false)
          .setCcdEnabled(true)
          // 평면 레이싱을 유지하되 Y축 회전은 허용해 차체 방향과 회전 충돌을 보존한다.
          .enabledTranslations(true, false, true)
          .enabledRotations(false, true, false),
      );
      const volumeM3 = 8 * CHASSIS_HALF_EXTENTS.x * CHASSIS_HALF_EXTENTS.y * CHASSIS_HALF_EXTENTS.z;
      const densityKgPerM3 = Math.max(0.001, finiteOr(input.massKg, 780) / volumeM3);
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(CHASSIS_HALF_EXTENTS.x, CHASSIS_HALF_EXTENTS.y, CHASSIS_HALF_EXTENTS.z)
          .setDensity(densityKgPerM3)
          .setFriction(0.9),
        body,
      );
      this.bodies.set(input.id, body);
      this.colliders.set(input.id, collider);
    });
  }

  /** 입력 포즈를 Rapier에 주입하고 실제 shape solver를 한 fixed step 실행한다. */
  step(dtSeconds: number, inputs: readonly RaceCollisionBodyInput[]): RaceCollisionStepResult {
    const safeDtSeconds = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 1 / 120;
    this.ensureBodies(inputs);
    const activeIds = new Set(inputs.map((input) => input.id));
    inputs.forEach((input) => {
      const body = this.bodies.get(input.id);
      if (!body) return;
      const translation = body.translation();
      body.setTranslation({ x: finiteOr(input.position.x, translation.x), y: CHASSIS_HEIGHT_M, z: finiteOr(input.position.z, translation.z) }, true);
      body.setRotation(yawToRotation(input.yawRad), true);
      body.setLinvel({ x: finiteOr(input.velocity.x, 0), y: 0, z: finiteOr(input.velocity.z, 0) }, true);
      body.setAngvel({ x: 0, y: -finiteOr(input.yawRateRadS, 0), z: 0 }, true);
    });
    this.world.timestep = safeDtSeconds;
    this.world.step();

    const contacts: RaceCollisionEvent[] = [];
    const contactKeys = new Set<string>();
    inputs.forEach((input) => {
      const firstCollider = this.colliders.get(input.id);
      if (!firstCollider) return;
      this.world.contactPairsWith(firstCollider, (secondCollider) => {
        const secondId = [...this.colliders.entries()].find(([, collider]) => collider.handle === secondCollider.handle)?.[0];
        if (!secondId || !activeIds.has(secondId) || secondId === input.id) return;
        const ids = [input.id, secondId].sort();
        const key = ids.join("|");
        if (contactKeys.has(key)) return;
        contactKeys.add(key);
        const firstBody = this.bodies.get(ids[0]);
        const secondBody = this.bodies.get(ids[1]);
        if (!firstBody || !secondBody) return;
        const firstVelocity = firstBody.linvel();
        const secondVelocity = secondBody.linvel();
        const relativeSpeedMps = Math.hypot(
          firstVelocity.x - secondVelocity.x,
          firstVelocity.z - secondVelocity.z,
        );
        const firstPosition = firstBody.translation();
        const secondPosition = secondBody.translation();
        const centerDistanceM = Math.hypot(firstPosition.x - secondPosition.x, firstPosition.z - secondPosition.z);
        contacts.push({
          firstId: ids[0]!,
          secondId: ids[1]!,
          impactSpeedMps: relativeSpeedMps,
          // 실제 분리는 Rapier solver가 수행하고 이 값은 운영 손상량의 안정적인 계측값으로만 사용한다.
          penetrationM: Math.max(0, CHASSIS_HALF_EXTENTS.x + CHASSIS_HALF_EXTENTS.z - centerDistanceM),
        });
      });
    });

    const bodies: RaceCollisionBodyOutput[] = inputs.map((input) => {
      const body = this.bodies.get(input.id);
      if (!body) {
        return { id: input.id, position: { ...input.position }, velocity: { ...input.velocity }, yawRad: input.yawRad, yawRateRadS: input.yawRateRadS };
      }
      const translation = body.translation();
      const velocity = body.linvel();
      const rotation = body.rotation();
      return {
        id: input.id,
        position: { x: translation.x, z: translation.z },
        velocity: { x: velocity.x, z: velocity.z },
        yawRad: rotationToYaw(rotation),
        yawRateRadS: -body.angvel().y,
      };
    });
    return { bodies, contacts };
  }

  /** 그리드 리셋 시 동적 차체를 모두 정지하고 다음 입력에서 포즈를 다시 주입한다. */
  reset(): void {
    this.bodies.forEach((body) => {
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.resetForces(false);
      body.resetTorques(false);
    });
  }

  /** WASM 세계와 차체 리소스를 해제한다. */
  dispose(): void {
    this.world.free();
    this.bodies.clear();
    this.colliders.clear();
  }
}
