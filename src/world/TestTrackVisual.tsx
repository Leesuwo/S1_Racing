import { TEST_TRACK_DATA } from "../tracks/TestTrack";

// 물리 지면(-0.2)과 차체가 겹치지 않으면서 트랙 경계가 보이도록 둔 시각화 높이(m).
const TRACK_EDGE_Y = -0.39;

/** 직사각형 경계의 한 축 길이를 계산한다. 단위는 m이다. */
function boundsSize(min: number, max: number): number {
  return max - min;
}

/** 직사각형 경계의 한 축 중심을 계산해 Three.js 평면의 위치로 사용한다. */
function boundsCenter(min: number, max: number): number {
  return (min + max) * 0.5;
}

/**
 * 트랙 데이터의 동일한 경계를 아스팔트·인필드·마커의 3D 장면으로 표시한다.
 * 노면 판정은 이 컴포넌트가 소유하지 않으며 `TEST_TRACK_DATA`를 공유해 시각·물리 경계를 맞춘다.
 */
export function TestTrackVisual() {
  const { outerBounds, innerGrassBounds, markers } = TEST_TRACK_DATA;
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
