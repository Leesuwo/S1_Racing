/**
 * 트랙 데이터만 읽어 테스트 루프와 M2A-0 교육 트랙을 표시하는 디버그 월드다.
 * 외부 모델·지도·브랜딩을 사용하지 않으며, 중심선 트랙은 런타임 물리 샘플러와
 * 같은 `TestTrackDefinition`에서 도로 폭과 마커를 생성한다.
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { TEST_TRACK_DATA, type TestTrackDefinition } from "../tracks/TestTrack";

/** 트랙 표시가 차량·교육 장면으로부터 받는 읽기 전용 입력이다. */
interface TestTrackVisualProps {
  track?: TestTrackDefinition;
}

/** 도로와 지면이 겹치지 않도록 사용하는 공통 디버그 높이(m)다. */
const TRACK_EDGE_Y = -0.39;

/** 축 정렬 범위의 길이(m)를 계산한다. */
function boundsSize(min: number, max: number): number {
  return max - min;
}

/** 축 정렬 범위의 중앙 좌표를 계산한다. */
function boundsCenter(min: number, max: number): number {
  return (min + max) * 0.5;
}

/** 중심선 폐곡선을 일정한 폭의 평면 도로 메시로 변환한다. */
function createCenterlineRoadGeometry(track: TestTrackDefinition): THREE.BufferGeometry | null {
  if (!track.centerline || track.centerline.length < 3 || !track.trackWidthM) return null;

  // Catmull-Rom 보간은 데이터 샘플 사이의 급격한 방향 단절을 시각적으로 완화한다.
  const curve = new THREE.CatmullRomCurve3(
    track.centerline.map((point) => new THREE.Vector3(point.x, TRACK_EDGE_Y, point.z)),
    true,
    "centripetal",
    0.2,
  );
  const sampleCount = Math.max(96, track.centerline.length * 8);
  const halfWidthM = track.trackWidthM * 0.5;
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    // 끝점을 중복하지 않아 폐곡선 마지막 쿼드가 첫 점과 자연스럽게 연결되게 한다.
    const ratio = index / sampleCount;
    const point = curve.getPointAt(ratio);
    const tangent = curve.getTangentAt(ratio).normalize();
    // +X/+Z 평면에서 tangent의 왼쪽을 구해 양쪽 도로 가장자리를 만든다.
    const left = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const leftPoint = point.clone().addScaledVector(left, halfWidthM);
    const rightPoint = point.clone().addScaledVector(left, -halfWidthM);
    vertices.push(
      leftPoint.x, leftPoint.y, leftPoint.z,
      rightPoint.x, rightPoint.y, rightPoint.z,
    );

    const nextIndex = (index + 1) % sampleCount;
    const currentVertex = index * 2;
    const nextVertex = nextIndex * 2;
    indices.push(currentVertex, nextVertex, currentVertex + 1, currentVertex + 1, nextVertex, nextVertex + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** 중심선 도로 메시의 생명주기를 장면 수명에 맞춰 정리한다. */
function CenterlineRoad({ track }: { track: TestTrackDefinition }) {
  const geometry = useMemo(() => createCenterlineRoadGeometry(track), [track]);

  useEffect(() => () => {
    geometry?.dispose();
  }, [geometry]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#303844" roughness={0.94} />
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
          <meshBasicMaterial color={marker.kind === "start-finish" ? "#f7f8fa" : "#ffcf5b"} />
        </mesh>
      ))}
      {track.checkpoints.map((checkpoint) => (
        <mesh
          key={checkpoint.id}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[checkpoint.position.x, TRACK_EDGE_Y - 0.02, checkpoint.position.z]}
        >
          <ringGeometry args={[checkpoint.radiusM - 0.08, checkpoint.radiusM, 32]} />
          <meshBasicMaterial color="#a6dbe3" transparent opacity={0.34} />
        </mesh>
      ))}
    </>
  );
}

/** 기존 사각 테스트 루프의 도로·인필드 표시를 유지한다. */
function RectangularTestLoop({ track }: { track: TestTrackDefinition }) {
  const { outerBounds, innerGrassBounds } = track;
  const trackWidth = boundsSize(outerBounds.minX, outerBounds.maxX);
  const trackLength = boundsSize(outerBounds.minZ, outerBounds.maxZ);
  const infieldWidth = boundsSize(innerGrassBounds.minX, innerGrassBounds.maxX);
  const infieldLength = boundsSize(innerGrassBounds.minZ, innerGrassBounds.maxZ);

  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[boundsCenter(outerBounds.minX, outerBounds.maxX), -0.5, boundsCenter(outerBounds.minZ, outerBounds.maxZ)]}
      >
        <planeGeometry args={[trackWidth, trackLength]} />
        <meshStandardMaterial color="#303844" roughness={0.95} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[boundsCenter(innerGrassBounds.minX, innerGrassBounds.maxX), -0.46, boundsCenter(innerGrassBounds.minZ, innerGrassBounds.maxZ)]}
      >
        <planeGeometry args={[infieldWidth, infieldLength]} />
        <meshStandardMaterial color="#1c3a2b" roughness={1} />
      </mesh>
      <mesh position={[0, TRACK_EDGE_Y, outerBounds.maxZ - 0.15]}>
        <boxGeometry args={[trackWidth, 0.08, 0.3]} />
        <meshStandardMaterial color="#d6dbe0" roughness={0.8} />
      </mesh>
      <mesh position={[0, TRACK_EDGE_Y, outerBounds.minZ + 0.15]}>
        <boxGeometry args={[trackWidth, 0.08, 0.3]} />
        <meshStandardMaterial color="#d6dbe0" roughness={0.8} />
      </mesh>
      <mesh position={[outerBounds.maxX - 0.15, TRACK_EDGE_Y, 0]}>
        <boxGeometry args={[0.3, 0.08, trackLength]} />
        <meshStandardMaterial color="#d6dbe0" roughness={0.8} />
      </mesh>
      <mesh position={[outerBounds.minX + 0.15, TRACK_EDGE_Y, 0]}>
        <boxGeometry args={[0.3, 0.08, trackLength]} />
        <meshStandardMaterial color="#d6dbe0" roughness={0.8} />
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
      <meshStandardMaterial color="#17271f" roughness={1} />
    </mesh>
  );
}

/** 트랙 데이터에 따라 중심선 도로 또는 기존 테스트 루프를 선택해 표시한다. */
export function TestTrackVisual({ track = TEST_TRACK_DATA }: TestTrackVisualProps) {
  const hasCenterline = Boolean(track.centerline && track.trackWidthM);
  return (
    <group>
      <TrackGround track={track} />
      {hasCenterline ? <CenterlineRoad track={track} /> : <RectangularTestLoop track={track} />}
      <TrackMarkers track={track} />
    </group>
  );
}
