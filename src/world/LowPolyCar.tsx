/**
 * 2012년형 Formula One의 공통 외관 문법을 독창적인 저폴리 차체로 재구성한다.
 * 물리 스냅샷은 부모 장면이 소유하며, 이 모듈은 읽기 전용 외관만 표시한다.
 * 실제 팀·차량·로고·스폰서 리버리는 사용하지 않는다.
 */
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";

/** 렌더링용 차량의 외관만 전달하는 읽기 전용 입력이다. */
export interface LowPolyCarProps {
  /** 물리 포즈를 표시 그룹에 반영하기 위한 선택적 참조다. */
  groupRef?: RefObject<THREE.Group | null>;
  /** 앞 타이어 각각의 허브 그룹을 장면의 fixed-step 렌더 루프에서 직접 회전시키기 위한 참조다. */
  frontWheelRefs?: LowPolyCarFrontWheelRefs;
  /** 차체 기본 도장 색상이며 물리나 차량 성능에는 영향을 주지 않는다. */
  bodyColor: string;
  /** 림과 무표식 차체 그래픽에 사용할 대비 색상이다. */
  accentColor?: string;
  /** 교육 모드에서 차체 포인트를 약하게 강조할 선택적 발광 색상이다. */
  emissiveColor?: string;
  /** 단일 추적 차량은 hero, 다차량 그리드는 실루엣 중심으로 표시한다. */
  detail?: "hero" | "grid";
  /** 렌더 스냅샷이 전달하는 앞축 시각 조향각(rad)이다. */
  steeringAngleRad?: number;
}

/** 앞 타이어를 각 허브 중심으로 조향하기 위한 렌더링 참조 묶음이다. */
export interface LowPolyCarFrontWheelRefs {
  left: RefObject<THREE.Group | null>;
  right: RefObject<THREE.Group | null>;
}

/** 2012년형 외관을 위한 정규화 치수이며 물리 설정을 덮어쓰지 않는 초기 가정이다. */
export const S1_2012_OPEN_WHEEL_DIMENSIONS = {
  wheelbaseM: 3.3,
  trackWidthM: 1.6,
  wheelRadiusM: 0.33,
  frontTyreWidthM: 0.3,
  rearTyreWidthM: 0.34,
  frontWingZ: -2.78,
  rearWingZ: 2.34,
} as const;

/** 차량 로컬 -Z 전방 기준 평면 도면의 점이다. */
type PlanformPoint = readonly [x: number, z: number];

/** 단면으로 연결할 차체의 한 station이며 높이와 폭은 m 단위다. */
interface HullStation {
  z: number;
  halfWidth: number;
  bottomY: number;
  shoulderY: number;
  crownY: number;
}

/** 사이드포드의 안쪽·바깥쪽 경계를 가진 단면 station이다. */
interface SidepodStation {
  z: number;
  innerX: number;
  outerX: number;
  bottomY: number;
  shoulderY: number;
  crownY: number;
}

/** Three.js에 전달할 선분의 양 끝점이다. */
type Point3 = readonly [x: number, y: number, z: number];

/** 높은 모노코크와 낮은 노즈의 단차를 만드는 전방 차체 단면이다. */
const NOSE_STATIONS: readonly HullStation[] = [
  { z: -2.66, halfWidth: 0.09, bottomY: 0.28, shoulderY: 0.34, crownY: 0.39 },
  { z: -2.35, halfWidth: 0.17, bottomY: 0.28, shoulderY: 0.39, crownY: 0.46 },
  { z: -1.98, halfWidth: 0.26, bottomY: 0.3, shoulderY: 0.47, crownY: 0.54 },
  // 이 높이 차이가 2012년형 스텝 노즈의 시각적 단서를 만든다.
  { z: -1.68, halfWidth: 0.34, bottomY: 0.32, shoulderY: 0.5, crownY: 0.58 },
  { z: -1.55, halfWidth: 0.39, bottomY: 0.34, shoulderY: 0.63, crownY: 0.76 },
];

/** 운전석 전후의 높고 좁은 모노코크 실루엣이다. */
const MONOCOQUE_STATIONS: readonly HullStation[] = [
  { z: -1.55, halfWidth: 0.39, bottomY: 0.34, shoulderY: 0.63, crownY: 0.76 },
  { z: -1.18, halfWidth: 0.48, bottomY: 0.35, shoulderY: 0.69, crownY: 0.84 },
  { z: -0.62, halfWidth: 0.54, bottomY: 0.36, shoulderY: 0.72, crownY: 0.9 },
  { z: -0.05, halfWidth: 0.56, bottomY: 0.37, shoulderY: 0.74, crownY: 0.93 },
  { z: 0.52, halfWidth: 0.5, bottomY: 0.38, shoulderY: 0.71, crownY: 0.88 },
  { z: 0.95, halfWidth: 0.42, bottomY: 0.39, shoulderY: 0.66, crownY: 0.79 },
];

/** 콕핏 뒤에서 기어박스까지 좁아지는 코크 보틀의 상부 덮개다. */
const ENGINE_COVER_STATIONS: readonly HullStation[] = [
  { z: 0.25, halfWidth: 0.37, bottomY: 0.51, shoulderY: 0.79, crownY: 1.05 },
  { z: 0.72, halfWidth: 0.36, bottomY: 0.5, shoulderY: 0.78, crownY: 1.16 },
  { z: 1.16, halfWidth: 0.31, bottomY: 0.49, shoulderY: 0.72, crownY: 1.09 },
  { z: 1.62, halfWidth: 0.22, bottomY: 0.48, shoulderY: 0.63, crownY: 0.88 },
  { z: 1.86, halfWidth: 0.17, bottomY: 0.47, shoulderY: 0.56, crownY: 0.72 },
];

/** 좌우 사이드포드의 깊은 언더컷과 후방 수축을 만드는 단면이다. */
const SIDEPOD_STATIONS: readonly SidepodStation[] = [
  { z: -1.14, innerX: 0.42, outerX: 0.72, bottomY: 0.38, shoulderY: 0.58, crownY: 0.66 },
  { z: -0.78, innerX: 0.48, outerX: 0.94, bottomY: 0.37, shoulderY: 0.64, crownY: 0.74 },
  // 바닥 쪽을 안으로 파서 2012년형 언더컷의 밝고 어두운 면을 만든다.
  { z: -0.28, innerX: 0.51, outerX: 0.96, bottomY: 0.36, shoulderY: 0.67, crownY: 0.79 },
  { z: 0.3, innerX: 0.48, outerX: 0.9, bottomY: 0.37, shoulderY: 0.64, crownY: 0.75 },
  { z: 0.86, innerX: 0.4, outerX: 0.73, bottomY: 0.39, shoulderY: 0.58, crownY: 0.67 },
  { z: 1.24, innerX: 0.3, outerX: 0.53, bottomY: 0.4, shoulderY: 0.52, crownY: 0.59 },
];

/** 프런트 윙의 메인 플레인은 노즈보다 넓고 끝으로 갈수록 뒤로 스윕된다. */
const FRONT_WING_MAIN_PLANFORM: readonly PlanformPoint[] = [
  [-1.22, -2.84],
  [-0.88, -2.76],
  [-0.45, -2.66],
  [0.45, -2.66],
  [0.88, -2.76],
  [1.22, -2.84],
  [1.1, -2.98],
  [0.42, -2.86],
  [-0.42, -2.86],
  [-1.1, -2.98],
];

/** 프런트 윙 플랩은 메인 플레인보다 짧고 후방에 겹친다. */
const FRONT_WING_FLAP_PLANFORM: readonly PlanformPoint[] = [
  [-1.08, -2.73],
  [-0.62, -2.63],
  [0.62, -2.63],
  [1.08, -2.73],
  [0.96, -2.82],
  [-0.96, -2.82],
];

/** 차량 하부의 바닥과 디퓨저가 만드는 얇은 어두운 실루엣이다. */
const FLOOR_PLANFORM: readonly PlanformPoint[] = [
  [-0.86, -1.76],
  [0.86, -1.76],
  [0.78, 1.72],
  [-0.78, 1.72],
];

/** 2012년형 두 요소 리어 윙의 곡선 대신 저폴리 직선 윤곽을 사용한다. */
const REAR_WING_MAIN_PLANFORM: readonly PlanformPoint[] = [
  [-0.94, 2.2],
  [0.94, 2.2],
  [0.86, 2.46],
  [-0.86, 2.46],
];

/** 도면을 얇은 입체 패널로 변환한다. */
function createPlanformGeometry(points: readonly PlanformPoint[], thickness: number): THREE.ExtrudeGeometry {
  // Shape의 XY를 차량 XZ 평면으로 회전해 압출 깊이가 차체 높이가 되도록 한다.
  const shape = new THREE.Shape();
  const [firstX, firstZ] = points[0];
  shape.moveTo(firstX, firstZ);
  for (const [x, z] of points.slice(1)) {
    shape.lineTo(x, z);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: false,
    curveSegments: 1,
    depth: thickness,
    steps: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/** 정적 평면 도면의 geometry 수명과 재질을 하나의 렌더 패널로 감싼다. */
function PlanformPanel({
  color,
  emissiveColor = "#000000",
  points,
  position,
  thickness,
}: {
  color: string;
  emissiveColor?: string;
  points: readonly PlanformPoint[];
  position: Point3;
  thickness: number;
}) {
  // 참조 도면과 두께가 바뀔 때만 geometry를 재생성해 다차량 장면의 할당을 줄인다.
  const geometry = useMemo(() => createPlanformGeometry(points, thickness), [points, thickness]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} position={position} castShadow receiveShadow>
      <meshStandardMaterial
        color={color}
        emissive={emissiveColor}
        emissiveIntensity={0.06}
        metalness={0.12}
        roughness={0.58}
        flatShading
      />
    </mesh>
  );
}

/** 차체 station들을 육각 단면으로 연결해 면이 읽히는 저폴리 hull을 생성한다. */
function createHullGeometry(stations: readonly HullStation[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const sectionSize = 6;

  for (const station of stations) {
    const { halfWidth, bottomY, shoulderY, crownY, z } = station;
    const section: Point3[] = [
      [-halfWidth, bottomY, z],
      [halfWidth, bottomY, z],
      [halfWidth * 0.92, shoulderY, z],
      [halfWidth * 0.42, crownY, z],
      [-halfWidth * 0.42, crownY, z],
      [-halfWidth * 0.92, shoulderY, z],
    ];
    for (const [x, y, sectionZ] of section) {
      positions.push(x, y, sectionZ);
    }
  }

  // 인접 station 사이를 쿼드 두 개로 나눠, 평평한 면과 경사 면을 함께 보존한다.
  for (let stationIndex = 0; stationIndex < stations.length - 1; stationIndex += 1) {
    const currentStart = stationIndex * sectionSize;
    const nextStart = (stationIndex + 1) * sectionSize;
    for (let sectionIndex = 0; sectionIndex < sectionSize; sectionIndex += 1) {
      const nextSectionIndex = (sectionIndex + 1) % sectionSize;
      const current = currentStart + sectionIndex;
      const currentNext = currentStart + nextSectionIndex;
      const next = nextStart + sectionIndex;
      const nextNext = nextStart + nextSectionIndex;
      indices.push(current, next, currentNext, currentNext, next, nextNext);
    }
  }

  // 앞뒤 단면을 닫아 카메라가 낮아져도 내부가 비어 보이지 않게 한다.
  const firstStart = 0;
  const lastStart = (stations.length - 1) * sectionSize;
  for (let sectionIndex = 1; sectionIndex < sectionSize - 1; sectionIndex += 1) {
    indices.push(firstStart, firstStart + sectionIndex + 1, firstStart + sectionIndex);
    indices.push(lastStart, lastStart + sectionIndex, lastStart + sectionIndex + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** 좌우 경계가 다른 사이드포드 station들을 연결한다. */
function createSidepodGeometry(stations: readonly SidepodStation[], side: -1 | 1): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const sectionSize = 6;

  for (const station of stations) {
    const { innerX, outerX, bottomY, shoulderY, crownY, z } = station;
    const section: Point3[] = [
      [side * innerX, bottomY, z],
      [side * outerX, bottomY, z],
      [side * outerX, shoulderY, z],
      [side * outerX * 0.94, crownY, z],
      [side * innerX, crownY, z],
      [side * innerX, shoulderY, z],
    ];
    for (const [x, y, sectionZ] of section) {
      positions.push(x, y, sectionZ);
    }
  }

  for (let stationIndex = 0; stationIndex < stations.length - 1; stationIndex += 1) {
    const currentStart = stationIndex * sectionSize;
    const nextStart = (stationIndex + 1) * sectionSize;
    for (let sectionIndex = 0; sectionIndex < sectionSize; sectionIndex += 1) {
      const nextSectionIndex = (sectionIndex + 1) % sectionSize;
      const current = currentStart + sectionIndex;
      const currentNext = currentStart + nextSectionIndex;
      const next = nextStart + sectionIndex;
      const nextNext = nextStart + nextSectionIndex;
      indices.push(current, next, currentNext, currentNext, next, nextNext);
    }
  }

  const firstStart = 0;
  const lastStart = (stations.length - 1) * sectionSize;
  for (let sectionIndex = 1; sectionIndex < sectionSize - 1; sectionIndex += 1) {
    indices.push(firstStart, firstStart + sectionIndex + 1, firstStart + sectionIndex);
    indices.push(lastStart, lastStart + sectionIndex, lastStart + sectionIndex + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** 생성 geometry의 소유 수명과 재질을 하나의 차체 패널로 감싼다. */
function HullPanel({
  color,
  emissiveColor,
  stations,
}: {
  color: string;
  emissiveColor: string;
  stations: readonly HullStation[];
}) {
  const geometry = useMemo(() => createHullGeometry(stations), [stations]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color={color}
        emissive={emissiveColor}
        emissiveIntensity={0.08}
        metalness={0.12}
        roughness={0.48}
        flatShading
      />
    </mesh>
  );
}

/** 사이드포드의 언더컷 면을 좌우 독립 geometry로 표시한다. */
function SidepodPanel({ color, stations, side }: { color: string; stations: readonly SidepodStation[]; side: -1 | 1 }) {
  const geometry = useMemo(() => createSidepodGeometry(stations, side), [side, stations]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} metalness={0.12} roughness={0.5} flatShading side={THREE.DoubleSide} />
    </mesh>
  );
}

/** 두 점 사이를 잇는 push-rod, wishbone, pull-rod용 얇은 링크다. */
function Link({ color, end, start, width }: { color: string; end: Point3; start: Point3; width: number }) {
  const transform = useMemo(() => {
    const startVector = new THREE.Vector3(...start);
    const endVector = new THREE.Vector3(...end);
    const direction = endVector.clone().sub(startVector);
    const length = Math.max(direction.length(), 0.001);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      direction.normalize(),
    );
    return {
      length,
      position: startVector.add(endVector).multiplyScalar(0.5),
      quaternion,
    };
  }, [end, start]);

  return (
    <mesh position={transform.position} quaternion={transform.quaternion} castShadow>
      <boxGeometry args={[width, width, transform.length]} />
      <meshStandardMaterial color={color} roughness={0.72} flatShading />
    </mesh>
  );
}

/** 오픈 콕핏 안에서 헬멧·상체·팔이 읽히도록 만든 저폴리 드라이버다. */
function DriverCockpit({ accentColor }: { accentColor: string }) {
  const suitColor = "#151d26";
  const gloveColor = "#b9b5aa";
  const visorColor = "#06090d";

  return (
    <group position={[0, 0.55, -0.02]}>
      {/* 시트 앞쪽으로 몸통을 낮춰 2012년형 오픈 콕핏의 낮은 착좌 자세를 표현한다. */}
      <mesh position={[0, 0.24, 0.02]} castShadow>
        <boxGeometry args={[0.27, 0.38, 0.3]} />
        <meshStandardMaterial color={suitColor} roughness={0.84} flatShading />
      </mesh>
      <mesh position={[0, 0.47, -0.01]} castShadow>
        <sphereGeometry args={[0.16, 8, 5]} />
        <meshStandardMaterial color={accentColor} metalness={0.08} roughness={0.64} flatShading />
      </mesh>
      {/* 검은 전면 바이저를 별도 면으로 두어 카메라가 헬멧 방향을 판독하게 한다. */}
      <mesh position={[0, 0.48, -0.13]}>
        <boxGeometry args={[0.17, 0.065, 0.025]} />
        <meshStandardMaterial color={visorColor} metalness={0.5} roughness={0.2} flatShading />
      </mesh>
      <mesh position={[0, 0.31, -0.08]}>
        <boxGeometry args={[0.22, 0.055, 0.04]} />
        <meshStandardMaterial color={accentColor} roughness={0.58} flatShading />
      </mesh>
      {/* 팔은 스티어링 휠 쪽으로 내려가며 손 위치가 조향축과 연결되어 보이게 한다. */}
      <Link color={suitColor} start={[-0.11, 0.36, -0.04]} end={[-0.075, 0.35, -0.28]} width={0.075} />
      <Link color={suitColor} start={[0.11, 0.36, -0.04]} end={[0.075, 0.35, -0.28]} width={0.075} />
      <mesh position={[-0.075, 0.35, -0.3]}>
        <sphereGeometry args={[0.048, 6, 4]} />
        <meshStandardMaterial color={gloveColor} roughness={0.7} flatShading />
      </mesh>
      <mesh position={[0.075, 0.35, -0.3]}>
        <sphereGeometry args={[0.048, 6, 4]} />
        <meshStandardMaterial color={gloveColor} roughness={0.7} flatShading />
      </mesh>
    </group>
  );
}

/** 앞뒤 휠의 폭과 지름 차이를 드러내는 노출 타이어·허브·브레이크 덕트다. */
function Wheel({
  accentColor,
  groupRef,
  position,
  radius,
  side,
  width,
}: {
  accentColor: string;
  groupRef?: RefObject<THREE.Group | null>;
  position: Point3;
  radius: number;
  side: -1 | 1;
  width: number;
}) {
  return (
    <group ref={groupRef} position={position}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[radius, radius, width, 12]} />
        <meshStandardMaterial color="#111216" roughness={0.96} flatShading />
      </mesh>
      <mesh position={[side * (width * 0.5 + 0.015), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius * 0.56, radius * 0.56, 0.035, 10]} />
        <meshStandardMaterial color="#b9b5aa" metalness={0.55} roughness={0.38} flatShading />
      </mesh>
      <mesh position={[side * (width * 0.5 + 0.038), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius * 0.27, radius * 0.27, 0.042, 8]} />
        <meshStandardMaterial color={accentColor} metalness={0.46} roughness={0.34} flatShading />
      </mesh>
      <mesh position={[side * (width * 0.5 + 0.052), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius * 0.09, radius * 0.09, 0.05, 8]} />
        <meshStandardMaterial color="#0a0b0e" roughness={0.84} flatShading />
      </mesh>
      <mesh position={[side * (width * 0.5 - 0.02), 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <cylinderGeometry args={[radius * 0.38, radius * 0.43, 0.06, 8]} />
        <meshStandardMaterial color="#252832" roughness={0.78} flatShading />
      </mesh>
    </group>
  );
}

/** 2012년형 전후 축 위치에 맞춰 바퀴와 얇은 브레이크 덕트를 배치한다. */
function Wheels({
  accentColor,
  frontWheelRefs,
  steeringAngleRad = 0,
}: {
  accentColor: string;
  frontWheelRefs?: LowPolyCarFrontWheelRefs;
  steeringAngleRad?: number;
}) {
  // grid 차량은 외부 참조가 없으므로 내부 허브 참조로 초기 조향각을 한 번 적용한다.
  const internalFrontLeftWheelRef = useRef<THREE.Group>(null);
  const internalFrontRightWheelRef = useRef<THREE.Group>(null);
  const resolvedFrontLeftWheelRef = frontWheelRefs?.left ?? internalFrontLeftWheelRef;
  const resolvedFrontRightWheelRef = frontWheelRefs?.right ?? internalFrontRightWheelRef;
  const halfTrackM = S1_2012_OPEN_WHEEL_DIMENSIONS.trackWidthM * 0.5;
  const frontZ = -S1_2012_OPEN_WHEEL_DIMENSIONS.wheelbaseM * (1.815 / 3.3);
  const rearZ = S1_2012_OPEN_WHEEL_DIMENSIONS.wheelbaseM * (1.485 / 3.3);
  const frontRadius = S1_2012_OPEN_WHEEL_DIMENSIONS.wheelRadiusM;
  const rearRadius = frontRadius * 1.015;

  useEffect(() => {
    // Race Weekend처럼 React 스냅샷으로 갱신되는 차량은 차량 원점이 아닌 각 허브만 돌린다.
    const safeSteeringAngleRad = Number.isFinite(steeringAngleRad) ? steeringAngleRad : 0;
    if (resolvedFrontLeftWheelRef.current) {
      resolvedFrontLeftWheelRef.current.rotation.y = safeSteeringAngleRad;
    }
    if (resolvedFrontRightWheelRef.current) {
      resolvedFrontRightWheelRef.current.rotation.y = safeSteeringAngleRad;
    }
  }, [resolvedFrontLeftWheelRef, resolvedFrontRightWheelRef, steeringAngleRad]);

  return (
    <>
      <Wheel
        groupRef={resolvedFrontLeftWheelRef}
        accentColor={accentColor}
        position={[-halfTrackM, frontRadius, frontZ]}
        radius={frontRadius}
        side={-1}
        width={S1_2012_OPEN_WHEEL_DIMENSIONS.frontTyreWidthM}
      />
      <Wheel
        groupRef={resolvedFrontRightWheelRef}
        accentColor={accentColor}
        position={[halfTrackM, frontRadius, frontZ]}
        radius={frontRadius}
        side={1}
        width={S1_2012_OPEN_WHEEL_DIMENSIONS.frontTyreWidthM}
      />
      {([-1, 1] as const).map((side) => (
        <Wheel
          key={`rear-wheel-${side}`}
          accentColor={accentColor}
          position={[side * halfTrackM, rearRadius, rearZ]}
          radius={rearRadius}
          side={side}
          width={S1_2012_OPEN_WHEEL_DIMENSIONS.rearTyreWidthM}
        />
      ))}
    </>
  );
}

/** 앞쪽 push-rod와 전후 위시본의 방향을 보여 주는 기계 요소다. */
function SuspensionArms({ color }: { color: string }) {
  const frontZ = -1.815;
  const rearZ = 1.485;
  const wheelX = S1_2012_OPEN_WHEEL_DIMENSIONS.trackWidthM * 0.5;

  return (
    <>
      {([-1, 1] as const).map((side) => (
        <group key={`suspension-${side}`}>
          <Link color={color} end={[side * wheelX, 0.5, frontZ]} start={[side * 0.38, 0.76, -1.18]} width={0.045} />
          <Link color={color} end={[side * wheelX, 0.46, frontZ]} start={[side * 0.48, 0.61, -1.42]} width={0.04} />
          <Link color={color} end={[side * wheelX, 0.38, frontZ]} start={[side * 0.52, 0.42, -1.34]} width={0.045} />
          {/* 후방 pull-rod는 휠 허브에서 기어박스 상부로 올라가는 반대 방향 링크다. */}
          <Link color={color} end={[side * wheelX, 0.48, rearZ]} start={[side * 0.26, 0.95, 0.98]} width={0.045} />
          <Link color={color} end={[side * wheelX, 0.54, rearZ]} start={[side * 0.42, 0.64, 1.16]} width={0.04} />
          <Link color={color} end={[side * wheelX, 0.38, rearZ]} start={[side * 0.5, 0.43, 1.14]} width={0.045} />
        </group>
      ))}
    </>
  );
}

/** 다차량 레이스에서 프레임 비용을 제한하면서 2012년형 실루엣을 유지하는 LOD다. */
function GridCar({
  accentColor,
  bodyColor,
  frontWheelRefs,
  groupRef,
  steeringAngleRad,
}: Pick<LowPolyCarProps, "accentColor" | "bodyColor" | "frontWheelRefs" | "groupRef" | "steeringAngleRad">) {
  const carbonColor = "#12151a";
  const aeroColor = "#20252b";
  const resolvedAccentColor = accentColor ?? "#d6b46a";

  return (
    <group ref={groupRef}>
      {/* 원거리 차량도 노즈 단차·사이드포드·코크 보틀의 외곽선을 유지한다. */}
      <HullPanel color={bodyColor} emissiveColor="#000000" stations={NOSE_STATIONS} />
      <HullPanel color={bodyColor} emissiveColor="#000000" stations={MONOCOQUE_STATIONS} />
      <HullPanel color={bodyColor} emissiveColor="#000000" stations={ENGINE_COVER_STATIONS} />
      <SidepodPanel color={bodyColor} side={-1} stations={SIDEPOD_STATIONS} />
      <SidepodPanel color={bodyColor} side={1} stations={SIDEPOD_STATIONS} />
      <PlanformPanel color={carbonColor} points={FLOOR_PLANFORM} position={[0, 0.29, 0]} thickness={0.055} />
      <PlanformPanel color={aeroColor} points={FRONT_WING_MAIN_PLANFORM} position={[0, 0.25, 0]} thickness={0.07} />
      <PlanformPanel color={aeroColor} points={REAR_WING_MAIN_PLANFORM} position={[0, 1.06, 0]} thickness={0.08} />
      <mesh position={[0, 1.22, 2.4]}>
        <boxGeometry args={[1.54, 0.07, 0.1]} />
        <meshStandardMaterial color={aeroColor} roughness={0.72} flatShading />
      </mesh>
      <mesh position={[0, 0.82, 2.12]}>
        <boxGeometry args={[1.54, 0.065, 0.1]} />
        <meshStandardMaterial color={aeroColor} roughness={0.72} flatShading />
      </mesh>
      <mesh position={[0, 0.98, -0.92]}>
        <boxGeometry args={[0.07, 0.025, 0.78]} />
        <meshStandardMaterial color={resolvedAccentColor} roughness={0.58} flatShading />
      </mesh>
      <Wheels
        accentColor={resolvedAccentColor}
        frontWheelRefs={frontWheelRefs}
        steeringAngleRad={steeringAngleRad}
      />
    </group>
  );
}

/** 외부 참조 사진에서 반복적으로 보이는 2012년형 공력·차체 층을 조합한다. */
export function LowPolyCar({
  frontWheelRefs,
  groupRef,
  bodyColor,
  accentColor = "#d6b46a",
  emissiveColor = "#000000",
  detail = "hero",
  steeringAngleRad = 0,
}: LowPolyCarProps) {
  if (detail === "grid") {
    return (
      <GridCar
        groupRef={groupRef}
        frontWheelRefs={frontWheelRefs}
        bodyColor={bodyColor}
        accentColor={accentColor}
        steeringAngleRad={steeringAngleRad}
      />
    );
  }

  const carbonColor = "#12151a";
  const aeroColor = "#20252b";
  const highlightColor = "#d5d1c5";
  const frontWingZ = S1_2012_OPEN_WHEEL_DIMENSIONS.frontWingZ;
  const rearWingZ = S1_2012_OPEN_WHEEL_DIMENSIONS.rearWingZ;

  return (
    <group ref={groupRef}>
      {/* 노즈와 모노코크를 분리해 낮은 전방과 높은 안전 셀의 단차를 읽게 한다. */}
      <HullPanel color={bodyColor} emissiveColor={emissiveColor} stations={NOSE_STATIONS} />
      <HullPanel color={bodyColor} emissiveColor={emissiveColor} stations={MONOCOQUE_STATIONS} />
      <HullPanel color={bodyColor} emissiveColor={emissiveColor} stations={ENGINE_COVER_STATIONS} />
      <SidepodPanel color={bodyColor} side={-1} stations={SIDEPOD_STATIONS} />
      <SidepodPanel color={bodyColor} side={1} stations={SIDEPOD_STATIONS} />

      {/* 바닥은 차체보다 낮고 길게 두어 오픈휠 차의 얇은 허리를 만든다. */}
      <PlanformPanel color={carbonColor} points={FLOOR_PLANFORM} position={[0, 0.29, 0]} thickness={0.055} />
      <mesh position={[0, 0.34, 0.28]} castShadow>
        <boxGeometry args={[0.72, 0.08, 1.55]} />
        <meshStandardMaterial color={aeroColor} roughness={0.68} flatShading />
      </mesh>

      {/* 헤일로 없이 콕핏·시트·스티어링 휠을 노출해 2012년 오픈 콕핏을 보존한다. */}
      <PlanformPanel
        color="#07090c"
        points={[
          [-0.29, -0.78],
          [0.29, -0.78],
          [0.24, 0.3],
          [-0.24, 0.3],
        ]}
        position={[0, 0.91, 0]}
        thickness={0.035}
      />
      <mesh position={[0, 0.87, -0.22]} castShadow>
        <boxGeometry args={[0.3, 0.08, 0.52]} />
        <meshStandardMaterial color="#0b0d11" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0, 0.9, -0.34]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.12, 0.025, 4, 8, Math.PI * 1.7]} />
        <meshStandardMaterial color={carbonColor} roughness={0.72} flatShading />
      </mesh>
      <DriverCockpit accentColor={accentColor} />

      {/* 에어박스와 검은 흡입구는 엔진 커버의 중앙 능선을 명확히 한다. */}
      <mesh position={[0, 1.2, 0.6]} castShadow>
        <coneGeometry args={[0.27, 0.46, 6]} />
        <meshStandardMaterial color={carbonColor} roughness={0.72} flatShading />
      </mesh>
      <mesh position={[0, 1.43, 0.6]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.18, 0.035, 8]} />
        <meshStandardMaterial color="#050608" roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0, 1.0, 1.12]}>
        <boxGeometry args={[0.045, 0.24, 0.82]} />
        <meshStandardMaterial color={carbonColor} roughness={0.82} flatShading />
      </mesh>

      {/* 사이드포드 입구와 바닥 언더컷을 어두운 면으로 분리한다. */}
      {([-1, 1] as const).map((side) => (
        <group key={`sidepod-detail-${side}`}>
          <mesh position={[side * 0.69, 0.72, -0.7]} rotation={[0, side * 0.12, 0]}>
            <boxGeometry args={[0.045, 0.18, 0.5]} />
            <meshStandardMaterial color={carbonColor} roughness={0.9} flatShading />
          </mesh>
          <mesh position={[side * 0.65, 0.41, -0.24]} rotation={[0, side * 0.08, 0]}>
            <boxGeometry args={[0.035, 0.055, 0.74]} />
            <meshStandardMaterial color={aeroColor} roughness={0.82} flatShading />
          </mesh>
          {/* 2012년형 고후방 배기의 위치감만 표현하며 물리 공력 이득은 부여하지 않는다. */}
          <mesh position={[side * 0.28, 0.92, 1.44]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.065, 0.085, 0.16, 8]} />
            <meshStandardMaterial color="#08090b" metalness={0.42} roughness={0.4} flatShading />
          </mesh>
          <mesh position={[side * 0.28, 0.92, 1.53]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.04, 0.018, 8]} />
            <meshStandardMaterial color="#e88b50" emissive="#9d3f1e" emissiveIntensity={0.16} flatShading />
          </mesh>
        </group>
      ))}

      {/* 중앙 스트라이프와 사이드 스트레이크는 팀 리버리가 아닌 무표식 식별 그래픽이다. */}
      <mesh position={[0, 0.965, -1.16]}>
        <boxGeometry args={[0.08, 0.025, 0.74]} />
        <meshStandardMaterial color={accentColor} emissive={emissiveColor} emissiveIntensity={0.12} flatShading />
      </mesh>
      {([-1, 1] as const).map((side) => (
        <mesh key={`livery-stripe-${side}`} position={[side * 0.58, 0.8, -0.38]} rotation={[0, side * 0.16, side * 0.08]}>
          <boxGeometry args={[0.035, 0.026, 0.92]} />
          <meshStandardMaterial color={accentColor} roughness={0.58} flatShading />
        </mesh>
      ))}

      {/* 노즈 지지대, 다층 메인 플레인, 플랩, 엔드플레이트로 프런트 윙을 구성한다. */}
      <PlanformPanel color={aeroColor} points={FRONT_WING_MAIN_PLANFORM} position={[0, 0.25, 0]} thickness={0.07} />
      <PlanformPanel color={carbonColor} points={FRONT_WING_FLAP_PLANFORM} position={[0, 0.33, 0]} thickness={0.05} />
      <mesh position={[0, 0.4, frontWingZ + 0.12]}>
        <boxGeometry args={[0.78, 0.045, 0.08]} />
        <meshStandardMaterial color={accentColor} roughness={0.62} flatShading />
      </mesh>
      {([-1, 1] as const).map((side) => (
        <group key={`front-wing-endplate-${side}`}>
          <mesh position={[side * 1.12, 0.42, frontWingZ + 0.01]}>
            <boxGeometry args={[0.07, 0.28, 0.18]} />
            <meshStandardMaterial color={aeroColor} roughness={0.76} flatShading />
          </mesh>
          <Link color={carbonColor} end={[side * 0.18, 0.66, -1.67]} start={[side * 0.18, 0.34, -2.51]} width={0.07} />
        </group>
      ))}

      {/* 리어 윙, DRS 플랩, 빔 윙, 중앙 지지대를 높이 계층으로 배치한다. */}
      <PlanformPanel color={aeroColor} points={REAR_WING_MAIN_PLANFORM} position={[0, 1.06, 0]} thickness={0.08} />
      <PlanformPanel
        color={carbonColor}
        points={[
          [-0.82, 2.28],
          [0.82, 2.28],
          [0.76, 2.52],
          [-0.76, 2.52],
        ]}
        position={[0, 1.22, 0]}
        thickness={0.055}
      />
      <mesh position={[0, 0.82, rearWingZ - 0.25]}>
        <boxGeometry args={[1.54, 0.065, 0.1]} />
        <meshStandardMaterial color={aeroColor} roughness={0.72} flatShading />
      </mesh>
      {([-1, 1] as const).map((side) => (
        <group key={`rear-wing-support-${side}`}>
          <mesh position={[side * 0.76, 1.02, rearWingZ]}>
            <boxGeometry args={[0.075, 0.56, 0.12]} />
            <meshStandardMaterial color={aeroColor} roughness={0.78} flatShading />
          </mesh>
          <Link color={carbonColor} end={[side * 0.36, 0.76, 1.62]} start={[side * 0.76, 0.76, 2.15]} width={0.055} />
        </group>
      ))}
      <mesh position={[0, 1.32, 2.39]}>
        <boxGeometry args={[0.62, 0.035, 0.04]} />
        <meshStandardMaterial color={accentColor} roughness={0.6} flatShading />
      </mesh>

      {/* 후방 바닥에는 디퓨저 스트레이크를 남겨 리어 윙과 다른 층을 만든다. */}
      {([-1, 0, 1] as const).map((side) => (
        <mesh key={`diffuser-${side}`} position={[side * 0.28, 0.34, 1.62]}>
          <boxGeometry args={[0.045, 0.16, 0.58]} />
          <meshStandardMaterial color={carbonColor} roughness={0.9} flatShading />
        </mesh>
      ))}

      <SuspensionArms color={carbonColor} />
      <Wheels
        accentColor={accentColor}
        frontWheelRefs={frontWheelRefs}
        steeringAngleRad={steeringAngleRad}
      />
      <mesh position={[0, 0.48, 1.88]}>
        <boxGeometry args={[0.46, 0.26, 0.4]} />
        <meshStandardMaterial color={carbonColor} roughness={0.8} flatShading />
      </mesh>
      <mesh position={[0, 0.99, 1.74]}>
        <boxGeometry args={[0.24, 0.09, 0.08]} />
        <meshStandardMaterial color={highlightColor} metalness={0.32} roughness={0.42} flatShading />
      </mesh>
    </group>
  );
}
