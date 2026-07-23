/** 물리 yaw와 Three.js 렌더 yaw의 좌표계 변환 계약을 검증한다. */
import { describe, expect, it } from "vitest";
import { physicsYawToThreeYaw } from "./physicsTransform";

describe("physicsYawToThreeYaw", () => {
  // 두 계층이 공유하는 -Z 전방이 yaw 0에서 그대로 유지되는지 확인한다.
  it("keeps the shared -Z forward direction at zero yaw", () => {
    expect(physicsYawToThreeYaw(0)).toBeCloseTo(0);
  });

  // physics의 우회전 부호가 시각 heading에서 반전되는지 확인한다.
  it("maps a physics right turn to the matching Three.js visual heading", () => {
    expect(physicsYawToThreeYaw(Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(physicsYawToThreeYaw(-Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });
});
