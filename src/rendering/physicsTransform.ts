/**
 * 물리 yaw를 Three.js 오브젝트 회전으로 변환한다.
 * 물리 전방은 `(sin(yaw), -cos(yaw))`이고, local forward가 -Z인 Three.js
 * 오브젝트의 회전 전방은 `(-sin(rotationY), -cos(rotationY))`이므로 부호가 반대다.
 * 입력·물리 좌표계를 렌더링 계층에서만 변환해 각 계층의 내부 규칙을 보존한다.
 */
export function physicsYawToThreeYaw(yawRad: number): number {
  return -yawRad;
}
