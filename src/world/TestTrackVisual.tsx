/**
 * 데이터 기반 테스트 트랙의 바닥·인필드·경계·시작/제동 마커를 렌더링한다.
 * 트랙 치수와 마커 위치는 `TEST_TRACK_DATA`를 직접 읽어 물리 판정과 일치시킨다.
 */
import { TEST_TRACK_DATA } from "../tracks/TestTrack";

// 물리 지면보다 약간 위에 경계·마커를 배치해 z-fighting을 피한다.
const TRACK_EDGE_Y = -0.39;

/** bounds의 길이(m)를 계산하는 렌더링 보조 함수다. */
function boundsSize(min: number, max: number): number {
  return max - min;
}

/** bounds 중심 좌표(m)를 계산하는 렌더링 보조 함수다. */
function boundsCenter(min: number, max: number): number {
  return (min + max) * 0.5;
}

/** 테스트 트랙 데이터에서 반복 검증용 정적 R3F 지오메트리를 생성한다. */
export function TestTrackVisual() {
  // 렌더링에 필요한 bounds와 marker만 추출해 JSX의 데이터 흐름을 명확히 한다.
  const { outerBounds, innerGrassBounds, markers } = TEST_TRACK_DATA;
  // 외곽과 인필드의 폭·길이는 planeGeometry 크기 단위(m)다.
  const trackWidth = boundsSize(outerBounds.minX, outerBounds.maxX);
  const trackLength = boundsSize(outerBounds.minZ, outerBounds.maxZ);
  const infieldWidth = boundsSize(innerGrassBounds.minX, innerGrassBounds.maxX);
  const infieldLength = boundsSize(innerGrassBounds.minZ, innerGrassBounds.maxZ);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[trackWidth + 14, trackLength + 12]} />
        <meshStandardMaterial color="#17271f" roughness={1} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[boundsCenter(outerBounds.minX, outerBounds.maxX), -0.48, boundsCenter(outerBounds.minZ, outerBounds.maxZ)]}
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

      {markers.map((marker) => (
        <mesh
          key={marker.id}
          rotation={[-Math.PI / 2, 0, marker.rotationRad]}
          position={[marker.position.x, TRACK_EDGE_Y - 0.01, marker.position.z]}
        >
          <planeGeometry args={[marker.widthM, marker.lengthM]} />
          <meshBasicMaterial color={marker.kind === "start-finish" ? "#f7f8fa" : "#ffcf5b"} />
        </mesh>
      ))}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-9.1, TRACK_EDGE_Y - 0.015, 10]}>
        <planeGeometry args={[0.35, 8]} />
        <meshBasicMaterial color="#c9314a" />
      </mesh>
    </group>
  );
}
