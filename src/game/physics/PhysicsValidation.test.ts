import { describe, expect, it } from "vitest";
import { runPhysicsValidation } from "./PhysicsValidation";

// 프로토타입 회귀 게이트가 acceleration·coast-down·aero·finite 상태를 모두 통과하는지 확인한다.
describe("Physics validation", () => {
  it("passes deterministic acceleration, coast-down, aero, and finite-state gates", () => {
    const report = runPhysicsValidation();

    expect(report.passed).toBe(true);
    expect(report.metrics.every((metric) => metric.passed)).toBe(true);
  });
});
