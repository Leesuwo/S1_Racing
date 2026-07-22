import { describe, expect, it } from "vitest";
import {
  isInsideCheckpoint,
  isInsideTestTrackBoundary,
  replayTestTrackLocations,
  TEST_TRACK_DATA,
} from "./TestTrack";

// 트랙 데이터의 마커·체크포인트 순서와 외곽 경계·리셋 판정을 검증한다.
describe("TestTrack data", () => {
  it("keeps marker and checkpoint order stable for repeatable runs", () => {
    expect(TEST_TRACK_DATA.markers.map((marker) => marker.id)).toEqual([
      "start-finish",
      "brake-100",
      "brake-50",
    ]);
    expect(TEST_TRACK_DATA.checkpoints.map((checkpoint) => checkpoint.order)).toEqual([0, 1, 2, 3]);

    // 동일 위치 배열은 매 실행 같은 구간 sequence를 반환해야 한다.
    const route = replayTestTrackLocations([
      TEST_TRACK_DATA.startPose.position,
      { x: 0, z: 0 },
      { x: 23, z: 10 },
    ]);
    expect(route.map((location) => location.sectionId)).toEqual([
      "start-straight",
      "infield",
      "off-track",
    ]);
    expect(route[1].onTrack).toBe(false);
  });

  it("uses the outer bounds for reset and boundary decisions", () => {
    // 시작점과 외곽 경계를 같은 데이터 원본에서 읽는지 확인한다.
    const startCheckpoint = TEST_TRACK_DATA.checkpoints[0];

    expect(isInsideTestTrackBoundary(TEST_TRACK_DATA.startPose.position)).toBe(true);
    expect(isInsideTestTrackBoundary({ x: 22.1, z: 10 })).toBe(false);
    expect(isInsideCheckpoint(TEST_TRACK_DATA.startPose.position, startCheckpoint)).toBe(true);
    expect(isInsideCheckpoint({ x: -4, z: 10 }, startCheckpoint)).toBe(false);
  });
});
