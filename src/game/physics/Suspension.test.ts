/** 네 바퀴 정적 하중·종/횡 하중 이동·압축 한계를 검증한다. */
import { describe, expect, it } from "vitest";
import {
  calculateSuspensionStep,
  DEFAULT_SUSPENSION_CONFIG,
  zeroWheelValues,
} from "./Suspension";

// 모든 테스트가 공유하는 780 kg 차량의 중립 하중 입력 픽스처다.
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

describe("Suspension", () => {
  // 정지 상태에서는 앞뒤 축 하중 합과 좌우 대칭이 보존되어야 한다.
  it("preserves static axle load across four wheels", () => {
    // 기준 입력에서 반환된 네 바퀴 하중을 합산한다.
    const result = calculateSuspensionStep(baseInput);
    // 보존 법칙 검증용 전체 normal load(N)이다.
    const totalLoadN = Object.values(result.loadsN).reduce((sum, value) => sum + value, 0);

    expect(totalLoadN).toBeCloseTo(780 * 9.81, 5);
    expect(result.loadsN.frontLeft).toBeCloseTo(result.loadsN.frontRight, 5);
    expect(result.loadsN.rearLeft).toBeCloseTo(result.loadsN.rearRight, 5);
  });

  // 제동은 앞축으로, 가속은 뒤축으로 종방향 하중을 이동시켜야 한다.
  it("transfers load forward under braking and rearward under acceleration", () => {
    // 음의 종가속도는 braking 상태를 표현한다.
    const braking = calculateSuspensionStep({
      ...baseInput,
      longitudinalAccelerationMps2: -15,
    });
    // 양의 종가속도는 rearward load transfer 상태를 표현한다.
    const acceleration = calculateSuspensionStep({
      ...baseInput,
      longitudinalAccelerationMps2: 15,
    });

    // 각 시나리오의 front/rear 차축 하중을 비교 가능한 합으로 만든다.
    const brakingFront = braking.loadsN.frontLeft + braking.loadsN.frontRight;
    const brakingRear = braking.loadsN.rearLeft + braking.loadsN.rearRight;
    const accelerationFront = acceleration.loadsN.frontLeft + acceleration.loadsN.frontRight;
    const accelerationRear = acceleration.loadsN.rearLeft + acceleration.loadsN.rearRight;

    expect(brakingFront).toBeGreaterThan(brakingRear);
    expect(accelerationRear).toBeGreaterThan(accelerationFront);
  });

  // 우회전·좌회전에서 각각 바깥쪽 휠로 횡하중이 이동해야 한다.
  it("moves load to the outside wheels during lateral acceleration", () => {
    // 양의 횡가속도는 우측 바깥쪽 하중을 만든다.
    const rightTurnLoad = calculateSuspensionStep({
      ...baseInput,
      lateralAccelerationMps2: 20,
    });
    // 음의 횡가속도는 좌측 바깥쪽 하중을 만든다.
    const leftTurnLoad = calculateSuspensionStep({
      ...baseInput,
      lateralAccelerationMps2: -20,
    });

    expect(rightTurnLoad.loadsN.frontRight).toBeGreaterThan(rightTurnLoad.loadsN.frontLeft);
    expect(rightTurnLoad.loadsN.rearRight).toBeGreaterThan(rightTurnLoad.loadsN.rearLeft);
    expect(leftTurnLoad.loadsN.frontLeft).toBeGreaterThan(leftTurnLoad.loadsN.frontRight);
    expect(leftTurnLoad.loadsN.rearLeft).toBeGreaterThan(leftTurnLoad.loadsN.rearRight);
  });

  // 비현실적으로 큰 공력 하중도 travel 범위를 넘는 압축을 만들면 안 된다.
  it("clamps compression to the configured suspension travel", () => {
    // travel 제한을 넘길 만큼 큰 공력 하중을 주는 경계 픽스처다.
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
