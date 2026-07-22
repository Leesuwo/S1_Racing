import { describe, expect, it } from "vitest";
import {
  calculateAllWheelKinematics,
  calculateWheelPointVelocity,
  type WheelKinematicsConfig,
} from "./WheelKinematics";

// -Z 전방 좌표계, 전륜 조향, yaw-rate 접지점 속도를 독립적으로 검증한다.
const config: WheelKinematicsConfig = {
  frontAxleDistanceM: 1.8,
  rearAxleDistanceM: 1.5,
  trackWidthM: 1.6,
  mountHeightBelowCenterM: 0.12,
  wheelRadiusM: 0.36,
  maxSteeringAngleRad: 0.4,
};

// 휠 배치 데이터와 관계없이 운동학 공식 자체도 별도 테스트한다.
describe("WheelKinematics", () => {
  it("applies steering only to the two front wheels in the -Z-forward convention", () => {
    const wheels = calculateAllWheelKinematics(config, {
      chassisPosition: { x: 10, y: 0.5, z: -4 },
      chassisRotation: { x: 0, y: 0, z: 0, w: 1 },
      chassisLinearVelocity: { x: 0, y: 0, z: -24 },
      chassisAngularVelocity: { x: 0, y: 0, z: 0 },
      steeringInput: 0.5,
    });

    expect(wheels.frontLeft.steeringAngleRad).toBeCloseTo(0.2, 8);
    expect(wheels.frontRight.steeringAngleRad).toBeCloseTo(0.2, 8);
    expect(wheels.rearLeft.steeringAngleRad).toBe(0);
    expect(wheels.rearRight.steeringAngleRad).toBe(0);
    expect(wheels.frontLeft.forward.x).toBeGreaterThan(0);
    expect(wheels.rearLeft.forward.x).toBeCloseTo(0, 8);
    expect(wheels.frontLeft.mountPoint.x).toBeCloseTo(9.2, 8);
    expect(wheels.frontLeft.mountPoint.z).toBeCloseTo(-5.8, 8);
  });

  it("includes yaw-rate velocity at a wheel contact point", () => {
    const wheels = calculateAllWheelKinematics(config, {
      chassisPosition: { x: 0, y: 0.5, z: 0 },
      chassisRotation: { x: 0, y: 0, z: 0, w: 1 },
      chassisLinearVelocity: { x: 0, y: 0, z: -20 },
      chassisAngularVelocity: { x: 0, y: -1, z: 0 },
      steeringInput: 0,
      contactPoints: {
        frontLeft: { x: -0.8, y: 0, z: -1.8 },
      },
    });

    expect(wheels.frontLeft.velocity.x).toBeCloseTo(1.8, 8);
    expect(wheels.frontLeft.longitudinalSpeedMps).toBeCloseTo(20.8, 8);
    expect(wheels.frontLeft.lateralSpeedMps).toBeCloseTo(1.8, 8);
    expect(wheels.frontLeft.wheelCenter.y).toBeCloseTo(0.36, 8);
  });

  it("calculates point velocity without relying on the wheel layout", () => {
    const velocity = calculateWheelPointVelocity(
      { x: 4, y: 0, z: -12 },
      { x: 0, y: -2, z: 0 },
      { x: 0, y: 0, z: -3 },
      { x: 0, y: 0, z: 0 },
    );

    expect(velocity).toEqual({ x: 10, y: 0, z: -12 });
  });
});
