/** VehicleSimulation의 트랙 위치·리셋·플레이어/AI 시작 포즈 계약을 검증한다. */
import { describe, expect, it } from "vitest";
import { neutralVehicleControlInput } from "../input/VehicleControlInput";
import { TEST_TRACK_DATA } from "../../tracks/TestTrack";
import { VehicleSimulation } from "./VehicleSimulation";

describe("VehicleSimulation track contract", () => {
  // 플레이어 시뮬레이션은 기존 데이터 정의 시작점과 경계 텔레메트리를 보존한다.
  it("starts in the data-defined section and reports the outer boundary", () => {
    // 기본 시작 포즈를 가진 브리지 인스턴스와 읽기 전용 HUD 샘플이다.
    const simulation = new VehicleSimulation();
    const telemetry = simulation.getTelemetry();

    expect(telemetry.trackSectionId).toBe("start-straight");
    expect(telemetry.trackSectionLabel).toBe("스타트 직선");
    expect(telemetry.onTrack).toBe(true);
    expect(telemetry.distanceToBoundaryM).toBe(4);
  });

  // 리셋은 누적된 속도·RPM 상태를 지우고 다음 반복 주행의 동일한 포즈를 보장한다.
  it("resets the vehicle to the deterministic track start pose", () => {
    // reset 전후의 동일한 데이터 정의 시작 포즈를 비교할 인스턴스다.
    const simulation = new VehicleSimulation();

    // 실제 주행으로 상태를 더럽힌 뒤 리셋의 완전성을 확인한다.
    for (let step = 0; step < 120; step += 1) {
      simulation.step({ ...neutralVehicleControlInput(), throttle: 1 }, 1 / 120);
    }

    simulation.reset();

    expect(simulation.current.position).toEqual(TEST_TRACK_DATA.startPose.position);
    expect(simulation.current.yawRad).toBe(TEST_TRACK_DATA.startPose.yawRad);
    expect(simulation.current.speedMps).toBe(0);
    expect(simulation.getTelemetry().trackSectionId).toBe("start-straight");
  });

  // AI도 위치를 순간이동하지 않고 자체 시작 포즈에서 같은 Simulation 경계를 사용한다.
  it("supports a separate data-defined opponent start pose", () => {
    // AI는 플레이어와 다른 시작 포즈를 쓰되 같은 Simulation 계약을 유지한다.
    const simulation = new VehicleSimulation(
      undefined,
      TEST_TRACK_DATA,
      TEST_TRACK_DATA.opponentStartPose,
    );

    expect(simulation.current.position).toEqual(TEST_TRACK_DATA.opponentStartPose.position);
    simulation.step({ ...neutralVehicleControlInput(), throttle: 1 }, 1 / 120);
    simulation.reset();

    expect(simulation.current.position).toEqual(TEST_TRACK_DATA.opponentStartPose.position);
    expect(simulation.current.yawRad).toBe(TEST_TRACK_DATA.opponentStartPose.yawRad);
  });
});
