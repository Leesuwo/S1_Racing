/** 타이어 슬립 부호·무하중 안전성·결합 마찰원·하중 민감도를 검증한다. */
import { describe, expect, it } from "vitest";
import {
  calculateLoadSensitiveMaximumForce,
  calculateSlipAngle,
  calculateSlipRatio,
  calculateTireForce,
} from "./TireModel";

describe("TireModel", () => {
  // 구동/감속 슬립과 좌우 횡속도의 부호가 차량 힘 방향과 일치해야 한다.
  it("calculates signed longitudinal slip and lateral slip angle", () => {
    expect(calculateSlipRatio(20, 60, 0.36)).toBeCloseTo(0.08, 8);
    expect(calculateSlipRatio(20, 40, 0.36)).toBeCloseTo(-0.28, 8);
    expect(calculateSlipAngle(20, 2)).toBeGreaterThan(0);
    expect(calculateSlipAngle(20, -2)).toBeLessThan(0);
  });

  // normal load가 없으면 힘은 유한한 0이어야 한다.
  it("returns finite, zero tire force without normal load", () => {
    // normal load 0에서 NaN 없이 0 힘을 반환해야 하는 경계 입력이다.
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

  // 횡속도를 반대하는 힘과 종·횡 결합력의 마찰원 제한을 확인한다.
  it("opposes lateral movement and limits combined force to the friction circle", () => {
    // 종·횡 슬립이 동시에 존재하는 결합 타이어 입력이다.
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

  // 하중이 증가해도 load sensitivity 지수 때문에 그립은 선형보다 느리게 증가해야 한다.
  it("models load sensitivity with sub-linear available grip growth", () => {
    // 동일한 마찰계수에서 하중만 두 배로 바꾼 비교 쌍이다.
    const lowLoadForceN = calculateLoadSensitiveMaximumForce(1_000, 1.55);
    const highLoadForceN = calculateLoadSensitiveMaximumForce(2_000, 1.55);

    expect(highLoadForceN).toBeGreaterThan(lowLoadForceN);
    expect(highLoadForceN).toBeLessThan(lowLoadForceN * 2);
  });
});
