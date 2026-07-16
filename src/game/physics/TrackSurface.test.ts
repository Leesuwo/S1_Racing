import { describe, expect, it } from "vitest";
import { isOnTestTrackAsphalt, sampleTestTrackSurface } from "./TrackSurface";

describe("TrackSurface", () => {
  it("classifies the rectangular test loop and its infield", () => {
    expect(isOnTestTrackAsphalt({ x: -10, z: 10 })).toBe(true);
    expect(isOnTestTrackAsphalt({ x: 0, z: 0 })).toBe(false);
    expect(sampleTestTrackSurface({ x: 0, z: 0 }).type).toBe("grass");
  });
});
