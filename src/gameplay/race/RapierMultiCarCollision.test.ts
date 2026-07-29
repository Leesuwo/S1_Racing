/**
 * M4A 공유 Rapier 세계가 두 개의 회전 가능한 cuboid 차체를 실제로 접촉시키고,
 * 충돌 후 위치·속도와 접촉 이벤트를 반환하는지 검증한다.
 */
import { describe, expect, it } from "vitest";
import { RapierMultiCarCollision } from "./RapierMultiCarCollision";

describe("RapierMultiCarCollision", () => {
  it("resolves shape contact for two cars in one world", async () => {
    const world = await RapierMultiCarCollision.create();
    try {
      const result = world.step(1 / 120, [
        { id: "first", position: { x: 0, z: 0 }, velocity: { x: 3, z: 0 }, yawRad: 0, yawRateRadS: 0, massKg: 780 },
        { id: "second", position: { x: 1.2, z: 0 }, velocity: { x: -3, z: 0 }, yawRad: 0.12, yawRateRadS: 0, massKg: 780 },
      ]);
      expect(result.contacts).toHaveLength(1);
      expect(result.bodies).toHaveLength(2);
      expect(result.bodies.every((body) => Number.isFinite(body.position.x) && Number.isFinite(body.yawRad))).toBe(true);
    } finally {
      world.dispose();
    }
  });
});
