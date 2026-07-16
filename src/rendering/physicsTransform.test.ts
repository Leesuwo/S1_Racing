import { describe, expect, it } from "vitest";
import { physicsYawToThreeYaw } from "./physicsTransform";

describe("physicsYawToThreeYaw", () => {
  it("keeps the shared -Z forward direction at zero yaw", () => {
    expect(physicsYawToThreeYaw(0)).toBeCloseTo(0);
  });

  it("maps a physics right turn to the matching Three.js visual heading", () => {
    expect(physicsYawToThreeYaw(Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(physicsYawToThreeYaw(-Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });
});
