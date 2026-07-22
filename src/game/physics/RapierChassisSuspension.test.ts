import { describe, expect, it } from "vitest";
import { RapierChassisSuspension } from "./RapierChassisSuspension";

// Rapier native world를 고정 dt로 진행해 접지·타이어 접점·구동 토크·공력 회귀를 검증한다.
describe("RapierChassisSuspension", () => {
  it("settles a dynamic chassis on four raycast suspension contacts", async () => {
    const rig = await RapierChassisSuspension.create();

    // 초기 낙하가 끝나고 네 ray가 정적 ground를 찾을 때까지 8초를 진행한다.
    for (let step = 0; step < 960; step += 1) {
      rig.step(1 / 120);
    }

    const snapshot = rig.getSnapshot();
    const contacts = rig.getWheelContacts();

    expect(snapshot.position.y).toBeGreaterThan(0.35);
    expect(snapshot.position.y).toBeLessThan(0.65);
    expect(Math.abs(snapshot.linearVelocity.y)).toBeLessThan(0.2);
    expect(Object.values(contacts).every((contact) => contact.grounded)).toBe(true);
    expect(Object.values(contacts).every((contact) => contact.suspensionForceN > 0)).toBe(true);

    rig.syncPlanarPosition({ x: 12, z: -4 });
    rig.step(1 / 120);
    expect(rig.getSnapshot().position.x).toBeCloseTo(12, 3);
    expect(rig.getSnapshot().position.z).toBeCloseTo(-4, 3);

    rig.syncPlanarPose({
      position: { x: 4, z: 3 },
      velocity: { x: 0, z: -20 },
      yawRad: 0,
      yawRateRadS: 0,
    });
    rig.step(1 / 120, 0.5);
    const kinematics = rig.getWheelKinematics();
    expect(kinematics.frontLeft.steeringAngleRad).toBeCloseTo(0.225, 8);
    expect(kinematics.frontRight.steeringAngleRad).toBeCloseTo(0.225, 8);
    expect(kinematics.rearLeft.steeringAngleRad).toBe(0);
    expect(kinematics.frontLeft.longitudinalSpeedMps).toBeGreaterThan(15);

    rig.dispose();
  });

  it("applies combined tire forces at grounded Rapier contact points", async () => {
    const rig = await RapierChassisSuspension.create();

    // 먼저 정적 차체를 접지시킨 뒤 평면 pose를 주입해 구동력만 비교한다.
    for (let step = 0; step < 720; step += 1) {
      rig.step(1 / 120);
    }

    rig.syncPlanarPose({
      position: { x: 0, z: 0 },
      velocity: { x: 0, z: 0 },
      yawRad: 0,
      yawRateRadS: 0,
    });

    for (let step = 0; step < 360; step += 1) {
      rig.step(1 / 120, {
        steeringInput: 0,
        rearDriveForceN: 6_000,
        brakeForceN: 0,
        surfaceGripMultiplier: 1,
      });
    }

    const drivenSnapshot = rig.getSnapshot();
    const drivenTelemetry = rig.getTelemetry();
    const tireStates = rig.getWheelTireStates();

    expect(drivenSnapshot.position.z).toBeLessThan(-1);
    expect(drivenSnapshot.linearVelocity.z).toBeLessThan(-1);
    expect(Math.abs(drivenTelemetry.totalLongitudinalTireForceN)).toBeGreaterThan(100);
    expect(drivenTelemetry.maximumSlipRatio).toBeGreaterThan(0);
    expect(tireStates.rearLeft.wheelAngularSpeedRadS).toBeGreaterThan(0);

    const xBeforeRightSteerM = drivenSnapshot.position.x;
    for (let step = 0; step < 180; step += 1) {
      rig.step(1 / 120, {
        steeringInput: 0.5,
        rearDriveForceN: 6_000,
        brakeForceN: 0,
        surfaceGripMultiplier: 1,
      });
    }

    const steeredSnapshot = rig.getSnapshot();
    expect(steeredSnapshot.position.x).toBeGreaterThan(xBeforeRightSteerM + 0.05);
    expect(steeredSnapshot.angularVelocity.y).toBeLessThan(-0.01);
    expect(steeredSnapshot.rotation.y).toBeLessThan(-0.01);

    const speedBeforeBrakeMps = Math.hypot(
      rig.getSnapshot().linearVelocity.x,
      rig.getSnapshot().linearVelocity.z,
    );
    for (let step = 0; step < 180; step += 1) {
      rig.step(1 / 120, {
        steeringInput: 0,
        rearDriveForceN: 0,
        brakeForceN: 14_500,
        surfaceGripMultiplier: 1,
      });
    }

    expect(Math.hypot(rig.getSnapshot().linearVelocity.x, rig.getSnapshot().linearVelocity.z)).toBeLessThan(speedBeforeBrakeMps);
    rig.dispose();
  });

  it("applies rear drive torque, engine braking, and speed-dependent aero forces", async () => {
    const rig = await RapierChassisSuspension.create();

    // 공력은 속도에 따라 달라지므로 같은 초기 높이에서 안정화 후 25m/s pose를 주입한다.
    for (let step = 0; step < 720; step += 1) {
      rig.step(1 / 120);
    }

    rig.syncPlanarPose({
      position: { x: 0, z: 0 },
      velocity: { x: 0, z: -25 },
      yawRad: 0,
      yawRateRadS: 0,
    });

    for (let step = 0; step < 120; step += 1) {
      rig.step(1 / 120, {
        steeringInput: 0,
        rearDriveTorqueNm: 1_600,
        engineBrakeTorqueNm: 0,
        brakeForceN: 0,
        surfaceGripMultiplier: 1,
        surfaceDragMultiplier: 1,
      });
    }

    const drivenTelemetry = rig.getTelemetry();
    const drivenSnapshot = rig.getSnapshot();
    const tireStates = rig.getWheelTireStates();
    const speedBeforeEngineBrakeMps = Math.hypot(
      drivenSnapshot.linearVelocity.x,
      drivenSnapshot.linearVelocity.z,
    );

    expect(speedBeforeEngineBrakeMps).toBeGreaterThan(5);
    expect(tireStates.rearLeft.wheelAngularSpeedRadS).toBeGreaterThan(0);
    expect(drivenTelemetry.downforceN).toBeGreaterThan(0);
    expect(drivenTelemetry.dragForceN).toBeGreaterThan(0);

    for (let step = 0; step < 180; step += 1) {
      rig.step(1 / 120, {
        steeringInput: 0,
        rearDriveTorqueNm: 0,
        engineBrakeTorqueNm: 240,
        brakeForceN: 0,
        surfaceGripMultiplier: 1,
        surfaceDragMultiplier: 1,
      });
    }

    const engineBrakedSnapshot = rig.getSnapshot();
    expect(Math.hypot(
      engineBrakedSnapshot.linearVelocity.x,
      engineBrakedSnapshot.linearVelocity.z,
    )).toBeLessThan(speedBeforeEngineBrakeMps);
    rig.dispose();
  });
});
