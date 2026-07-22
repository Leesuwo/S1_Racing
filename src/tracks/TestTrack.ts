export type TestTrackSurfaceType = "asphalt" | "grass";

export interface TrackPoint {
  x: number;
  z: number;
}

export interface TrackBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface TestTrackSurfaceLayout {
  outerHalfWidthM: number;
  outerHalfLengthM: number;
  innerHalfWidthM: number;
  innerHalfLengthM: number;
}

export type TestTrackSectionId =
  | "start-straight"
  | "right-corner"
  | "back-straight"
  | "left-corner"
  | "infield"
  | "off-track";

export interface TestTrackSection {
  id: TestTrackSectionId;
  label: string;
  bounds: TrackBounds;
  surface: TestTrackSurfaceType;
}

export interface TestTrackMarker {
  id: string;
  label: string;
  kind: "start-finish" | "brake";
  position: TrackPoint;
  rotationRad: number;
  widthM: number;
  lengthM: number;
}

export interface TestTrackCheckpoint {
  id: string;
  order: number;
  label: string;
  position: TrackPoint;
  radiusM: number;
}

export interface TestTrackStartPose {
  position: TrackPoint;
  yawRad: number;
}

/** 레이싱 라인 한 점의 위치·방향·목표 속도와 선택적 제동 진입점을 정의한다. */
export interface TestTrackRacingLinePoint {
  id: string;
  position: TrackPoint;
  yawRad: number;
  targetSpeedMps: number;
  brakePoint?: boolean;
}

/**
 * 물리 표면, 경계, 체크포인트와 AI 경로가 공유하는 테스트 트랙 단일 원본이다.
 * 렌더링·물리·AI가 각각 같은 지오메트리를 재구성하지 않도록 유지한다.
 */
export interface TestTrackDefinition {
  id: string;
  name: string;
  surfaceLayout: TestTrackSurfaceLayout;
  outerBounds: TrackBounds;
  innerGrassBounds: TrackBounds;
  sections: readonly TestTrackSection[];
  markers: readonly TestTrackMarker[];
  checkpoints: readonly TestTrackCheckpoint[];
  startPose: TestTrackStartPose;
  opponentStartPose: TestTrackStartPose;
  racingLine: readonly TestTrackRacingLinePoint[];
}

export interface TestTrackLocation {
  sectionId: TestTrackSectionId;
  sectionLabel: string;
  surface: TestTrackSurfaceType;
  onTrack: boolean;
  distanceToBoundaryM: number;
}

const TEST_TRACK_SECTION_BOUNDS = {
  startStraight: { minX: -13, maxX: 13, minZ: 6, maxZ: 14 },
  rightCorner: { minX: 13, maxX: 22, minZ: -6, maxZ: 6 },
  backStraight: { minX: -13, maxX: 13, minZ: -14, maxZ: -6 },
  leftCorner: { minX: -22, maxX: -13, minZ: -6, maxZ: 6 },
} as const;

/**
 * 외부 자산 없이 반복 검증하기 위한 테스트 트랙이다.
 * racingLine의 좌표는 m, targetSpeedMps는 m/s이며 실제 트랙 재현값이 아닌
 * initial_assumption이다. AI 주행 감각과 제동 지점은 simulation_required로 검증한다.
 */
export const TEST_TRACK_DATA: TestTrackDefinition = {
  id: "s1-test-loop-v1",
  name: "S1 반복 검증 루프",
  surfaceLayout: {
    outerHalfWidthM: 22,
    outerHalfLengthM: 14,
    innerHalfWidthM: 13,
    innerHalfLengthM: 6,
  },
  outerBounds: { minX: -22, maxX: 22, minZ: -14, maxZ: 14 },
  innerGrassBounds: { minX: -13, maxX: 13, minZ: -6, maxZ: 6 },
  sections: [
    {
      id: "start-straight",
      label: "스타트 직선",
      bounds: TEST_TRACK_SECTION_BOUNDS.startStraight,
      surface: "asphalt",
    },
    {
      id: "right-corner",
      label: "우측 코너",
      bounds: TEST_TRACK_SECTION_BOUNDS.rightCorner,
      surface: "asphalt",
    },
    {
      id: "back-straight",
      label: "백 스트레이트",
      bounds: TEST_TRACK_SECTION_BOUNDS.backStraight,
      surface: "asphalt",
    },
    {
      id: "left-corner",
      label: "좌측 코너",
      bounds: TEST_TRACK_SECTION_BOUNDS.leftCorner,
      surface: "asphalt",
    },
  ],
  markers: [
    {
      id: "start-finish",
      label: "Start / Finish",
      kind: "start-finish",
      position: { x: -10, z: 10 },
      rotationRad: 0,
      widthM: 0.7,
      lengthM: 8,
    },
    {
      id: "brake-100",
      label: "100 m",
      kind: "brake",
      position: { x: 8, z: 10 },
      rotationRad: 0,
      widthM: 0.14,
      lengthM: 8,
    },
    {
      id: "brake-50",
      label: "50 m",
      kind: "brake",
      position: { x: 11, z: 10 },
      rotationRad: 0,
      widthM: 0.14,
      lengthM: 8,
    },
  ],
  checkpoints: [
    { id: "checkpoint-start", order: 0, label: "스타트", position: { x: -10, z: 10 }, radiusM: 4 },
    { id: "checkpoint-right", order: 1, label: "우측 코너", position: { x: 18, z: 0 }, radiusM: 4 },
    { id: "checkpoint-back", order: 2, label: "백 스트레이트", position: { x: 0, z: -10 }, radiusM: 4 },
    { id: "checkpoint-left", order: 3, label: "좌측 코너", position: { x: -18, z: 0 }, radiusM: 4 },
  ],
  startPose: {
    position: { x: -10, z: 10 },
    yawRad: Math.PI / 2,
  },
  opponentStartPose: {
    position: { x: -12, z: 12 },
    yawRad: Math.PI / 2,
  },
  racingLine: [
    { id: "start", position: { x: -10, z: 10 }, yawRad: Math.PI / 2, targetSpeedMps: 46 },
    { id: "start-run", position: { x: 0, z: 10 }, yawRad: Math.PI / 2, targetSpeedMps: 48 },
    {
      id: "right-brake-100",
      position: { x: 8, z: 10 },
      yawRad: Math.PI / 2,
      targetSpeedMps: 44,
      brakePoint: true,
    },
    {
      id: "right-brake-50",
      position: { x: 12.5, z: 8 },
      yawRad: 1.1,
      targetSpeedMps: 32,
      brakePoint: true,
    },
    { id: "right-entry", position: { x: 16, z: 5.5 }, yawRad: 0.35, targetSpeedMps: 26 },
    { id: "right-apex", position: { x: 18, z: 0 }, yawRad: 0, targetSpeedMps: 22 },
    { id: "right-exit", position: { x: 18, z: -5.5 }, yawRad: 0, targetSpeedMps: 24 },
    { id: "back-entry", position: { x: 16, z: -8 }, yawRad: -2.3, targetSpeedMps: 34 },
    { id: "back-run", position: { x: 0, z: -10 }, yawRad: -Math.PI / 2, targetSpeedMps: 50 },
    {
      id: "left-brake-100",
      position: { x: -12.5, z: -8 },
      yawRad: -2.15,
      targetSpeedMps: 42,
      brakePoint: true,
    },
    { id: "left-entry", position: { x: -16, z: -5.5 }, yawRad: -2.8, targetSpeedMps: 26 },
    { id: "left-apex", position: { x: -18, z: 0 }, yawRad: Math.PI, targetSpeedMps: 22 },
    { id: "left-exit", position: { x: -18, z: 5.5 }, yawRad: Math.PI, targetSpeedMps: 24 },
    { id: "finish-entry", position: { x: -16, z: 8 }, yawRad: 2.2, targetSpeedMps: 34 },
  ],
};

function contains(bounds: TrackBounds, point: TrackPoint): boolean {
  return point.x >= bounds.minX
    && point.x <= bounds.maxX
    && point.z >= bounds.minZ
    && point.z <= bounds.maxZ;
}

function distanceToOuterBoundary(bounds: TrackBounds, point: TrackPoint): number {
  if (contains(bounds, point)) {
    return Math.min(
      point.x - bounds.minX,
      bounds.maxX - point.x,
      point.z - bounds.minZ,
      bounds.maxZ - point.z,
    );
  }

  const distanceOutside = Math.max(
    bounds.minX - point.x,
    point.x - bounds.maxX,
    bounds.minZ - point.z,
    point.z - bounds.maxZ,
    0,
  );
  return -distanceOutside;
}

export function isInsideTestTrackBoundary(
  point: TrackPoint,
  track: TestTrackDefinition = TEST_TRACK_DATA,
): boolean {
  return contains(track.outerBounds, point);
}

export function isInsideCheckpoint(
  point: TrackPoint,
  checkpoint: TestTrackCheckpoint,
): boolean {
  return Math.hypot(point.x - checkpoint.position.x, point.z - checkpoint.position.z) <= checkpoint.radiusM;
}

export function sampleTestTrackLocation(
  point: TrackPoint,
  track: TestTrackDefinition = TEST_TRACK_DATA,
): TestTrackLocation {
  const onTrack = isInsideTestTrackBoundary(point, track);
  const distanceToBoundaryM = distanceToOuterBoundary(track.outerBounds, point);

  if (!onTrack) {
    return {
      sectionId: "off-track",
      sectionLabel: "트랙 이탈",
      surface: "grass",
      onTrack: false,
      distanceToBoundaryM,
    };
  }

  if (contains(track.innerGrassBounds, point)) {
    return {
      sectionId: "infield",
      sectionLabel: "인필드 잔디",
      surface: "grass",
      onTrack: false,
      distanceToBoundaryM,
    };
  }

  const section = track.sections.find((candidate) => contains(candidate.bounds, point));
  return {
    sectionId: section?.id ?? "start-straight",
    sectionLabel: section?.label ?? "외곽 루프",
    surface: "asphalt",
    onTrack: true,
    distanceToBoundaryM,
  };
}

export function replayTestTrackLocations(
  points: readonly TrackPoint[],
  track: TestTrackDefinition = TEST_TRACK_DATA,
): readonly TestTrackLocation[] {
  return points.map((point) => sampleTestTrackLocation(point, track));
}
