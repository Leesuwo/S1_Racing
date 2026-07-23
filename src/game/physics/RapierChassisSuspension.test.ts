/** Rapier 차체 안착·raycast 접지·타이어 힘·구동 토크·공력·제동 통합을 검증한다. */
import { describe, expect, it } from "vitest";
import { RapierChassisSuspension } from "./RapierChassisSuspension";

describe("RapierChassisSuspension", () => {
  // 초기 차체가 네 raycast 접점에 안착하고 외부 평면 포즈 동기화를 수용해야 한다.
  it("settles a dynamic chassis on four raycast suspension contacts", async () => {
    // 테스트마다 독립된 Rapier world를 생성해 상태 간섭을 막는다.
    const rig = await RapierChassisSuspension.create();

    // 8초의 120Hz settling으로 초기 낙하와 서스펜션 감쇠를 충분히 진행한다.
    for (let step = 0; step < 960; step += 1) {
      rig.step(1 / 120);
    }

    // 차체 높이·속도와 네 접촉 결과를 한 시점에서 읽는다.
    const snapshot = rig.getSnapshot();
    // four raycast wheel의 접지와 압축 힘을 확인할 복사 결과다.
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
    // 외부 pose 동기화 후 전후륜 조향 운동학을 확인한다.
    const kinematics = rig.getWheelKinematics();
    expect(kinematics.frontLeft.steeringAngleRad).toBeCloseTo(0.225, 8);
    expect(kinematics.frontRight.steeringAngleRad).toBeCloseTo(0.225, 8);
    expect(kinematics.rearLeft.steeringAngleRad).toBe(0);
    expect(kinematics.frontLeft.longitudinalSpeedMps).toBeGreaterThan(15);

    rig.dispose();
  });

  // 접지점에 결합 타이어 힘을 적용하면 후륜 구동·조향·브레이크가 차체에 반영되어야 한다.
  it("applies combined tire forces at grounded Rapier contact points", async () => {
    const rig = await RapierChassisSuspension.create();

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

    // 직진 구동 후 위치·속도·슬립·후륜 회전 텔레메트리를 읽는다.
    const drivenSnapshot = rig.getSnapshot();
    // 접지 타이어 힘의 총합과 공력 요약 결과다.
    const drivenTelemetry = rig.getTelemetry();
    // 좌우 후륜 회전 상태를 검증할 타이어 상태 사본이다.
    const tireStates = rig.getWheelTireStates();

    expect(drivenSnapshot.position.z).toBeLessThan(-1);
    expect(drivenSnapshot.linearVelocity.z).toBeLessThan(-1);
    expect(Math.abs(drivenTelemetry.totalLongitudinalTireForceN)).toBeGreaterThan(100);
    expect(drivenTelemetry.maximumSlipRatio).toBeGreaterThan(0);
    expect(tireStates.rearLeft.wheelAngularSpeedRadS).toBeGreaterThan(0);

    // 조향 전 X 위치를 저장해 우회전 횡이동을 비교한다.
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

    // 조향 후 속도를 브레이크 전 기준값으로 저장한다.
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

  // 후륜 구동 토크·엔진 브레이크가 회전 상태와 공력에 함께 영향을 주는지 확인한다.
  it("applies rear drive torque, engine braking, and speed-dependent aero forces", async () => {
    const rig = await RapierChassisSuspension.create();

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

    // 구동 후 공력 텔레메트리와 후륜 각속도를 비교 기준으로 읽는다.
    const drivenTelemetry = rig.getTelemetry();
    // 같은 시점의 차체 속도와 방향을 읽는다.
    const drivenSnapshot = rig.getSnapshot();
    // 구동 토크가 후륜 회전으로 전달되는지 확인할 상태 사본이다.
    const tireStates = rig.getWheelTireStates();
    // 엔진 브레이크 전 속도를 저장해 이후 감속을 검증한다.
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
