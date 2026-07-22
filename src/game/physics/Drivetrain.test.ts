import { describe, expect, it } from "vitest";
import {
  calculateDrivetrainCommand,
  DEFAULT_TORQUE_CURVE,
  type DrivetrainConfig,
} from "./Drivetrain";

// 실제 엔진이 아니라 순수 구동계 명령의 기어·클러치·엔진 브레이크 계약을 검증한다.
const config: DrivetrainConfig = {
  gearRatios: [3.2, 2.2, 1.65, 1.32, 1.1, 0.94, 0.82, 0.72],
  finalDriveRatio: 3.6,
  drivetrainEfficiency: 0.9,
  wheelRadiusM: 0.36,
  idleRpm: 900,
  redlineRpm: 8_000,
  maxEngineTorqueNm: 320,
  engineBrakeTorqueNm: 110,
  rpmResponseRpmPerSecond: 24_000,
  torqueCurve: DEFAULT_TORQUE_CURVE,
};

// 같은 휠 속도에서 기어비만 바뀌었을 때 RPM과 휠 토크가 결정적으로 달라지는지 확인한다.
describe("Drivetrain", () => {
  it("maps the same rear wheel speed to different RPM and torque by gear", () => {
    const firstGear = calculateDrivetrainCommand({
      gear: 1,
      throttle: 1,
      clutch: 0,
      forwardSpeedMps: 8,
      drivenWheelAngularSpeedRadS: 20,
      previousRpm: 900,
      dtSeconds: 1,
    }, config);
    const eighthGear = calculateDrivetrainCommand({
      gear: 8,
      throttle: 1,
      clutch: 0,
      forwardSpeedMps: 8,
      drivenWheelAngularSpeedRadS: 20,
      previousRpm: 900,
      dtSeconds: 1,
    }, config);

    expect(firstGear.rpm).toBeGreaterThan(eighthGear.rpm);
    expect(firstGear.driveTorqueNm).toBeGreaterThan(eighthGear.driveTorqueNm);
    expect(firstGear.driveForceN).toBeGreaterThan(0);
    expect(Number.isFinite(firstGear.engineTorqueNm)).toBe(true);
  });

  it("applies engine braking only while the driven wheels are rotating", () => {
    const coasting = calculateDrivetrainCommand({
      gear: 3,
      throttle: 0,
      clutch: 0,
      forwardSpeedMps: 20,
      drivenWheelAngularSpeedRadS: 55,
      previousRpm: 4_500,
      dtSeconds: 1 / 120,
    }, config);
    const stopped = calculateDrivetrainCommand({
      gear: 1,
      throttle: 0,
      clutch: 0,
      forwardSpeedMps: 0,
      drivenWheelAngularSpeedRadS: 0,
      previousRpm: 900,
      dtSeconds: 1 / 120,
    }, config);

    expect(coasting.engineBrakeTorqueNm).toBeGreaterThan(0);
    expect(coasting.engineBrakeForceN).toBeGreaterThan(0);
    expect(stopped.engineBrakeTorqueNm).toBe(0);
  });

  it("disconnects drive and engine braking while the clutch is fully engaged", () => {
    const clutchIn = calculateDrivetrainCommand({
      gear: 2,
      throttle: 1,
      clutch: 1,
      forwardSpeedMps: 12,
      drivenWheelAngularSpeedRadS: 30,
      previousRpm: 3_000,
      dtSeconds: 1 / 120,
    }, config);

    expect(clutchIn.driveTorqueNm).toBe(0);
    expect(clutchIn.engineBrakeTorqueNm).toBe(0);
    expect(clutchIn.rpm).toBeGreaterThanOrEqual(config.idleRpm);
  });
});
