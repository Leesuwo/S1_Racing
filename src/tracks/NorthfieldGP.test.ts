/** Northfield GP의 독창성 경계·중심선 샘플링·AI 주행 데이터 계약을 검증한다. */
import { describe, expect, it } from "vitest";
import { NORTHFIELD_GP_DATA } from "./NorthfieldGP";
import { replayTestTrackLocations, sampleTestTrackLocation } from "./TestTrack";

describe("Northfield GP track data", () => {
  it("keeps the documented curriculum sections and deterministic route data", () => {
    expect(NORTHFIELD_GP_DATA.name).toBe("Northfield GP");
    expect(NORTHFIELD_GP_DATA.centerline?.length).toBeGreaterThanOrEqual(28);
    expect(NORTHFIELD_GP_DATA.trackWidthM).toBe(11.5);
    expect(NORTHFIELD_GP_DATA.sections.map((section) => section.id)).toEqual([
      "high-speed-straight",
      "heavy-braking",
      "fast-complex",
      "low-speed-exit",
      "medium-corner",
      "technical-link",
    ]);
    expect(NORTHFIELD_GP_DATA.sectors?.map((sector) => sector.order)).toEqual([0, 1, 2]);
    expect(NORTHFIELD_GP_DATA.checkpoints.map((checkpoint) => checkpoint.order)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("samples asphalt, signed track edge distance, and grass from the same centerline", () => {
    // 첫 직선의 법선을 데이터에서 계산해 트랙 폭 변경에도 경계 검증의 의미를 유지한다.
    const [startPoint, nextPoint] = NORTHFIELD_GP_DATA.centerline ?? [];
    const trackWidthM = NORTHFIELD_GP_DATA.trackWidthM;

    if (!startPoint || !nextPoint || !trackWidthM) throw new Error("Northfield 중심선과 폭이 필요합니다.");

    const segmentX = nextPoint.x - startPoint.x;
    const segmentZ = nextPoint.z - startPoint.z;
    const segmentLengthM = Math.hypot(segmentX, segmentZ);
    const normal = { x: -segmentZ / segmentLengthM, z: segmentX / segmentLengthM };
    const nearEdgeDistanceM = trackWidthM * 0.5 - 0.005;
    const offTrackDistanceM = trackWidthM * 0.5 + 0.5;
    const onTrack = sampleTestTrackLocation({ x: startPoint.x, z: startPoint.z }, NORTHFIELD_GP_DATA);
    const nearEdge = sampleTestTrackLocation({
      x: startPoint.x + normal.x * nearEdgeDistanceM,
      z: startPoint.z + normal.z * nearEdgeDistanceM,
    }, NORTHFIELD_GP_DATA);
    const offTrack = sampleTestTrackLocation({
      x: startPoint.x + normal.x * offTrackDistanceM,
      z: startPoint.z + normal.z * offTrackDistanceM,
    }, NORTHFIELD_GP_DATA);

    expect(onTrack).toMatchObject({
      sectionId: "high-speed-straight",
      surface: "asphalt",
      onTrack: true,
    });
    expect(onTrack.distanceToBoundaryM).toBeGreaterThan(5);
    expect(nearEdge.onTrack).toBe(true);
    expect(nearEdge.distanceToBoundaryM).toBeGreaterThanOrEqual(0);
    expect(nearEdge.distanceToBoundaryM).toBeLessThan(0.01);
    expect(offTrack).toMatchObject({ sectionId: "off-track", surface: "grass", onTrack: false });
    expect(offTrack.distanceToBoundaryM).toBeLessThan(0);
  });

  it("keeps racing-line target speeds and brake points aligned with the curriculum", () => {
    const brakePoints = NORTHFIELD_GP_DATA.racingLine
      .filter((point) => point.brakePoint)
      .map((point) => point.id);
    const targetSpeeds = NORTHFIELD_GP_DATA.racingLine.map((point) => point.targetSpeedMps);

    expect(brakePoints).toEqual([
      "northfield-heavy-brake",
      "northfield-heavy-apex",
      "northfield-heavy-exit",
      "northfield-low-brake",
      "northfield-low-apex",
      "northfield-link-brake",
      "northfield-link-hairpin",
    ]);
    expect(Math.max(...targetSpeeds)).toBe(57);
    expect(Math.min(...targetSpeeds)).toBe(20);
  });

  it("replays the same section sequence for the same centerline samples", () => {
    const points = NORTHFIELD_GP_DATA.centerline?.map((point) => ({ x: point.x, z: point.z })) ?? [];
    const first = replayTestTrackLocations(points, NORTHFIELD_GP_DATA);
    const second = replayTestTrackLocations(points, NORTHFIELD_GP_DATA);

    expect(first).toEqual(second);
    expect(first.filter((location) => location.onTrack)).toHaveLength(points.length);
  });
});
