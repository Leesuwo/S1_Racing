import { describe, expect, it } from "vitest";
import {
  calculateSuspensionStep,
  DEFAULT_SUSPENSION_CONFIG,
  zeroWheelValues,
} from "./Suspension";

// 종·횡 하중 이동, 휠별 압축, travel clamp를 순수 서스펜션 계산으로 검증한다.
const baseInput = {
  massKg: 780,
  wheelBaseM: 3.3,
  staticFrontAxleLoadN: 780 * 9.81 * 0.45,
  staticRearAxleLoadN: 780 * 9.81 * 0.55,
  frontAeroLoadN: 0,
  rearAeroLoadN: 0,
  longitudinalAccelerationMps2: 0,
  lateralAccelerationMps2: 0,
  previousCompressionM: zeroWheelValues(),
  dtSeconds: 1 / 120,
  config: DEFAULT_SUSPENSION_CONFIG,
};

// 하중 이동 부호는 +X 오른쪽, +종가속도 후륜 전달이라는 프로젝트 좌표계와 일치해야 한다.
describe("Suspension", () => {
  it("preserves static axle load across four wheels", () => {
    const result = calculateSuspensionStep(baseInput);
    const totalLoadN = Object.values(result.loadsN).reduce((sum, value) => sum + value, 0);

    expect(totalLoadN).toBeCloseTo(780 * 9.81, 5);
    expect(result.loadsN.frontLeft).toBeCloseTo(result.loadsN.frontRight, 5);
    expect(result.loadsN.rearLeft).toBeCloseTo(result.loadsN.rearRight, 5);
  });

  it("transfers load forward under braking and rearward under acceleration", () => {
    const braking = calculateSuspensionStep({
      ...baseInput,
      longitudinalAccelerationMps2: -15,
    });
    const acceleration = calculateSuspensionStep({
      ...baseInput,
      longitudinalAccelerationMps2: 15,
    });

    const brakingFront = braking.loadsN.frontLeft + braking.loadsN.frontRight;
    const brakingRear = braking.loadsN.rearLeft + braking.loadsN.rearRight;
    const accelerationFront = acceleration.loadsN.frontLeft + acceleration.loadsN.frontRight;
    const accelerationRear = acceleration.loadsN.rearLeft + acceleration.loadsN.rearRight;

    expect(brakingFront).toBeGreaterThan(brakingRear);
    expect(accelerationRear).toBeGreaterThan(accelerationFront);
  });

  it("moves load to the outside wheels during lateral acceleration", () => {
    const rightTurnLoad = calculateSuspensionStep({
      ...baseInput,
      lateralAccelerationMps2: 20,
    });
    const leftTurnLoad = calculateSuspensionStep({
      ...baseInput,
      lateralAccelerationMps2: -20,
    });

    expect(rightTurnLoad.loadsN.frontRight).toBeGreaterThan(rightTurnLoad.loadsN.frontLeft);
    expect(rightTurnLoad.loadsN.rearRight).toBeGreaterThan(rightTurnLoad.loadsN.rearLeft);
    expect(leftTurnLoad.loadsN.frontLeft).toBeGreaterThan(leftTurnLoad.loadsN.frontRight);
    expect(leftTurnLoad.loadsN.rearLeft).toBeGreaterThan(leftTurnLoad.loadsN.rearRight);
  });

  it("clamps compression to the configured suspension travel", () => {
    const result = calculateSuspensionStep({
      ...baseInput,
      frontAeroLoadN: 200_000,
      rearAeroLoadN: 200_000,
    });

    for (const compression of Object.values(result.compressionM)) {
      expect(compression).toBeGreaterThanOrEqual(0);
      expect(compression).toBeLessThanOrEqual(DEFAULT_SUSPENSION_CONFIG.travelM);
    }
  });
});
