import { describe, expect, it } from "vitest";
import { neutralVehicleControlInput } from "../input/VehicleControlInput";
import { TEST_TRACK_DATA } from "../../tracks/TestTrack";
import { VehicleSimulation } from "./VehicleSimulation";

describe("VehicleSimulation track contract", () => {
  it("starts in the data-defined section and reports the outer boundary", () => {
    const simulation = new VehicleSimulation();
    const telemetry = simulation.getTelemetry();

    expect(telemetry.trackSectionId).toBe("start-straight");
    expect(telemetry.trackSectionLabel).toBe("스타트 직선");
    expect(telemetry.onTrack).toBe(true);
    expect(telemetry.distanceToBoundaryM).toBe(4);
  });

  it("resets the vehicle to the deterministic track start pose", () => {
    const simulation = new VehicleSimulation();

    for (let step = 0; step < 120; step += 1) {
      simulation.step({ ...neutralVehicleControlInput(), throttle: 1 }, 1 / 120);
    }

    simulation.reset();

    expect(simulation.current.position).toEqual(TEST_TRACK_DATA.startPose.position);
    expect(simulation.current.yawRad).toBe(TEST_TRACK_DATA.startPose.yawRad);
    expect(simulation.current.speedMps).toBe(0);
    expect(simulation.getTelemetry().trackSectionId).toBe("start-straight");
  });

  it("exposes the front axle steering angle to the render snapshot", () => {
    const simulation = new VehicleSimulation();

    // 렌더러가 동일한 차량 설정의 조향 한계를 사용해야 입력과 앞축 방향이 어긋나지 않는다.
    simulation.step({ ...neutralVehicleControlInput(), steering: 0.5 }, 1 / 120);

    expect(simulation.getRenderSnapshot(1).steeringAngleRad).toBeCloseTo(
      simulation.config.maxSteeringAngleRad * 0.5,
      8,
    );
  });

  it("exposes four-wheel visual spin and reverses its direction for reverse wheel speed", () => {
    const simulation = new VehicleSimulation();
    const forwardInput = { ...neutralVehicleControlInput(), throttle: 1 };

    // 순수 AI 교육 경로도 Rapier 화면 경로와 같은 -Z 전방 회전 부호를 사용해야 한다.
    for (let step = 0; step < 240; step += 1) simulation.step(forwardInput, 1 / 120);
    const forwardSpin = simulation.getRenderSnapshot(1).wheelSpinRad;

    expect(simulation.current.forwardSpeedMps).toBeGreaterThan(0);
    expect(Object.values(forwardSpin).every((spinRad) => Number.isFinite(spinRad))).toBe(true);

    const forwardSimulation = new VehicleSimulation();
    forwardSimulation.synchronizeFromExternalPose({
      position: forwardSimulation.current.position,
      velocity: { x: 0, z: 0 },
      yawRad: forwardSimulation.current.yawRad,
      yawRateRadS: 0,
      wheelAngularSpeedRadS: {
        frontLeft: 20,
        frontRight: 20,
        rearLeft: 20,
        rearRight: 20,
      },
    }, 1 / 120);
    const forwardExternalSpin = forwardSimulation.getRenderSnapshot(1).wheelSpinRad;

    const reverseSimulation = new VehicleSimulation();
    reverseSimulation.synchronizeFromExternalPose({
      position: reverseSimulation.current.position,
      velocity: { x: 0, z: 0 },
      yawRad: reverseSimulation.current.yawRad,
      yawRateRadS: 0,
      wheelAngularSpeedRadS: {
        frontLeft: -20,
        frontRight: -20,
        rearLeft: -20,
        rearRight: -20,
      },
    }, 1 / 120);
    const reverseSpin = reverseSimulation.getRenderSnapshot(1).wheelSpinRad;

    expect(forwardExternalSpin.frontLeft).toBeLessThan(0);
    expect(forwardExternalSpin.frontRight).toBeLessThan(0);
    expect(forwardExternalSpin.rearLeft).toBeLessThan(0);
    expect(forwardExternalSpin.rearRight).toBeLessThan(0);
    expect(reverseSpin.frontLeft).toBeGreaterThan(0);
    expect(reverseSpin.frontRight).toBeGreaterThan(0);
    expect(reverseSpin.rearLeft).toBeGreaterThan(0);
    expect(reverseSpin.rearRight).toBeGreaterThan(0);
  });
});
