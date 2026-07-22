import { describe, expect, it } from "vitest";
import { isOnTestTrackAsphalt, sampleTestTrackLocation, sampleTestTrackSurface } from "./TrackSurface";

// 레거시 직사각형 샘플러와 데이터 기반 구간·경계 판정이 같은 노면 계약을 유지하는지 확인한다.
describe("TrackSurface", () => {
  it("classifies the rectangular test loop and its infield", () => {
    expect(isOnTestTrackAsphalt({ x: -10, z: 10 })).toBe(true);
    expect(isOnTestTrackAsphalt({ x: 0, z: 0 })).toBe(false);
    expect(sampleTestTrackSurface({ x: 0, z: 0 }).type).toBe("grass");
  });

  it("reports deterministic sections and boundary distance from track data", () => {
    expect(sampleTestTrackLocation({ x: -10, z: 10 })).toMatchObject({
      sectionId: "start-straight",
      onTrack: true,
      distanceToBoundaryM: 4,
    });
    expect(sampleTestTrackLocation({ x: 0, z: 0 })).toMatchObject({
      sectionId: "infield",
      onTrack: false,
    });
    expect(sampleTestTrackLocation({ x: 23, z: 10 })).toMatchObject({
      sectionId: "off-track",
      onTrack: false,
    });
  });
});
