/**
 * Converts the physics yaw convention to Three.js object rotation.
 *
 * Physics forward is (sin(yaw), -cos(yaw)), while a Three.js object whose
 * local forward axis is -Z faces (-sin(rotationY), -cos(rotationY)).
 */
export function physicsYawToThreeYaw(yawRad: number): number {
  return -yawRad;
}

/**
 * Converts physics front-wheel steering to Three.js steering-group rotation.
 *
 * A positive physics steering angle points the wheel forward vector toward +X.
 * Because the visual wheel's local forward is -Z, Three.js needs the opposite
 * Y rotation to show the same direction.
 */
export function physicsSteeringToThreeWheelYaw(steeringAngleRad: number): number {
  return -steeringAngleRad;
}
