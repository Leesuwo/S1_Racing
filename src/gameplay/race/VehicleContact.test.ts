/**
 * M3A 차량 접촉의 침투 분리·반발·결정적 순서를 검증한다.
 * 실제 Rapier 월드 없이 순수 응답 계산을 검사해 세션 회귀를 빠르게 확인한다.
 */
import { describe, expect, it } from "vitest";
import { resolveVehicleContacts } from "./VehicleContact";

describe("resolveVehicleContacts", () => {
  it("separates overlapping vehicles and reverses an approaching velocity", () => {
    const result = resolveVehicleContacts([
      { id: "a", position: { x: 0, z: 0 }, velocity: { x: 4, z: 0 }, massKg: 780, radiusM: 1.25 },
      { id: "b", position: { x: 2, z: 0 }, velocity: { x: -4, z: 0 }, massKg: 780, radiusM: 1.25 },
    ]);

    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]?.impactSpeedMps).toBe(8);
    const first = result.responses.find((body) => body.id === "a");
    const second = result.responses.find((body) => body.id === "b");
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect((second?.position.x ?? 0) - (first?.position.x ?? 0)).toBeCloseTo(2.5, 8);
    expect(first?.velocity.x).toBeLessThan(0);
    expect(second?.velocity.x).toBeGreaterThan(0);
  });

  it("keeps separated vehicles unchanged and preserves input order", () => {
    const bodies = [
      { id: "a", position: { x: 0, z: 0 }, velocity: { x: 1, z: 2 }, massKg: 780, radiusM: 1.25 },
      { id: "b", position: { x: 5, z: 0 }, velocity: { x: 3, z: 4 }, massKg: 780, radiusM: 1.25 },
    ];
    const result = resolveVehicleContacts(bodies);

    expect(result.contacts).toHaveLength(0);
    expect(result.responses.map((body) => body.id)).toEqual(["a", "b"]);
    expect(result.responses.map((body) => body.position)).toEqual(bodies.map((body) => body.position));
  });
});
