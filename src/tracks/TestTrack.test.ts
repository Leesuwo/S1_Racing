import { describe, expect, it } from "vitest";
import {
  isInsideCheckpoint,
  isInsideTestTrackBoundary,
  replayTestTrackLocations,
  TEST_TRACK_DATA,
} from "./TestTrack";

describe("TestTrack data", () => {
  it("keeps marker and checkpoint order stable for repeatable runs", () => {
    expect(TEST_TRACK_DATA.markers.map((marker) => marker.id)).toEqual([
      "start-finish",
      "brake-100",
      "brake-50",
    ]);
    expect(TEST_TRACK_DATA.checkpoints.map((checkpoint) => checkpoint.order)).toEqual([0, 1, 2, 3]);

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
    const startCheckpoint = TEST_TRACK_DATA.checkpoints[0];

    expect(isInsideTestTrackBoundary(TEST_TRACK_DATA.startPose.position)).toBe(true);
    expect(isInsideTestTrackBoundary({ x: 22.1, z: 10 })).toBe(false);
    expect(isInsideCheckpoint(TEST_TRACK_DATA.startPose.position, startCheckpoint)).toBe(true);
    expect(isInsideCheckpoint({ x: -4, z: 10 }, startCheckpoint)).toBe(false);
  });
});
