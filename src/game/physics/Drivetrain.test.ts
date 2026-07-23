/** 기어비·RPM·토크·엔진 브레이크의 구동계 계약을 검증한다. */
import { describe, expect, it } from "vitest";
import {
  calculateDrivetrainCommand,
  DEFAULT_TORQUE_CURVE,
  type DrivetrainConfig,
} from "./Drivetrain";

// 단위가 명시된 초기 구동계 픽스처이며 실제 차량 확정값이 아닌 initial_assumption이다.
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

describe("Drivetrain", () => {
  // 같은 휠 속도라도 낮은 기어가 더 높은 RPM과 바퀴 토크를 만들어야 한다.
  it("maps the same rear wheel speed to different RPM and torque by gear", () => {
    // 1단과 8단의 기어비 차이를 비교한다.
    const firstGear = calculateDrivetrainCommand({
      gear: 1,
      throttle: 1,
      clutch: 0,
      forwardSpeedMps: 8,
      drivenWheelAngularSpeedRadS: 20,
      previousRpm: 900,
      dtSeconds: 1,
    }, config);
    // 같은 속도·입력에서 최고단 기어의 결과다.
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

  // throttle을 놓고 회전 중일 때만 엔진 브레이크가 생성되어야 한다.
  it("applies engine braking only while the driven wheels are rotating", () => {
    // 회전 중 throttle lift는 engine brake를 활성화해야 한다.
    const coasting = calculateDrivetrainCommand({
      gear: 3,
      throttle: 0,
      clutch: 0,
      forwardSpeedMps: 20,
      drivenWheelAngularSpeedRadS: 55,
      previousRpm: 4_500,
      dtSeconds: 1 / 120,
    }, config);
    // 정지·각속도 0에서는 engine brake가 0이어야 한다.
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

  // 클러치가 완전히 분리되면 구동 토크와 엔진 브레이크가 바퀴에 전달되지 않아야 한다.
  it("disconnects drive and engine braking while the clutch is fully engaged", () => {
    // clutch=1인 free-rev 상태의 명령이다.
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
