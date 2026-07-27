/**
 * M3A 트랙 리밋의 도로 경계·랩 무효화·패널티·리셋을 검증한다.
 * TestTrack의 위치 샘플러와 같은 원본을 사용해 화면·물리·규칙 경계가 갈라지지 않는지 확인한다.
 */
import { describe, expect, it } from "vitest";
import { TEST_TRACK_DATA } from "../../tracks/TestTrack";
import { TrackLimitsMonitor } from "./TrackLimits";

describe("TrackLimitsMonitor", () => {
  it("marks a lap invalid and adds one penalty when crossing the track edge", () => {
    const monitor = new TrackLimitsMonitor(TEST_TRACK_DATA);
    const valid = monitor.update({ x: -10, z: 10 }, 1 / 120);
    const invalid = monitor.update({ x: 23, z: 10 }, 1 / 120);
    const continued = monitor.update({ x: 24, z: 10 }, 1 / 120);

    expect(valid.onTrack).toBe(true);
    expect(invalid.status).toBe("off-track");
    expect(invalid.lapValid).toBe(false);
    expect(invalid.violationCount).toBe(1);
    expect(invalid.penaltySeconds).toBeGreaterThan(1);
    expect(continued.violationCount).toBe(1);
  });

  it("starts the next lap with valid state while preserving session penalties", () => {
    const monitor = new TrackLimitsMonitor(TEST_TRACK_DATA);
    monitor.update({ x: 23, z: 10 }, 1 / 120);
    monitor.startLap();
    const snapshot = monitor.update({ x: -10, z: 10 }, 1 / 120);

    expect(snapshot.lapValid).toBe(true);
    expect(snapshot.lapViolationCount).toBe(0);
    expect(snapshot.violationCount).toBe(1);
    expect(snapshot.penaltySeconds).toBeGreaterThan(0);
  });

  it("resets all counters to the start pose", () => {
    const monitor = new TrackLimitsMonitor(TEST_TRACK_DATA);
    monitor.update({ x: 23, z: 10 }, 1 / 120);
    monitor.reset();

    expect(monitor.getSnapshot()).toEqual({
      status: "on-track",
      onTrack: true,
      lapValid: true,
      violationCount: 0,
      lapViolationCount: 0,
      offTrackDurationSeconds: 0,
      penaltySeconds: 0,
      distanceToBoundaryM: 4,
      sectionId: "start-straight",
      sectionLabel: "스타트 직선",
    });
  });
});
