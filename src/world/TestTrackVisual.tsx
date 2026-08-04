/**
 * 트랙 데이터만 읽어 테스트 루프와 M2A-0 교육 트랙을 표시하는 디버그 월드다.
 * 외부 모델·지도·브랜딩을 사용하지 않으며, 중심선 트랙은 런타임 물리 샘플러와
 * 같은 `TestTrackDefinition`에서 도로 폭과 마커를 생성한다.
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { TEST_TRACK_DATA, type TestTrackDefinition } from "../tracks/TestTrack";
import { VISUAL_PALETTE } from "./VisualPalette";

/** 트랙 표시가 차량·교육 장면으로부터 받는 읽기 전용 입력이다. */
interface TestTrackVisualProps {
  track?: TestTrackDefinition;
}

/** 도로와 지면이 겹치지 않도록 사용하는 공통 디버그 높이(m)다. */
const TRACK_EDGE_Y = -0.39;
/** 사각 트랙의 도로 링을 잔디 바닥보다 올려 depth buffer 겹침을 막는 높이(m)다. */
const RECTANGULAR_ROAD_Y = -0.42;
/** 중심선 트랙의 시각 어깨를 노면보다 낮게 두어 도로·경계·잔디의 높이 순서를 만든다. */
const CENTERLINE_SHOULDER_Y = -0.415;
/** 중심선 트랙의 얇은 경계선이 도로보다 살짝 높게 보이도록 하는 렌더 전용 높이(m)다. */
const CENTERLINE_EDGE_Y = -0.382;
/** 중심선 도로 양쪽에 추가하는 평탄한 어깨 폭(m)이며 물리 폭에는 사용하지 않는다. */
const CENTERLINE_SHOULDER_EXTRA_M = 0.78;
/** 중심선 도로 가장자리의 색 띠 폭(m)이며 경계 판정과 분리된 시각 표식이다. */
const CENTERLINE_EDGE_BAND_M = 0.16;
/** 사각 트랙의 시각 어깨가 도로 바깥·인필드 안쪽으로 확장되는 폭(m)이다. */
const RECTANGULAR_SHOULDER_EXTRA_M = 0.62;

/** 축 정렬 범위의 길이(m)를 계산한다. */
function boundsSize(min: number, max: number): number {
  return max - min;
}

/** 축 정렬 범위의 중앙 좌표를 계산한다. */
function boundsCenter(min: number, max: number): number {
  return (min + max) * 0.5;
}

/** 중심선 폐곡선의 좌우 띠를 평면 geometry로 변환한다. */
function createCenterlineBandGeometry(
  track: TestTrackDefinition,
  innerHalfWidthM: number,
  outerHalfWidthM: number,
  y: number,
): THREE.BufferGeometry | null {
  if (!track.centerline || track.centerline.length < 3 || !track.trackWidthM) return null;

  // 폭 순서가 뒤집히면 삼각형 winding과 도로 경계가 뒤틀리므로 렌더 전용 입력을 방어한다.
  const safeInnerHalfWidthM = Math.max(0, innerHalfWidthM);
  const safeOuterHalfWidthM = Math.max(safeInnerHalfWidthM, outerHalfWidthM);

  // Catmull-Rom 보간은 데이터 샘플 사이의 급격한 방향 단절을 시각적으로 완화한다.
  const curve = new THREE.CatmullRomCurve3(
    track.centerline.map((point) => new THREE.Vector3(point.x, y, point.z)),
    true,
    "centripetal",
    0.2,
  );
  const sampleCount = Math.max(96, track.centerline.length * 8);
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    // 끝점을 중복하지 않아 폐곡선 마지막 쿼드가 첫 점과 자연스럽게 연결되게 한다.
    const ratio = index / sampleCount;
    const point = curve.getPointAt(ratio);
    const tangent = curve.getTangentAt(ratio).normalize();
    // +X/+Z 평면에서 tangent의 왼쪽을 구해 양쪽 도로 가장자리를 만든다.
    const left = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    // 좌우 두 겹의 띠를 한 geometry에 넣어 중심선 샘플과 도로 폭의 위상 차이를 줄인다.
    const leftOuterPoint = point.clone().addScaledVector(left, safeOuterHalfWidthM);
    const leftInnerPoint = point.clone().addScaledVector(left, safeInnerHalfWidthM);
    const rightInnerPoint = point.clone().addScaledVector(left, -safeInnerHalfWidthM);
    const rightOuterPoint = point.clone().addScaledVector(left, -safeOuterHalfWidthM);
    vertices.push(
      leftOuterPoint.x, leftOuterPoint.y, leftOuterPoint.z,
      leftInnerPoint.x, leftInnerPoint.y, leftInnerPoint.z,
      rightInnerPoint.x, rightInnerPoint.y, rightInnerPoint.z,
      rightOuterPoint.x, rightOuterPoint.y, rightOuterPoint.z,
    );

    const nextIndex = (index + 1) % sampleCount;
    const currentVertex = index * 4;
    const nextVertex = nextIndex * 4;
    // 왼쪽·오른쪽 띠를 분리해 중앙 도로 면은 기존 geometry가 계속 소유하게 한다.
    indices.push(
      currentVertex, nextVertex, currentVertex + 1,
      currentVertex + 1, nextVertex, nextVertex + 1,
      currentVertex + 2, nextVertex + 2, currentVertex + 3,
      currentVertex + 3, nextVertex + 2, nextVertex + 3,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** 중심선 도로 주변의 낮은 어깨 띠를 표시해 잔디와 노면을 빠르게 분리한다. */
function CenterlineShoulder({ track }: { track: TestTrackDefinition }) {
  const geometry = useMemo(() => {
    const halfWidthM = (track.trackWidthM ?? 0) * 0.5;
    return createCenterlineBandGeometry(
      track,
      halfWidthM,
      halfWidthM + CENTERLINE_SHOULDER_EXTRA_M,
      CENTERLINE_SHOULDER_Y,
    );
  }, [track]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={VISUAL_PALETTE.track.shoulder} roughness={1} flatShading side={THREE.DoubleSide} />
    </mesh>
  );
}

/** 중심선 도로의 양쪽에 따뜻한 경계 색 띠를 추가해 다음 코너의 폭을 읽게 한다. */
function CenterlineEdgeBands({ track }: { track: TestTrackDefinition }) {
  const geometry = useMemo(() => {
    const halfWidthM = (track.trackWidthM ?? 0) * 0.5;
    return createCenterlineBandGeometry(
      track,
      halfWidthM + 0.02,
      halfWidthM + 0.02 + CENTERLINE_EDGE_BAND_M,
      CENTERLINE_EDGE_Y,
    );
  }, [track]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={VISUAL_PALETTE.track.roadEdge} roughness={0.88} flatShading side={THREE.DoubleSide} />
    </mesh>
  );
}

/** 중심선 도로 geometry를 어깨와 경계선 위에 올리는 기존 주행 면이다. */
function CenterlineRoad({ track }: { track: TestTrackDefinition }) {
  const geometry = useMemo(() => {
    const halfWidthM = (track.trackWidthM ?? 0) * 0.5;
    return createCenterlineBandGeometry(track, 0, halfWidthM, TRACK_EDGE_Y);
  }, [track]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={VISUAL_PALETTE.track.road} roughness={0.96} flatShading side={THREE.DoubleSide} />
    </mesh>
  );
}

/** 내부 잔디 구멍을 가진 사각 도로 링을 하나의 geometry로 생성한다. */
function createRectangularRoadGeometry(track: TestTrackDefinition): THREE.ShapeGeometry {
  const { outerBounds, innerGrassBounds } = track;
  // ShapeGeometry는 XY 평면을 사용하므로 -Z를 Y축으로 넣어 회전 뒤 원래 좌표계를 보존한다.
  const shape = new THREE.Shape();
  shape.moveTo(outerBounds.minX, -outerBounds.minZ);
  shape.lineTo(outerBounds.maxX, -outerBounds.minZ);
  shape.lineTo(outerBounds.maxX, -outerBounds.maxZ);
  shape.lineTo(outerBounds.minX, -outerBounds.maxZ);
  shape.closePath();

  // hole 방향은 외곽 path와 반대로 구성해 내부 잔디 영역을 도로 삼각화에서 제외한다.
  const hole = new THREE.Path();
  hole.moveTo(innerGrassBounds.minX, -innerGrassBounds.minZ);
  hole.lineTo(innerGrassBounds.minX, -innerGrassBounds.maxZ);
  hole.lineTo(innerGrassBounds.maxX, -innerGrassBounds.maxZ);
  hole.lineTo(innerGrassBounds.maxX, -innerGrassBounds.minZ);
  hole.closePath();
  shape.holes.push(hole);

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, RECTANGULAR_ROAD_Y, 0);
  return geometry;
}

/** 사각 트랙의 물리 도로보다 낮고 넓은 시각 어깨 링을 생성한다. */
function createRectangularShoulderGeometry(track: TestTrackDefinition): THREE.ShapeGeometry {
  const { outerBounds, innerGrassBounds } = track;
  const extra = RECTANGULAR_SHOULDER_EXTRA_M;
  const outerMinZ = outerBounds.minZ - extra;
  const outerMaxZ = outerBounds.maxZ + extra;
  const holeMinZ = innerGrassBounds.minZ + extra;
  const holeMaxZ = innerGrassBounds.maxZ - extra;
  const shape = new THREE.Shape();
  shape.moveTo(outerBounds.minX - extra, -outerMinZ);
  shape.lineTo(outerBounds.maxX + extra, -outerMinZ);
  shape.lineTo(outerBounds.maxX + extra, -outerMaxZ);
  shape.lineTo(outerBounds.minX - extra, -outerMaxZ);
  shape.closePath();

  // 내부 hole을 줄여 어깨가 안쪽 도로 경계에서도 같은 높이 계층을 갖게 한다.
  const hole = new THREE.Path();
  hole.moveTo(innerGrassBounds.minX + extra, -holeMinZ);
  hole.lineTo(innerGrassBounds.minX + extra, -holeMaxZ);
  hole.lineTo(innerGrassBounds.maxX - extra, -holeMaxZ);
  hole.lineTo(innerGrassBounds.maxX - extra, -holeMinZ);
  hole.closePath();
  shape.holes.push(hole);

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, CENTERLINE_SHOULDER_Y, 0);
  return geometry;
}

/** 사각 테스트 루프의 낮은 어깨 띠를 렌더링하는 전용 컴포넌트다. */
function RectangularShoulder({ track }: { track: TestTrackDefinition }) {
  const geometry = useMemo(() => createRectangularShoulderGeometry(track), [track]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={VISUAL_PALETTE.track.shoulder} roughness={1} flatShading />
    </mesh>
  );
}

/** 사각 테스트 루프의 도로를 잔디와 겹치지 않는 단일 링으로 표시한다. */
function RectangularRoad({ track }: { track: TestTrackDefinition }) {
  const geometry = useMemo(() => createRectangularRoadGeometry(track), [track]);

  useEffect(() => () => {
    geometry.dispose();
  }, [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={VISUAL_PALETTE.track.road} roughness={0.96} flatShading />
    </mesh>
  );
}

/** 공통 마커와 순서가 고정된 체크포인트를 데이터 위치에 표시한다. */
function TrackMarkers({ track }: { track: TestTrackDefinition }) {
  return (
    <>
      {track.markers.map((marker) => (
        <mesh
          key={marker.id}
          rotation={[-Math.PI / 2, 0, marker.rotationRad]}
          position={[marker.position.x, TRACK_EDGE_Y - 0.01, marker.position.z]}
        >
          <planeGeometry args={[marker.widthM, marker.lengthM]} />
          <meshBasicMaterial color={marker.kind === "start-finish" ? VISUAL_PALETTE.track.startFinish : VISUAL_PALETTE.track.brakeMarker} />
        </mesh>
      ))}
      {track.checkpoints.map((checkpoint) => (
        <mesh
          key={checkpoint.id}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[checkpoint.position.x, TRACK_EDGE_Y - 0.02, checkpoint.position.z]}
        >
          <ringGeometry args={[checkpoint.radiusM - 0.08, checkpoint.radiusM, 32]} />
          <meshBasicMaterial color={VISUAL_PALETTE.track.checkpoint} transparent opacity={0.34} />
        </mesh>
      ))}
    </>
  );
}

/** 선분의 중심·길이·회전값을 계산해 화면과 Rapier가 같은 방향을 사용하게 한다. */
function segmentTransform(start: { x: number; z: number }, end: { x: number; z: number }) {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  return {
    centerX: (start.x + end.x) * 0.5,
    centerZ: (start.z + end.z) * 0.5,
    lengthM: Math.hypot(deltaX, deltaZ),
    rotationRad: Math.atan2(-deltaZ, deltaX),
  };
}

/** 트랙 정의의 정적 벽과 연석을 표시해 물리 경계를 운전 중 관찰할 수 있게 한다. */
function TrackCollisionVisuals({ track }: { track: TestTrackDefinition }) {
  return (
    <>
      {track.collisionWalls?.map((wall) => {
        const transform = segmentTransform(wall.start, wall.end);
        return (
          <group key={wall.id}>
            <mesh
              position={[transform.centerX, TRACK_EDGE_Y + wall.heightM * 0.5, transform.centerZ]}
              rotation={[0, transform.rotationRad, 0]}
              castShadow
            >
              <boxGeometry args={[transform.lengthM, wall.heightM, wall.thicknessM]} />
              <meshStandardMaterial color={wall.id.startsWith("inner-") ? VISUAL_PALETTE.track.wallInner : VISUAL_PALETTE.track.wallOuter} roughness={0.82} flatShading />
            </mesh>
            <mesh
              position={[transform.centerX, TRACK_EDGE_Y + wall.heightM + 0.018, transform.centerZ]}
              rotation={[0, transform.rotationRad, 0]}
              castShadow
            >
              {/* 상단 캡은 충돌 높이를 바꾸지 않고 벽의 수직 면과 외곽선을 분리한다. */}
              <boxGeometry args={[transform.lengthM + 0.02, 0.036, wall.thicknessM + 0.025]} />
              <meshStandardMaterial color={VISUAL_PALETTE.track.wallTop} roughness={0.78} flatShading />
            </mesh>
          </group>
        );
      })}
      {track.curbs?.map((curb) => {
        const transform = segmentTransform(curb.start, curb.end);
        return (
          <mesh
            key={curb.id}
            position={[transform.centerX, TRACK_EDGE_Y + curb.heightM * 0.5, transform.centerZ]}
            rotation={[0, transform.rotationRad, 0]}
            receiveShadow
          >
            <boxGeometry args={[transform.lengthM, curb.heightM, curb.widthM]} />
          <meshStandardMaterial color={VISUAL_PALETTE.track.curb} roughness={0.86} flatShading />
          </mesh>
        );
      })}
    </>
  );
}

/** M4B 피트 레인 중심선·속도 제한 구역·서비스 박스를 데이터 원본에서 표시한다. */
function PitLaneVisual({ track }: { track: TestTrackDefinition }) {
  const pitLane = track.pitLane;
  if (!pitLane || pitLane.centerline.length < 2) return null;
  return (
    <group>
      {pitLane.centerline.slice(0, -1).map((start, index) => {
        const end = pitLane.centerline[index + 1]!;
        const transform = segmentTransform(start, end);
        return (
          <mesh
            key={pitLane.id + "-segment-" + String(index)}
            position={[transform.centerX, TRACK_EDGE_Y + 0.012, transform.centerZ]}
            rotation={[-Math.PI / 2, 0, transform.rotationRad]}
          >
            <planeGeometry args={[transform.lengthM, pitLane.widthM]} />
            <meshBasicMaterial color="#263f54" transparent opacity={0.72} />
          </mesh>
        );
      })}
      <mesh position={[pitLane.pitBox.x, TRACK_EDGE_Y + 0.025, pitLane.pitBox.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[pitLane.pitBoxRadiusM - 0.08, pitLane.pitBoxRadiusM, 24]} />
        <meshBasicMaterial color="#e6b85b" transparent opacity={0.85} />
      </mesh>
      <mesh position={[pitLane.entryGate.x, TRACK_EDGE_Y + 0.03, pitLane.entryGate.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.18, pitLane.widthM]} />
        <meshBasicMaterial color="#f4e1a1" />
      </mesh>
      <mesh position={[pitLane.exitGate.x, TRACK_EDGE_Y + 0.03, pitLane.exitGate.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.18, pitLane.widthM]} />
        <meshBasicMaterial color="#78d8bd" />
      </mesh>
    </group>
  );
}

/** 기존 사각 테스트 루프의 도로·인필드 표시를 유지한다. */
function RectangularTestLoop({ track }: { track: TestTrackDefinition }) {
  const { innerGrassBounds } = track;
  const infieldWidth = boundsSize(innerGrassBounds.minX, innerGrassBounds.maxX);
  const infieldLength = boundsSize(innerGrassBounds.minZ, innerGrassBounds.maxZ);

  return (
    <>
      <RectangularShoulder track={track} />
      <RectangularRoad track={track} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[boundsCenter(innerGrassBounds.minX, innerGrassBounds.maxX), -0.46, boundsCenter(innerGrassBounds.minZ, innerGrassBounds.maxZ)]}
      >
        <planeGeometry args={[infieldWidth, infieldLength]} />
        <meshStandardMaterial color={VISUAL_PALETTE.track.grass} roughness={1} flatShading />
      </mesh>
    </>
  );
}

/** 중심선 교육 트랙이 사용할 넓은 잔디 바탕을 표시한다. */
function TrackGround({ track }: { track: TestTrackDefinition }) {
  const { outerBounds } = track;
  const groundWidth = boundsSize(outerBounds.minX, outerBounds.maxX) + 14;
  const groundLength = boundsSize(outerBounds.minZ, outerBounds.maxZ) + 12;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[boundsCenter(outerBounds.minX, outerBounds.maxX), -0.5, boundsCenter(outerBounds.minZ, outerBounds.maxZ)]}
      receiveShadow
    >
      <planeGeometry args={[groundWidth, groundLength]} />
      <meshStandardMaterial color={VISUAL_PALETTE.track.grassShadow} roughness={1} flatShading />
    </mesh>
  );
}

/** 트랙 데이터에 따라 중심선 도로 또는 기존 테스트 루프를 선택해 표시한다. */
export function TestTrackVisual({ track = TEST_TRACK_DATA }: TestTrackVisualProps) {
  const hasCenterline = Boolean(track.centerline && track.trackWidthM);
  return (
    <group>
      <TrackGround track={track} />
      {hasCenterline ? (
        <>
          <CenterlineShoulder track={track} />
          <CenterlineRoad track={track} />
          <CenterlineEdgeBands track={track} />
        </>
      ) : <RectangularTestLoop track={track} />}
      <TrackCollisionVisuals track={track} />
      <PitLaneVisual track={track} />
      <TrackMarkers track={track} />
    </group>
  );
}
