/**
 * Converts the physics yaw convention to Three.js object rotation.
 *
 * Physics forward is (sin(yaw), -cos(yaw)), while a Three.js object whose
 * local forward axis is -Z faces (-sin(rotationY), -cos(rotationY)).
 */
export function physicsYawToThreeYaw(yawRad: number): number {
  return -yawRad;
}
