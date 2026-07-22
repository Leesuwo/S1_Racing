/** 트랙 평면에서 사용하는 X/Z 좌표다. 단위는 m이며 Y는 별도로 표현하지 않는다. */
export type TestTrackSurfaceType = "asphalt" | "grass";

/** 경계·마커·체크포인트가 공유하는 X/Z 평면 좌표다. 단위는 m이다. */
export interface TrackPoint {
  x: number;
  z: number;
}

/** X/Z 평면에서 축에 평행한 직사각형 경계다. 경계선 위의 점은 내부로 간주한다. */
export interface TrackBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** 시각화와 간단한 표면 샘플러가 공유하는 트랙 반폭·반길이다. 단위는 m이다. */
export interface TestTrackSurfaceLayout {
  outerHalfWidthM: number;
  outerHalfLengthM: number;
  innerHalfWidthM: number;
  innerHalfLengthM: number;
}

/** UI·텔레메트리·AI가 사용할 수 있도록 트랙 구간을 고정된 식별자로 표현한다. */
export type TestTrackSectionId =
  | "start-straight"
  | "right-corner"
  | "back-straight"
  | "left-corner"
  | "infield"
  | "off-track";

/** 한 구간의 판정 경계와 노면 종류를 묶는다. */
export interface TestTrackSection {
  id: TestTrackSectionId;
  label: string;
  bounds: TrackBounds;
  surface: TestTrackSurfaceType;
}

/** 시각화용 시작/결승선 또는 제동 마커의 위치·방향·크기다. */
export interface TestTrackMarker {
  id: string;
  label: string;
  kind: "start-finish" | "brake";
  position: TrackPoint;
  rotationRad: number;
  widthM: number;
  lengthM: number;
}

/** 순서를 가진 랩 진행 판정점이다. 반경 안으로 들어오면 해당 체크포인트를 통과한 것으로 본다. */
export interface TestTrackCheckpoint {
  id: string;
  order: number;
  label: string;
  position: TrackPoint;
  radiusM: number;
}

/** 차량 리셋 시 사용할 시작 위치와 물리 yaw다. yaw 단위는 radian이다. */
export interface TestTrackStartPose {
  position: TrackPoint;
  yawRad: number;
}

/**
 * 물리 표면 샘플러, 브라우저 HUD, R3F 시각화가 함께 읽는 트랙의 단일 데이터 원본이다.
 * 실제 레이아웃이 아닌 반복 검증용 초기 가정이며, 확장 시 이 정의를 먼저 변경한다.
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
}

/** 한 위치를 샘플링한 결과. `onTrack`은 인필드 잔디와 외곽 이탈을 모두 false로 표시한다. */
export interface TestTrackLocation {
  sectionId: TestTrackSectionId;
  sectionLabel: string;
  surface: TestTrackSurfaceType;
  onTrack: boolean;
  distanceToBoundaryM: number;
}

// 구간 경계는 현재 반복 검증 루프의 단순 직사각형 분할이다. 실제 트랙 형상으로 확정된 값이 아니다.
const TEST_TRACK_SECTION_BOUNDS = {
  startStraight: { minX: -13, maxX: 13, minZ: 6, maxZ: 14 },
  rightCorner: { minX: 13, maxX: 22, minZ: -6, maxZ: 6 },
  backStraight: { minX: -13, maxX: 13, minZ: -14, maxZ: -6 },
  leftCorner: { minX: -22, maxX: -13, minZ: -6, maxZ: 6 },
} as const;

/**
 * Milestone 1F의 결정적인 테스트 루프 정의다. 모든 치수는 m, 방향은 radian이며
 * 특정 실차·실제 서킷을 재현하지 않는 `initial_assumption`이다.
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
};

/** 경계 내부 여부를 포함 경계 규칙으로 판정한다. */
function contains(bounds: TrackBounds, point: TrackPoint): boolean {
  return point.x >= bounds.minX
    && point.x <= bounds.maxX
    && point.z >= bounds.minZ
    && point.z <= bounds.maxZ;
}

/** 외곽 경계까지의 부호 있는 거리다. 내부는 양수, 경계는 0, 외부는 음수다. */
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

/** 테스트 트랙 외곽 아스팔트 영역 안에 있는지 판정한다. */
export function isInsideTestTrackBoundary(
  point: TrackPoint,
  track: TestTrackDefinition = TEST_TRACK_DATA,
): boolean {
  return contains(track.outerBounds, point);
}

/** 체크포인트 중심과의 X/Z 평면 거리가 반경 이내인지 판정한다. */
export function isInsideCheckpoint(
  point: TrackPoint,
  checkpoint: TestTrackCheckpoint,
): boolean {
  return Math.hypot(point.x - checkpoint.position.x, point.z - checkpoint.position.z) <= checkpoint.radiusM;
}

/**
 * 위치를 외곽 이탈·인필드 잔디·아스팔트 구간 중 하나로 분류한다.
 * 정의된 구간과 겹치지 않는 내부 아스팔트는 `외곽 루프`로 보존해 새 구간 추가에도 안전하다.
 */
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

/** 재현 가능한 위치 배열을 동일한 트랙 정의로 순서대로 샘플링한다. */
export function replayTestTrackLocations(
  points: readonly TrackPoint[],
  track: TestTrackDefinition = TEST_TRACK_DATA,
): readonly TestTrackLocation[] {
  return points.map((point) => sampleTestTrackLocation(point, track));
}
