/**
 * 차체 포즈·각속도·조향에서 네 바퀴 접점의 방향과 속도를 계산하는 순수
 * 3D 운동학 모듈이다. 좌표계는 +X 오른쪽, +Y 위, -Z 전방을 사용한다.
 */
/** 고정된 바퀴 식별자다. */
export type WheelKinematicId = "frontLeft" | "frontRight" | "rearLeft" | "rearRight";

/** 운동학 계산 전용 3차원 벡터다. 단위는 호출 맥락에 따른다. */
export interface KinematicsVec3 {
  x: number;
  y: number;
  z: number;
}

/** Rapier와 독립적으로 사용하는 사원수 회전 표현이다. */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** 차축·트레드·휠 반지름과 조향 한계를 정의한다. 길이는 m, 각도는 rad다. */
export interface WheelKinematicsConfig {
  frontAxleDistanceM: number;
  rearAxleDistanceM: number;
  trackWidthM: number;
  mountHeightBelowCenterM: number;
  wheelRadiusM: number;
  maxSteeringAngleRad: number;
}

/** 차체의 포즈·속도·조향 및 선택적 접점 입력이다. */
export interface WheelKinematicsInput {
  chassisPosition: KinematicsVec3;
  chassisRotation: Quaternion;
  chassisLinearVelocity: KinematicsVec3;
  chassisAngularVelocity: KinematicsVec3;
  steeringInput: number;
  contactPoint?: KinematicsVec3 | null;
}

/** 한 바퀴의 장착점·접점·방향·접점 속도 결과다. */
export interface WheelKinematicState {
  id: WheelKinematicId;
  steeringAngleRad: number;
  mountPoint: KinematicsVec3;
  contactPoint: KinematicsVec3 | null;
  wheelCenter: KinematicsVec3;
  forward: KinematicsVec3;
  right: KinematicsVec3;
  velocity: KinematicsVec3;
  longitudinalSpeedMps: number;
  lateralSpeedMps: number;
}

// 반복 순서를 고정해 접점·타이어 상태의 좌우/전후 대응을 보존한다.
const WHEEL_IDS: readonly WheelKinematicId[] = [
  "frontLeft",
  "frontRight",
  "rearLeft",
  "rearRight",
];

/** 조향 입력과 내부 벡터 계산을 안전한 범위로 제한한다. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 두 벡터를 더해 위치·속도 합성에 사용한다. */
function add(a: KinematicsVec3, b: KinematicsVec3): KinematicsVec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** 두 벡터를 빼 접점에서 차체 중심까지의 상대 벡터를 만든다. */
function subtract(a: KinematicsVec3, b: KinematicsVec3): KinematicsVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** 벡터를 스칼라로 배율 조정한다. */
function scale(value: KinematicsVec3, scalar: number): KinematicsVec3 {
  return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar };
}

/** 두 벡터의 내적으로 방향 성분을 투영한다. */
function dot(a: KinematicsVec3, b: KinematicsVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** 회전 각속도와 장착 오프셋의 접선 속도 계산에 필요한 외적이다. */
function cross(a: KinematicsVec3, b: KinematicsVec3): KinematicsVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** 방향 벡터를 정규화하고 0 길이 입력에는 -Z 기본 방향을 사용한다. */
function normalize(value: KinematicsVec3): KinematicsVec3 {
  // 입력 벡터 길이는 회전 방향을 유지한 단위 벡터로 환산한다.
  const length = Math.hypot(value.x, value.y, value.z);
  return length > 1e-8 ? scale(value, 1 / length) : { x: 0, y: 0, z: -1 };
}

/** 사원수 회전을 벡터에 적용한다. */
export function rotateByQuaternion(vector: KinematicsVec3, rotation: Quaternion): KinematicsVec3 {
  // 사원수와 벡터의 곱을 전개해 외부 3D 라이브러리 의존 없이 동일한 회전을 만든다.
  const { x: qx, y: qy, z: qz, w: qw } = rotation;
  // q * v의 중간 사원수 성분이다.
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

/** 차체 중심 기준 네 바퀴 장착점의 로컬 좌표를 생성한다. */
export function createWheelMounts(
  config: Pick<
    WheelKinematicsConfig,
    "frontAxleDistanceM" | "rearAxleDistanceM" | "trackWidthM" | "mountHeightBelowCenterM"
  >,
): Record<WheelKinematicId, KinematicsVec3> {
  // 좌우 대칭 차체의 half-track만 계산해 모든 바퀴 배치에 재사용한다.
  const halfTrackM = config.trackWidthM * 0.5;

  return {
    frontLeft: { x: -halfTrackM, y: -config.mountHeightBelowCenterM, z: -config.frontAxleDistanceM },
    frontRight: { x: halfTrackM, y: -config.mountHeightBelowCenterM, z: -config.frontAxleDistanceM },
    rearLeft: { x: -halfTrackM, y: -config.mountHeightBelowCenterM, z: config.rearAxleDistanceM },
    rearRight: { x: halfTrackM, y: -config.mountHeightBelowCenterM, z: config.rearAxleDistanceM },
  };
}

/** 특정 바퀴의 조향 방향, 접점 위치, 선속도와 종·횡 속도 성분을 계산한다. */
export function calculateWheelKinematics(
  id: WheelKinematicId,
  config: WheelKinematicsConfig,
  input: WheelKinematicsInput,
): WheelKinematicState {
  // 로컬 장착점을 차체 회전으로 월드에 옮긴다.
  const mountLocal = createWheelMounts(config)[id];
  // 차체 회전이 반영된 장착 오프셋과 월드 장착점이다.
  const mountOffset = rotateByQuaternion(mountLocal, input.chassisRotation);
  const mountPoint = add(input.chassisPosition, mountOffset);
  // 앞바퀴만 조향하고 뒷바퀴는 차체 전방을 유지한다.
  const steeringAngleRad = id.startsWith("front")
    ? clamp(input.steeringInput, -1, 1) * config.maxSteeringAngleRad
    : 0;

  // + steering is a right turn in S1's -Z-forward coordinate convention.
  // 프로젝트의 -Z 전방 규약에서 + steering은 +X 쪽 오른쪽 회전이다.
  const wheelForwardLocal = {
    x: Math.sin(steeringAngleRad),
    y: 0,
    z: -Math.cos(steeringAngleRad),
  };
  // 조향된 바퀴의 오른쪽 단위 방향을 로컬 좌표로 정의한다.
  const wheelRightLocal = {
    x: Math.cos(steeringAngleRad),
    y: 0,
    z: Math.sin(steeringAngleRad),
  };
  const forward = normalize(rotateByQuaternion(wheelForwardLocal, input.chassisRotation));
  const right = normalize(rotateByQuaternion(wheelRightLocal, input.chassisRotation));
  // 강체의 접점 속도는 차체 병진 속도와 각속도×오프셋의 합이다.
  const velocity = add(input.chassisLinearVelocity, cross(input.chassisAngularVelocity, mountOffset));
  // 접촉점이 없으면 장착점을 wheel center의 대체 위치로 사용한다.
  const contactPoint = input.contactPoint ?? null;
  const wheelCenter = contactPoint
    ? add(contactPoint, { x: 0, y: config.wheelRadiusM, z: 0 })
    : mountPoint;

  return {
    id,
    steeringAngleRad,
    mountPoint,
    contactPoint,
    wheelCenter,
    forward,
    right,
    velocity,
    longitudinalSpeedMps: dot(velocity, forward),
    lateralSpeedMps: dot(velocity, right),
  };
}

/** 네 바퀴의 운동학 결과를 고정 식별자 순서로 계산한다. */
export function calculateAllWheelKinematics(
  config: WheelKinematicsConfig,
  input: Omit<WheelKinematicsInput, "contactPoint"> & {
    contactPoints?: Partial<Record<WheelKinematicId, KinematicsVec3 | null>>;
  },
): Record<WheelKinematicId, WheelKinematicState> {
  // 접점이 없는 바퀴도 null로 명시해 호출자가 접지 여부를 구분할 수 있게 한다.
  return Object.fromEntries(
    WHEEL_IDS.map((id) => [
      id,
      calculateWheelKinematics(id, config, {
        ...input,
        contactPoint: input.contactPoints?.[id] ?? null,
      }),
    ]),
  ) as Record<WheelKinematicId, WheelKinematicState>;
}

/** 임의의 차체 점에서 강체 속도를 계산한다. */
export function calculateWheelPointVelocity(
  chassisLinearVelocity: KinematicsVec3,
  chassisAngularVelocity: KinematicsVec3,
  point: KinematicsVec3,
  chassisPosition: KinematicsVec3,
): KinematicsVec3 {
  // 점의 상대 위치와 각속도로 회전 기여를 더한다.
  return add(chassisLinearVelocity, cross(chassisAngularVelocity, subtract(point, chassisPosition)));
}
