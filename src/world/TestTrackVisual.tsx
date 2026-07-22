import { TEST_TRACK_DATA } from "../tracks/TestTrack";

const TRACK_EDGE_Y = -0.39;

function boundsSize(min: number, max: number): number {
  return max - min;
}

function boundsCenter(min: number, max: number): number {
  return (min + max) * 0.5;
}

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
