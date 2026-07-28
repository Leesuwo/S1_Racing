/**
 * M3C 추월·방어·충돌 회피 상태 전이를 검증한다.
 * 상태 머신이 위치를 직접 변경하지 않고 제어 편향만 산출하는지 확인한다.
 */
import { describe, expect, it } from "vitest";
import { RacecraftStateMachine } from "./Racecraft";

const baseInput = {
  self: { progressM: 100, speedMps: 40, position: { x: 0, z: 0 } },
  opponent: { progressM: 120, speedMps: 32, position: { x: 6, z: 0 } },
  trackLengthM: 300,
  yellowFlag: false,
};

describe("RacecraftStateMachine", () => {
  it("selects attack when a slower car is within the forward gap", () => {
    const machine = new RacecraftStateMachine();
    const snapshot = machine.update(baseInput);

    expect(snapshot.mode).toBe("attack");
    expect(snapshot.overtakeMode).toBe(true);
    expect(snapshot.throttleScale).toBeGreaterThan(1);
  });

  it("selects defend when a car is approaching from behind", () => {
    const machine = new RacecraftStateMachine();
    const snapshot = machine.update({
      ...baseInput,
      opponent: { progressM: 92, speedMps: 45, position: { x: -1, z: 0 } },
    });

    expect(snapshot.mode).toBe("defend");
    expect(snapshot.overtakeMode).toBe(false);
  });

  it("prioritizes avoidance over attack when a yellow flag or close contact exists", () => {
    const machine = new RacecraftStateMachine();
    const snapshot = machine.update({ ...baseInput, yellowFlag: true });

    expect(snapshot.mode).toBe("avoid");
    expect(snapshot.throttleScale).toBeLessThan(1);
    expect(snapshot.brakeScale).toBeGreaterThan(1);
  });

  it("returns to follow when no competitor is close", () => {
    const machine = new RacecraftStateMachine();
    const snapshot = machine.update({
      ...baseInput,
      opponent: { progressM: 240, speedMps: 40, position: { x: 20, z: 20 } },
    });

    expect(snapshot.mode).toBe("follow");
    expect(snapshot.steeringBias).toBe(0);
  });
});
