/**
 * M2A-0의 독립 AI 교육 트랙 원본이다.
 * 고속 직선·강한 제동·고속 복합·중속 코너·저속 탈출을 하나의 중심선 폐곡선으로
 * 표현하며, 모든 길이·속도·곡률 값은 실제 서킷 복제값이 아닌 initial_assumption이다.
 */
import type {
  TestTrackCenterlinePoint,
  TestTrackDefinition,
  TestTrackRacingLinePoint,
} from "./TestTrack";

/** 중심선의 모든 점에 적용하는 초기 노면 분류다. */
const ASPHALT: TestTrackCenterlinePoint["surface"] = "asphalt";

/** 중심선은 긴 고속 구간과 흐르는 복합 코너를 연결하는 독창적인 대형 폐곡선으로 고정한다. */
const NORTHFIELD_CENTERLINE: readonly TestTrackCenterlinePoint[] = [
  { id: "nf-00", x: -94, z: 58, sectionId: "high-speed-straight", surface: ASPHALT, curvaturePerM: 0.001 },
  { id: "nf-01", x: -64, z: 60, sectionId: "high-speed-straight", surface: ASPHALT, curvaturePerM: 0.002 },
  { id: "nf-02", x: -32, z: 59, sectionId: "high-speed-straight", surface: ASPHALT, curvaturePerM: 0.004 },
  { id: "nf-03", x: 2, z: 55, sectionId: "high-speed-straight", surface: ASPHALT, curvaturePerM: 0.009 },
  { id: "nf-04", x: 30, z: 48, sectionId: "heavy-braking", surface: ASPHALT, curvaturePerM: 0.018 },
  { id: "nf-05", x: 56, z: 32, sectionId: "heavy-braking", surface: ASPHALT, curvaturePerM: 0.034 },
  { id: "nf-06", x: 72, z: 10, sectionId: "heavy-braking", surface: ASPHALT, curvaturePerM: 0.052 },
  { id: "nf-07", x: 70, z: -14, sectionId: "fast-complex", surface: ASPHALT, curvaturePerM: -0.041 },
  { id: "nf-08", x: 57, z: -33, sectionId: "fast-complex", surface: ASPHALT, curvaturePerM: -0.031 },
  { id: "nf-09", x: 38, z: -46, sectionId: "fast-complex", surface: ASPHALT, curvaturePerM: 0.026 },
  { id: "nf-10", x: 14, z: -51, sectionId: "fast-complex", surface: ASPHALT, curvaturePerM: 0.046 },
  { id: "nf-11", x: -6, z: -47, sectionId: "low-speed-exit", surface: ASPHALT, curvaturePerM: 0.084 },
  { id: "nf-12", x: -19, z: -32, sectionId: "low-speed-exit", surface: ASPHALT, curvaturePerM: 0.112 },
  { id: "nf-13", x: -21, z: -13, sectionId: "low-speed-exit", surface: ASPHALT, curvaturePerM: 0.074 },
  { id: "nf-14", x: -12, z: 4, sectionId: "low-speed-exit", surface: ASPHALT, curvaturePerM: -0.041 },
  { id: "nf-15", x: 4, z: 20, sectionId: "medium-corner", surface: ASPHALT, curvaturePerM: -0.028 },
  { id: "nf-16", x: 21, z: 33, sectionId: "medium-corner", surface: ASPHALT, curvaturePerM: 0.032 },
  { id: "nf-17", x: 22, z: 46, sectionId: "medium-corner", surface: ASPHALT, curvaturePerM: 0.048 },
  { id: "nf-18", x: 8, z: 52, sectionId: "medium-corner", surface: ASPHALT, curvaturePerM: 0.033 },
  { id: "nf-19", x: -15, z: 46, sectionId: "technical-link", surface: ASPHALT, curvaturePerM: -0.024 },
  { id: "nf-20", x: -40, z: 34, sectionId: "technical-link", surface: ASPHALT, curvaturePerM: -0.019 },
  { id: "nf-21", x: -62, z: 22, sectionId: "technical-link", surface: ASPHALT, curvaturePerM: -0.027 },
  { id: "nf-22", x: -80, z: 5, sectionId: "technical-link", surface: ASPHALT, curvaturePerM: -0.039 },
  { id: "nf-23", x: -96, z: -16, sectionId: "technical-link", surface: ASPHALT, curvaturePerM: 0.056 },
  { id: "nf-24", x: -113, z: -5, sectionId: "technical-link", surface: ASPHALT, curvaturePerM: 0.064 },
  { id: "nf-25", x: -117, z: 18, sectionId: "technical-link", surface: ASPHALT, curvaturePerM: 0.037 },
  { id: "nf-26", x: -112, z: 41, sectionId: "technical-link", surface: ASPHALT, curvaturePerM: 0.018 },
  { id: "nf-27", x: -104, z: 54, sectionId: "technical-link", surface: ASPHALT, curvaturePerM: 0.012 },
] as const;

/** 레이싱 라인 포즈와 목표 속도는 중심선과 분리해 코너 진입·탈출의 주행 의도를 표현한다. */
const NORTHFIELD_RACING_LINE_SEED = [
  { id: "northfield-start", x: -94, z: 58, targetSpeedMps: 46 },
  { id: "northfield-high-speed-1", x: -64, z: 59, targetSpeedMps: 51 },
  { id: "northfield-high-speed-2", x: -32, z: 58, targetSpeedMps: 55 },
  { id: "northfield-high-speed-3", x: 1, z: 53, targetSpeedMps: 57 },
  { id: "northfield-heavy-brake", x: 29, z: 46, targetSpeedMps: 54, brakePoint: true },
  { id: "northfield-heavy-apex", x: 54, z: 30, targetSpeedMps: 42, apex: true },
  { id: "northfield-heavy-exit", x: 69, z: 10, targetSpeedMps: 32 },
  { id: "northfield-fast-entry", x: 68, z: -13, targetSpeedMps: 34 },
  { id: "northfield-fast-left", x: 55, z: -32, targetSpeedMps: 38, apex: true },
  { id: "northfield-fast-right", x: 36, z: -44, targetSpeedMps: 42, apex: true },
  { id: "northfield-fast-exit", x: 13, z: -49, targetSpeedMps: 39 },
  { id: "northfield-low-brake", x: -5, z: -45, targetSpeedMps: 28, brakePoint: true },
  { id: "northfield-low-apex", x: -17, z: -32, targetSpeedMps: 20, apex: true },
  { id: "northfield-low-exit", x: -19, z: -14, targetSpeedMps: 22 },
  { id: "northfield-low-release", x: -11, z: 3, targetSpeedMps: 28 },
  { id: "northfield-medium-entry", x: 4, z: 20, targetSpeedMps: 35 },
  { id: "northfield-medium-apex", x: 19, z: 33, targetSpeedMps: 40, apex: true },
  { id: "northfield-medium-exit", x: 20, z: 45, targetSpeedMps: 43 },
  { id: "northfield-link-entry", x: 7, z: 51, targetSpeedMps: 45 },
  { id: "northfield-link-sweep", x: -15, z: 45, targetSpeedMps: 47 },
  { id: "northfield-link-mid", x: -40, z: 33, targetSpeedMps: 49 },
  { id: "northfield-link-brake", x: -61, z: 21, targetSpeedMps: 46, brakePoint: true },
  { id: "northfield-link-apex", x: -79, z: 4, targetSpeedMps: 41, apex: true },
  { id: "northfield-link-hairpin", x: -95, z: -14, targetSpeedMps: 28, apex: true },
  { id: "northfield-link-exit-1", x: -110, z: -5, targetSpeedMps: 24 },
  { id: "northfield-link-exit-2", x: -114, z: 17, targetSpeedMps: 32 },
  { id: "northfield-link-exit-3", x: -110, z: 40, targetSpeedMps: 38 },
  { id: "northfield-finish-entry", x: -103, z: 53, targetSpeedMps: 44 },
] as const;

/** 물리 좌표계의 전방 벡터 `(sin(yaw), -cos(yaw))`에 맞춰 점의 진행 방향을 계산한다. */
function headingForPoint(index: number): number {
  const point = NORTHFIELD_RACING_LINE_SEED[index];
  const next = NORTHFIELD_RACING_LINE_SEED[(index + 1) % NORTHFIELD_RACING_LINE_SEED.length];
  return Math.atan2(next.x - point.x, -(next.z - point.z));
}

/** 레이싱 라인 원본을 AI가 소비하는 완전한 방향·속도 데이터로 변환한다. */
const NORTHFIELD_RACING_LINE: readonly TestTrackRacingLinePoint[] = NORTHFIELD_RACING_LINE_SEED.map(
  (point, index) => ({
    id: point.id,
    position: { x: point.x, z: point.z },
    yawRad: headingForPoint(index),
    targetSpeedMps: point.targetSpeedMps,
    ...(("brakePoint" in point && point.brakePoint) ? { brakePoint: true } : {}),
    ...(("apex" in point && point.apex) ? { apex: true } : {}),
  }),
);

/** 중심선 구간을 화면·HUD에서 설명할 수 있도록 넓은 디버그 범위를 제공한다. */
const NORTHFIELD_SECTIONS: TestTrackDefinition["sections"] = [
  {
    id: "high-speed-straight",
    label: "고속 가속 구간",
    bounds: { minX: -104, maxX: 35, minZ: 42, maxZ: 70 },
    surface: ASPHALT,
  },
  {
    id: "heavy-braking",
    label: "강제동 진입",
    bounds: { minX: 20, maxX: 86, minZ: -4, maxZ: 58 },
    surface: ASPHALT,
  },
  {
    id: "fast-complex",
    label: "고속 복합 코너",
    bounds: { minX: 6, maxX: 84, minZ: -60, maxZ: 22 },
    surface: ASPHALT,
  },
  {
    id: "low-speed-exit",
    label: "저속 코너 탈출",
    bounds: { minX: -36, maxX: 24, minZ: -60, maxZ: 10 },
    surface: ASPHALT,
  },
  {
    id: "medium-corner",
    label: "중속 코너",
    bounds: { minX: -20, maxX: 34, minZ: 0, maxZ: 60 },
    surface: ASPHALT,
  },
  {
    id: "technical-link",
    label: "기술 복귀 구간",
    bounds: { minX: -132, maxX: -4, minZ: -25, maxZ: 62 },
    surface: ASPHALT,
  },
];

/** 렌더링·평가가 공유하는 섹터 경계다. 실제 레이스 운영 순위와는 분리한다. */
const NORTHFIELD_SECTORS: TestTrackDefinition["sectors"] = [
  { id: "sector-1", order: 0, label: "S1 · 고속 접근·강제동", startCheckpointOrder: 0, endCheckpointOrder: 1 },
  { id: "sector-2", order: 1, label: "S2 · 복합·저속", startCheckpointOrder: 1, endCheckpointOrder: 3 },
  { id: "sector-3", order: 2, label: "S3 · 흐르는 연결", startCheckpointOrder: 3, endCheckpointOrder: 5 },
];

/** M2A-0 교육·물리·렌더링이 함께 읽는 Northfield GP 단일 데이터 원본이다. */
export const NORTHFIELD_GP_DATA: TestTrackDefinition = {
  id: "northfield-gp-v1",
  name: "Northfield GP",
  surfaceLayout: {
    outerHalfWidthM: 132,
    outerHalfLengthM: 74,
    innerHalfWidthM: 32,
    innerHalfLengthM: 18,
  },
  outerBounds: { minX: -132, maxX: 90, minZ: -65, maxZ: 74 },
  innerGrassBounds: { minX: -36, maxX: 24, minZ: -18, maxZ: 18 },
  sections: NORTHFIELD_SECTIONS,
  sectors: NORTHFIELD_SECTORS,
  trackWidthM: 11.5,
  centerline: NORTHFIELD_CENTERLINE,
  markers: [
    {
      id: "northfield-start-finish",
      label: "Northfield Start / Finish",
      kind: "start-finish",
      position: { x: -94, z: 58 },
      rotationRad: 0.07,
      widthM: 0.8,
      lengthM: 11.5,
    },
    {
      id: "northfield-heavy-brake",
      label: "Heavy Brake",
      kind: "brake",
      position: { x: 29, z: 46 },
      rotationRad: 0.24,
      widthM: 0.16,
      lengthM: 11.5,
    },
    {
      id: "northfield-fast-brake",
      label: "Complex Entry",
      kind: "brake",
      position: { x: 69, z: 10 },
      rotationRad: 0.72,
      widthM: 0.16,
      lengthM: 11.5,
    },
    {
      id: "northfield-low-brake",
      label: "Low Speed Brake",
      kind: "brake",
      position: { x: -5, z: -45 },
      rotationRad: 1.35,
      widthM: 0.16,
      lengthM: 11.5,
    },
    {
      id: "northfield-link-brake",
      label: "Technical Link Brake",
      kind: "brake",
      position: { x: -61, z: 21 },
      rotationRad: 0.64,
      widthM: 0.16,
      lengthM: 11.5,
    },
  ],
  checkpoints: [
    { id: "northfield-start", order: 0, label: "Start", position: { x: -94, z: 58 }, radiusM: 5.75 },
    { id: "northfield-heavy-entry", order: 1, label: "Heavy Braking", position: { x: 29, z: 46 }, radiusM: 5.75 },
    { id: "northfield-fast-complex", order: 2, label: "Fast Complex", position: { x: 55, z: -32 }, radiusM: 5.75 },
    { id: "northfield-low-speed", order: 3, label: "Low Speed Apex", position: { x: -17, z: -32 }, radiusM: 5.75 },
    { id: "northfield-medium", order: 4, label: "Medium Corner", position: { x: 19, z: 33 }, radiusM: 5.75 },
    { id: "northfield-link", order: 5, label: "Technical Link", position: { x: -79, z: 4 }, radiusM: 5.75 },
    // 시작점과 분리된 마지막 체크포인트로 두어 전체 랩이 실제 결승선 재통과에서만 끝나게 한다.
    { id: "northfield-finish", order: 6, label: "Finish", position: { x: -94, z: 58 }, radiusM: 5.75 },
  ],
  startPose: {
    position: { x: -94, z: 58 },
    yawRad: NORTHFIELD_RACING_LINE[0].yawRad,
  },
  opponentStartPose: {
    position: { x: -100, z: 55 },
    yawRad: NORTHFIELD_RACING_LINE[27].yawRad,
  },
  racingLine: NORTHFIELD_RACING_LINE,
};
