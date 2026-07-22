/** 고정된 네 바퀴의 운동학 식별자다. */
export type WheelKinematicId = "frontLeft" | "frontRight" | "rearLeft" | "rearRight";

/** Rapier와 무관하게 사용하는 3D 벡터 계약이다. 좌표 단위는 m, 속도는 m/s다. */
export interface KinematicsVec3 {
  x: number;
  y: number;
  z: number;
}

/** 회전 경계에서 사용하는 정규화 quaternion이다. */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** 차체 중심 기준 휠 장착점과 조향 최대각이다. 거리 단위는 m, 각도는 radian이다. */
export interface WheelKinematicsConfig {
  frontAxleDistanceM: number;
  rearAxleDistanceM: number;
  trackWidthM: number;
  mountHeightBelowCenterM: number;
  wheelRadiusM: number;
  maxSteeringAngleRad: number;
}

/** 현재 차체 pose와 실제 접지점 선택 입력이다. */
export interface WheelKinematicsInput {
  chassisPosition: KinematicsVec3;
  chassisRotation: Quaternion;
  chassisLinearVelocity: KinematicsVec3;
  chassisAngularVelocity: KinematicsVec3;
  steeringInput: number;
  contactPoint?: KinematicsVec3 | null;
}

/** 한 휠의 장착·접지·방향·접지점 속도 스냅샷이다. */
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

// 배열 순서를 고정해 Object.fromEntries 결과와 휠별 텔레메트리 순서를 결정적으로 유지한다.
const WHEEL_IDS: readonly WheelKinematicId[] = [
  "frontLeft",
  "frontRight",
  "rearLeft",
  "rearRight",
];

/** 스티어링·좌표 정규화에 사용할 범위를 제한한다. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 벡터의 성분별 덧셈이다. */
function add(a: KinematicsVec3, b: KinematicsVec3): KinematicsVec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** 벡터의 성분별 뺄셈이다. */
function subtract(a: KinematicsVec3, b: KinematicsVec3): KinematicsVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** 벡터에 무차원 스칼라를 곱한다. */
function scale(value: KinematicsVec3, scalar: number): KinematicsVec3 {
  return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar };
}

/** 두 벡터의 내적을 계산해 축 방향 속도를 투영한다. */
function dot(a: KinematicsVec3, b: KinematicsVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** 각속도와 중심 오프셋으로 접선 속도 항을 계산한다. */
function cross(a: KinematicsVec3, b: KinematicsVec3): KinematicsVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** 방향 벡터를 정규화하고 0 길이 입력에는 -Z 전방을 반환한다. */
function normalize(value: KinematicsVec3): KinematicsVec3 {
  const length = Math.hypot(value.x, value.y, value.z);
  return length > 1e-8 ? scale(value, 1 / length) : { x: 0, y: 0, z: -1 };
}

/** quaternion 회전으로 local 방향·오프셋을 world 좌표로 옮긴다. */
export function rotateByQuaternion(vector: KinematicsVec3, rotation: Quaternion): KinematicsVec3 {
  const { x: qx, y: qy, z: qz, w: qw } = rotation;
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

/** 차체 중심 기준 네 휠의 local 장착점을 생성한다. */
export function createWheelMounts(
  config: Pick<
    WheelKinematicsConfig,
    "frontAxleDistanceM" | "rearAxleDistanceM" | "trackWidthM" | "mountHeightBelowCenterM"
  >,
): Record<WheelKinematicId, KinematicsVec3> {
  const halfTrackM = config.trackWidthM * 0.5;

  return {
    frontLeft: { x: -halfTrackM, y: -config.mountHeightBelowCenterM, z: -config.frontAxleDistanceM },
    frontRight: { x: halfTrackM, y: -config.mountHeightBelowCenterM, z: -config.frontAxleDistanceM },
    rearLeft: { x: -halfTrackM, y: -config.mountHeightBelowCenterM, z: config.rearAxleDistanceM },
    rearRight: { x: halfTrackM, y: -config.mountHeightBelowCenterM, z: config.rearAxleDistanceM },
  };
}

/**
 * 한 휠의 조향 방향과 접지점 속도를 계산한다. 속도는
 * `v_point = v_chassis + omega × r` 불변식을 사용하며, 접지점이 없으면 휠 중심을 장착점으로 둔다.
 */
export function calculateWheelKinematics(
  id: WheelKinematicId,
  config: WheelKinematicsConfig,
  input: WheelKinematicsInput,
): WheelKinematicState {
  const mountLocal = createWheelMounts(config)[id];
  const mountOffset = rotateByQuaternion(mountLocal, input.chassisRotation);
  const mountPoint = add(input.chassisPosition, mountOffset);
  const steeringAngleRad = id.startsWith("front")
    ? clamp(input.steeringInput, -1, 1) * config.maxSteeringAngleRad
    : 0;

  // S1의 -Z 전방 좌표계에서는 조향 양수가 우회전이므로 local 전방의 X 성분이 양수가 된다.
  const wheelForwardLocal = {
    x: Math.sin(steeringAngleRad),
    y: 0,
    z: -Math.cos(steeringAngleRad),
  };
  const wheelRightLocal = {
    x: Math.cos(steeringAngleRad),
    y: 0,
    z: Math.sin(steeringAngleRad),
  };
  const forward = normalize(rotateByQuaternion(wheelForwardLocal, input.chassisRotation));
  const right = normalize(rotateByQuaternion(wheelRightLocal, input.chassisRotation));
  const velocity = add(input.chassisLinearVelocity, cross(input.chassisAngularVelocity, mountOffset));
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

/** 네 휠에 동일한 차체 입력을 적용해 순서를 고정한 운동학 레코드를 만든다. */
export function calculateAllWheelKinematics(
  config: WheelKinematicsConfig,
  input: Omit<WheelKinematicsInput, "contactPoint"> & {
    contactPoints?: Partial<Record<WheelKinematicId, KinematicsVec3 | null>>;
  },
): Record<WheelKinematicId, WheelKinematicState> {
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

/** 임의 접지점의 world 속도를 차체 선속도와 각속도 외적으로 계산한다. */
export function calculateWheelPointVelocity(
  chassisLinearVelocity: KinematicsVec3,
  chassisAngularVelocity: KinematicsVec3,
  point: KinematicsVec3,
  chassisPosition: KinematicsVec3,
): KinematicsVec3 {
  return add(chassisLinearVelocity, cross(chassisAngularVelocity, subtract(point, chassisPosition)));
}
