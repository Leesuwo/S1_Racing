import { describe, expect, it } from "vitest";
import { runPhysicsValidation } from "./PhysicsValidation";

describe("Physics validation", () => {
  it("passes deterministic acceleration, coast-down, aero, and finite-state gates", () => {
    const report = runPhysicsValidation();

    expect(report.passed).toBe(true);
    expect(report.metrics.every((metric) => metric.passed)).toBe(true);
  });
});
