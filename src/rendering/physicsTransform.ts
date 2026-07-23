/**
 * 물리 좌표계의 방향을 Three.js 렌더링 좌표계로 변환하는 작은 경계 모듈이다.
 *
 * Converts the physics yaw convention to Three.js object rotation.
 *
 * Physics forward is (sin(yaw), -cos(yaw)), while a Three.js object whose
 * local forward axis is -Z faces (-sin(rotationY), -cos(rotationY)).
 */
export function physicsYawToThreeYaw(yawRad: number): number {
  // 두 계층의 전방 축이 모두 -Z이지만 yaw의 회전 부호가 반대이므로 부호를 반전한다.
  return -yawRad;
}
