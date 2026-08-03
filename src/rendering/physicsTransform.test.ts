import { describe, expect, it } from "vitest";
import { physicsSteeringToThreeWheelYaw, physicsYawToThreeYaw } from "./physicsTransform";

describe("physicsYawToThreeYaw", () => {
  it("keeps the shared -Z forward direction at zero yaw", () => {
    expect(physicsYawToThreeYaw(0)).toBeCloseTo(0);
  });

  it("maps a physics right turn to the matching Three.js visual heading", () => {
    expect(physicsYawToThreeYaw(Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(physicsYawToThreeYaw(-Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });
});

describe("physicsSteeringToThreeWheelYaw", () => {
  it("maps positive physics steering toward +X to negative Three.js wheel yaw", () => {
    expect(physicsSteeringToThreeWheelYaw(0.2)).toBeCloseTo(-0.2);
    expect(physicsSteeringToThreeWheelYaw(-0.2)).toBeCloseTo(0.2);
  });
});
