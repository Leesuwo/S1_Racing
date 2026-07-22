import { describe, expect, it } from "vitest";
import { physicsYawToThreeYaw } from "./physicsTransform";

// 물리와 Three.js의 -Z 전방·yaw 부호 변환을 렌더링 경계에서만 검증한다.
describe("physicsYawToThreeYaw", () => {
  it("keeps the shared -Z forward direction at zero yaw", () => {
    expect(physicsYawToThreeYaw(0)).toBeCloseTo(0);
  });

  it("maps a physics right turn to the matching Three.js visual heading", () => {
    expect(physicsYawToThreeYaw(Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(physicsYawToThreeYaw(-Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });
});
