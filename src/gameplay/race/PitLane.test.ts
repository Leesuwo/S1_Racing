/**
 * M4B 피트 레인 중심선·게이트·속도 제한·서비스 박스의 결정적 경계를 검증한다.
 * 차량 위치는 VehicleSimulation이 소유하므로 이 테스트는 모니터와 입력 생성 계약만 검사한다.
 */
import { describe, expect, it } from "vitest";
import { samplePitLaneLocation, sampleTestTrackLocation, TEST_TRACK_DATA } from "../../tracks/TestTrack";
import { PitLaneMonitor } from "./PitLane";

describe("PitLaneMonitor", () => {
  it("keeps the main start gate on the start straight and exposes the lane separately", () => {
    expect(sampleTestTrackLocation(TEST_TRACK_DATA.startPose.position).sectionId).toBe("start-straight");
    expect(sampleTestTrackLocation({ x: 0, z: 16.2 }).sectionId).toBe("pit-lane");
    expect(samplePitLaneLocation({ x: 0, z: 16.2 }, TEST_TRACK_DATA)?.withinLane).toBe(true);
  });

  it("detects a service box entry and one speed-limit violation event", () => {
    const monitor = new PitLaneMonitor(TEST_TRACK_DATA);
    monitor.request();
    const laneUpdate = monitor.update(
      { x: 0, z: 16.2 },
      { x: TEST_TRACK_DATA.pitLane!.speedLimitMps + 1, z: 0 },
      Math.PI / 2,
      false,
    );
    expect(laneUpdate.snapshot.status).toBe("in-lane");
    expect(laneUpdate.speedViolationStarted).toBe(true);
    expect(laneUpdate.snapshot.speedViolationCount).toBe(1);

    const boxUpdate = monitor.update(TEST_TRACK_DATA.pitLane!.pitBox, { x: 0, z: 0 }, Math.PI / 2, false);
    expect(boxUpdate.enteredBox).toBe(true);
    expect(boxUpdate.snapshot.status).toBe("box");
    expect(monitor.createControlInput(TEST_TRACK_DATA.pitLane!.pitBox, { x: 0, z: 0 }, Math.PI / 2).brake).toBeGreaterThanOrEqual(0);
  });
});
