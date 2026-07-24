/**
 * 렌더링·물리·입력·AI가 공유하는 반복 검증용 트랙 데이터 모델과 샘플이다.
 * 길이는 m, 방향은 rad, 목표 속도는 m/s이며 차량·실제 트랙 재현값이 아닌
 * initial_assumption이다. 주행 감각과 제동 지점은 simulation_required다.
 */
/** 트랙 노면의 물리 분류다. */
export type TestTrackSurfaceType = "asphalt" | "grass";

/** 트랙 평면의 위치 좌표다. +X는 오른쪽, -Z는 차량 전방 기준이다. */
export interface TrackPoint {
  x: number;
  z: number;
}

/** 축 정렬 직사각형의 포함 범위다. 단위는 m이다. */
export interface TrackBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** 외곽 아스팔트와 내부 인필드를 정의하는 반폭·반길이 설정이다. */
export interface TestTrackSurfaceLayout {
  outerHalfWidthM: number;
  outerHalfLengthM: number;
  innerHalfWidthM: number;
  innerHalfLengthM: number;
}

/** HUD와 AI가 사용할 트랙 구간 식별자다. */
export type TestTrackSectionId =
  | "start-straight"
  | "right-corner"
  | "back-straight"
  | "left-corner"
  | "high-speed-straight"
  | "heavy-braking"
  | "fast-complex"
  | "medium-corner"
  | "low-speed-exit"
  | "technical-link"
  | "infield"
  | "off-track";

/** 실제 주행 가능한 트랙 구간만 허용하는 섹션 식별자다. */
export type DrivenTrackSectionId = Exclude<TestTrackSectionId, "infield" | "off-track">;

/** 구간 표시명과 표면 판정 범위를 함께 정의한다. */
export interface TestTrackSection {
  id: TestTrackSectionId;
  label: string;
  bounds: TrackBounds;
  surface: TestTrackSurfaceType;
}

/** 시작/결승선과 제동 마커의 렌더링·검증 데이터다. */
export interface TestTrackMarker {
  id: string;
  label: string;
  kind: "start-finish" | "brake";
  position: TrackPoint;
  rotationRad: number;
  widthM: number;
  lengthM: number;
}

/** 순서가 있는 체크포인트와 통과 반경(m)이다. */
export interface TestTrackCheckpoint {
  id: string;
  order: number;
  label: string;
  position: TrackPoint;
  radiusM: number;
}

/** 차량을 재현 가능한 위치·방향에 배치하는 시작 포즈다. */
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

/** 렌더링·물리·평가기의 공통 기준이 되는 중심선 샘플이다. */
export interface TestTrackCenterlinePoint extends TrackPoint {
  id: string;
  sectionId: DrivenTrackSectionId;
  surface: TestTrackSurfaceType;
  curvaturePerM: number;
  elevationM?: number;
  bankingRad?: number;
}

/** 체크포인트 범위를 묶어 교육 시나리오와 HUD에 제공하는 섹터다. */
export interface TestTrackSector {
  id: string;
  order: number;
  label: string;
  startCheckpointOrder: number;
  endCheckpointOrder: number;
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
  /** 고정 폭 중심선 기반 트랙에서만 제공하는 상세 주행 데이터다. */
  centerline?: readonly TestTrackCenterlinePoint[];
  /** 중심선 좌우로 같은 폭을 적용하는 도로 폭(m)이다. */
  trackWidthM?: number;
  /** 교육 평가가 사용할 섹터 순서다. */
  sectors?: readonly TestTrackSector[];
}

export interface TestTrackLocation {
  sectionId: TestTrackSectionId;
  sectionLabel: string;
  surface: TestTrackSurfaceType;
  onTrack: boolean;
  distanceToBoundaryM: number;
}

// 섹션별 축 정렬 범위는 샘플 트랙의 단일 지오메트리 원본이다.
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

  // 경계 밖으로 벗어난 최대 축 거리를 signed distance로 반환하기 위한 중간값이다.
  const distanceOutside = Math.max(
    bounds.minX - point.x,
    point.x - bounds.maxX,
    bounds.minZ - point.z,
    point.z - bounds.maxZ,
    0,
  );
  return -distanceOutside;
}

/** 한 선분에 위치를 투영해 가장 가까운 거리와 보간점을 계산한다. */
function projectPointToSegment(
  point: TrackPoint,
  start: TestTrackCenterlinePoint,
  end: TestTrackCenterlinePoint,
): { distanceM: number; point: TrackPoint } {
  const segmentX = end.x - start.x;
  const segmentZ = end.z - start.z;
  const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  const ratio = segmentLengthSquared > 0
    ? Math.max(0, Math.min(1, ((point.x - start.x) * segmentX + (point.z - start.z) * segmentZ) / segmentLengthSquared))
    : 0;
  const projectedPoint = {
    x: start.x + segmentX * ratio,
    z: start.z + segmentZ * ratio,
  };
  return {
    distanceM: Math.hypot(point.x - projectedPoint.x, point.z - projectedPoint.z),
    point: projectedPoint,
  };
}

/** 중심선 폐곡선에서 위치와 가장 가까운 구간을 결정한다. */
function findNearestCenterlinePoint(
  point: TrackPoint,
  track: TestTrackDefinition,
): { distanceM: number; point: TrackPoint; source: TestTrackCenterlinePoint } | null {
  const centerline = track.centerline;
  if (!centerline || centerline.length < 2 || !track.trackWidthM || track.trackWidthM <= 0) return null;

  let nearest: { distanceM: number; point: TrackPoint; source: TestTrackCenterlinePoint } | null = null;
  centerline.forEach((start, index) => {
    const end = centerline[(index + 1) % centerline.length];
    const projection = projectPointToSegment(point, start, end);
    if (!nearest || projection.distanceM < nearest.distanceM) {
      nearest = { ...projection, source: start };
    }
  });
  return nearest;
}

/** 중심선·폭 데이터가 있는 트랙의 노면과 signed 경계 거리를 샘플링한다. */
function sampleCenterlineTrackLocation(
  point: TrackPoint,
  track: TestTrackDefinition,
): TestTrackLocation | null {
  const nearest = findNearestCenterlinePoint(point, track);
  if (!nearest || !track.trackWidthM) return null;

  const distanceToBoundaryM = track.trackWidthM * 0.5 - nearest.distanceM;
  const onTrack = distanceToBoundaryM >= 0 && nearest.source.surface === "asphalt";
  if (!onTrack) {
    return {
      sectionId: "off-track",
      sectionLabel: "트랙 이탈",
      surface: "grass",
      onTrack: false,
      distanceToBoundaryM,
    };
  }

  const section = track.sections.find((candidate) => candidate.id === nearest.source.sectionId);
  return {
    sectionId: nearest.source.sectionId,
    sectionLabel: section?.label ?? nearest.source.sectionId,
    surface: nearest.source.surface,
    onTrack: true,
    distanceToBoundaryM,
  };
}

export function isInsideTestTrackBoundary(
  point: TrackPoint,
  track: TestTrackDefinition = TEST_TRACK_DATA,
): boolean {
  // 상세 중심선 트랙은 도로 폭을 실제 경계로 사용하고, 기존 루프는 외곽 경계를 사용한다.
  const centerlineLocation = sampleCenterlineTrackLocation(point, track);
  if (centerlineLocation) return centerlineLocation.onTrack;
  // 외곽 경계 포함 여부만 검사하며 인필드 제외는 위치·노면 샘플러의 책임이다.
  return contains(track.outerBounds, point);
}

/** 위치가 체크포인트의 원형 통과 반경 안에 있는지 판정한다. */
export function isInsideCheckpoint(
  point: TrackPoint,
  checkpoint: TestTrackCheckpoint,
): boolean {
  return Math.hypot(point.x - checkpoint.position.x, point.z - checkpoint.position.z) <= checkpoint.radiusM;
}

/** 위치를 off-track, 인필드, 외곽 아스팔트 구간으로 결정론적으로 분류한다. */
export function sampleTestTrackLocation(
  point: TrackPoint,
  track: TestTrackDefinition = TEST_TRACK_DATA,
): TestTrackLocation {
  // M2A-0 교육 트랙은 중심선과 폭을 단일 원본으로 사용해 곡선 도로를 샘플링한다.
  const centerlineLocation = sampleCenterlineTrackLocation(point, track);
  if (centerlineLocation) return centerlineLocation;

  // 외곽 경계와의 signed distance는 이탈 시 음수가 되어 HUD에 경계 방향을 제공한다.
  const onTrack = isInsideTestTrackBoundary(point, track);
  // 외곽 경계까지의 거리(m)는 트랙 안에서 양수, 이탈 시 음수다.
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

  // 데이터에 명시된 첫 구간을 사용하고 겹침·누락 시 안전한 기본 구간을 사용한다.
  const section = track.sections.find((candidate) => contains(candidate.bounds, point));
  return {
    sectionId: section?.id ?? "start-straight",
    sectionLabel: section?.label ?? "외곽 루프",
    surface: "asphalt",
    onTrack: true,
    distanceToBoundaryM,
  };
}

/** 여러 좌표를 같은 트랙 정의로 순회 샘플링해 리플레이 검증 결과를 만든다. */
export function replayTestTrackLocations(
  points: readonly TrackPoint[],
  track: TestTrackDefinition = TEST_TRACK_DATA,
): readonly TestTrackLocation[] {
  return points.map((point) => sampleTestTrackLocation(point, track));
}
