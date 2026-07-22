import { describe, expect, it } from "vitest";
import { neutralVehicleControlInput } from "../input/VehicleControlInput";
import { TEST_TRACK_DATA } from "../../tracks/TestTrack";
import { VehicleSimulation } from "./VehicleSimulation";

// 트랙 데이터가 VehicleSimulation의 초기 pose·텔레메트리·리셋 계약으로 이어지는지 확인한다.
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
});
