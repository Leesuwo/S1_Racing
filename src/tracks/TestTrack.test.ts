/** 테스트 트랙 데이터의 순서·레이싱 라인·경계·체크포인트 계약을 검증한다. */
import { describe, expect, it } from "vitest";
import {
  isInsideCheckpoint,
  isInsideTestTrackBoundary,
  replayTestTrackLocations,
  TEST_TRACK_DATA,
} from "./TestTrack";

describe("TestTrack data", () => {
  // 마커·체크포인트·레이싱 라인의 순서와 단위 데이터는 AI와 경계 판정의 결정적 원본이다.
  it("keeps marker and checkpoint order stable for repeatable runs", () => {
    expect(TEST_TRACK_DATA.markers.map((marker) => marker.id)).toEqual([
      "start-finish",
      "brake-100",
      "brake-50",
    ]);
    expect(TEST_TRACK_DATA.checkpoints.map((checkpoint) => checkpoint.order)).toEqual([0, 1, 2, 3]);

    // 시작·인필드·이탈을 한 번에 샘플링해 section 순서를 검증한다.
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

  // 두 차량의 시작 포즈가 분리되어도 같은 트랙 경계 안에서 리셋되어야 한다.
  it("keeps the AI racing line ordered with explicit speed and brake data", () => {
    expect(TEST_TRACK_DATA.racingLine.length).toBeGreaterThan(8);
    expect(TEST_TRACK_DATA.racingLine.every((point) => point.targetSpeedMps > 0)).toBe(true);
    expect(TEST_TRACK_DATA.racingLine.filter((point) => point.brakePoint).map((point) => point.id)).toEqual([
      "right-brake-100",
      "right-brake-50",
      "left-brake-100",
    ]);
    expect(TEST_TRACK_DATA.opponentStartPose.position).not.toEqual(TEST_TRACK_DATA.startPose.position);
  });

  it("uses the outer bounds for reset and boundary decisions", () => {
    // 체크포인트 반경 검증에 사용하는 데이터 정의 첫 체크포인트다.
    const startCheckpoint = TEST_TRACK_DATA.checkpoints[0];

    expect(isInsideTestTrackBoundary(TEST_TRACK_DATA.startPose.position)).toBe(true);
    expect(isInsideTestTrackBoundary({ x: 22.1, z: 10 })).toBe(false);
    expect(isInsideCheckpoint(TEST_TRACK_DATA.startPose.position, startCheckpoint)).toBe(true);
    expect(isInsideCheckpoint({ x: -4, z: 10 }, startCheckpoint)).toBe(false);
  });
});
