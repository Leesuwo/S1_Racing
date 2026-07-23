/** 테스트 트랙의 아스팔트·인필드·이탈 구간과 경계 거리 계약을 검증한다. */
import { describe, expect, it } from "vitest";
import { isOnTestTrackAsphalt, sampleTestTrackLocation, sampleTestTrackSurface } from "./TrackSurface";

describe("TrackSurface", () => {
  // 외곽 루프는 아스팔트이고 내부 직사각형은 잔디여야 한다.
  it("classifies the rectangular test loop and its infield", () => {
    expect(isOnTestTrackAsphalt({ x: -10, z: 10 })).toBe(true);
    expect(isOnTestTrackAsphalt({ x: 0, z: 0 })).toBe(false);
    expect(sampleTestTrackSurface({ x: 0, z: 0 }).type).toBe("grass");
  });

  // 같은 데이터 원본에서 구간 ID와 외곽 경계까지 결정론적으로 계산되어야 한다.
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
