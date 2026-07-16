export type WheelKinematicId = "frontLeft" | "frontRight" | "rearLeft" | "rearRight";

export interface KinematicsVec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface WheelKinematicsConfig {
  frontAxleDistanceM: number;
  rearAxleDistanceM: number;
  trackWidthM: number;
  mountHeightBelowCenterM: number;
  wheelRadiusM: number;
  maxSteeringAngleRad: number;
}

export interface WheelKinematicsInput {
  chassisPosition: KinematicsVec3;
  chassisRotation: Quaternion;
  chassisLinearVelocity: KinematicsVec3;
  chassisAngularVelocity: KinematicsVec3;
  steeringInput: number;
  contactPoint?: KinematicsVec3 | null;
}

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

const WHEEL_IDS: readonly WheelKinematicId[] = [
  "frontLeft",
  "frontRight",
  "rearLeft",
  "rearRight",
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function add(a: KinematicsVec3, b: KinematicsVec3): KinematicsVec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a: KinematicsVec3, b: KinematicsVec3): KinematicsVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(value: KinematicsVec3, scalar: number): KinematicsVec3 {
  return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar };
}

function dot(a: KinematicsVec3, b: KinematicsVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: KinematicsVec3, b: KinematicsVec3): KinematicsVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(value: KinematicsVec3): KinematicsVec3 {
  const length = Math.hypot(value.x, value.y, value.z);
  return length > 1e-8 ? scale(value, 1 / length) : { x: 0, y: 0, z: -1 };
}

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

  // + steering is a right turn in S1's -Z-forward coordinate convention.
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

export function calculateWheelPointVelocity(
  chassisLinearVelocity: KinematicsVec3,
  chassisAngularVelocity: KinematicsVec3,
  point: KinematicsVec3,
  chassisPosition: KinematicsVec3,
): KinematicsVec3 {
  return add(chassisLinearVelocity, cross(chassisAngularVelocity, subtract(point, chassisPosition)));
}
