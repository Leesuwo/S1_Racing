import { describe, expect, it } from "vitest";
import {
  calculateLoadSensitiveMaximumForce,
  calculateSlipAngle,
  calculateSlipRatio,
  calculateTireForce,
} from "./TireModel";

// 저속 분모 보호, 슬립 부호, 결합 마찰 원, 하중 민감도를 순수 모델로 검증한다.
describe("TireModel", () => {
  it("calculates signed longitudinal slip and lateral slip angle", () => {
    expect(calculateSlipRatio(20, 60, 0.36)).toBeCloseTo(0.08, 8);
    expect(calculateSlipRatio(20, 40, 0.36)).toBeCloseTo(-0.28, 8);
    expect(calculateSlipAngle(20, 2)).toBeGreaterThan(0);
    expect(calculateSlipAngle(20, -2)).toBeLessThan(0);
  });

  it("returns finite, zero tire force without normal load", () => {
    const tire = calculateTireForce({
      normalForceN: 0,
      frictionCoefficient: 1.55,
      longitudinalSpeedMps: 30,
      lateralSpeedMps: 1,
      wheelAngularSpeedRadS: 100,
      wheelRadiusM: 0.36,
    });

    expect(tire.longitudinalForceN).toBe(0);
    expect(tire.lateralForceN).toBe(0);
    expect(tire.frictionUsage).toBe(0);
    expect(Object.values(tire).every(Number.isFinite)).toBe(true);
  });

  it("opposes lateral movement and limits combined force to the friction circle", () => {
    const tire = calculateTireForce({
      normalForceN: 2_000,
      frictionCoefficient: 1.55,
      longitudinalSpeedMps: 24,
      lateralSpeedMps: 5,
      wheelAngularSpeedRadS: 110,
      wheelRadiusM: 0.36,
    });

    expect(tire.longitudinalForceN).toBeGreaterThan(0);
    expect(tire.lateralForceN).toBeLessThan(0);
    expect(Math.hypot(tire.longitudinalForceN, tire.lateralForceN)).toBeLessThanOrEqual(tire.maximumForceN + 1e-8);
    expect(tire.frictionUsage).toBeGreaterThan(0);
    expect(tire.frictionUsage).toBeLessThanOrEqual(1);
  });

  it("models load sensitivity with sub-linear available grip growth", () => {
    const lowLoadForceN = calculateLoadSensitiveMaximumForce(1_000, 1.55);
    const highLoadForceN = calculateLoadSensitiveMaximumForce(2_000, 1.55);

    expect(highLoadForceN).toBeGreaterThan(lowLoadForceN);
    expect(highLoadForceN).toBeLessThan(lowLoadForceN * 2);
  });
});
