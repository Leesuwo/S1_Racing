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
  /** 네 바퀴의 조향·구름 그룹을 장면의 fixed-step 렌더 루프에서 직접 회전시키기 위한 참조다. */
  wheelRefs?: LowPolyCarWheelRefs;
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
  /** 렌더 스냅샷이 전달하는 네 바퀴의 누적 구름 회전량(rad)이다. */
  wheelSpinRad?: LowPolyCarWheelSpin;
}

/** 앞바퀴 조향과 모든 바퀴 구름을 서로 다른 회전축으로 표시하는 참조 묶음이다. */
export interface LowPolyCarWheelRefs {
  frontLeft: { steering: RefObject<THREE.Group | null>; rolling: RefObject<THREE.Group | null> };
  frontRight: { steering: RefObject<THREE.Group | null>; rolling: RefObject<THREE.Group | null> };
  rearLeft: { rolling: RefObject<THREE.Group | null> };
  rearRight: { rolling: RefObject<THREE.Group | null> };
}

/** 차량 로컬 이름을 유지해 물리 스냅샷과 시각 휠을 안정적으로 매핑한다. */
export interface LowPolyCarWheelSpin {
  frontLeft: number;
  frontRight: number;
  rearLeft: number;
  rearRight: number;
}

/** 2012년형 외관을 위한 정규화 치수이며 물리 설정을 덮어쓰지 않는 초기 가정이다. */
export const S1_2012_OPEN_WHEEL_DIMENSIONS = {
  wheelbaseM: 3.3,
  /** 앞·뒤 차축을 같은 값으로 뭉개지 않고 2012년형 오픈휠의 시각적 stance를 보존한다. */
  frontTrackWidthM: 1.72,
  rearTrackWidthM: 1.68,
  /** 기존 물리 바퀴 반지름과 분리된 렌더링 전용 초기 가정이다. */
  wheelRadiusM: 0.32,
  frontTyreWidthM: 0.27,
  rearTyreWidthM: 0.41,
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
  { z: -2.72, halfWidth: 0.05, bottomY: 0.27, shoulderY: 0.31, crownY: 0.34 },
  { z: -2.46, halfWidth: 0.12, bottomY: 0.28, shoulderY: 0.35, crownY: 0.39 },
  { z: -2.12, halfWidth: 0.2, bottomY: 0.3, shoulderY: 0.4, crownY: 0.45 },
  { z: -1.82, halfWidth: 0.28, bottomY: 0.31, shoulderY: 0.46, crownY: 0.5 },
  // 낮은 코 부분을 길게 유지한 뒤 모노코크가 한 번에 올라가야 2012년형 platypus nose가 읽힌다.
  { z: -1.67, halfWidth: 0.31, bottomY: 0.32, shoulderY: 0.48, crownY: 0.53 },
  { z: -1.54, halfWidth: 0.34, bottomY: 0.34, shoulderY: 0.67, crownY: 0.78 },
];

/** 운전석 전후의 높고 좁은 모노코크 실루엣이다. */
const MONOCOQUE_STATIONS: readonly HullStation[] = [
  { z: -1.54, halfWidth: 0.34, bottomY: 0.34, shoulderY: 0.67, crownY: 0.78 },
  { z: -1.3, halfWidth: 0.4, bottomY: 0.35, shoulderY: 0.7, crownY: 0.84 },
  { z: -0.8, halfWidth: 0.47, bottomY: 0.36, shoulderY: 0.74, crownY: 0.92 },
  { z: -0.22, halfWidth: 0.5, bottomY: 0.37, shoulderY: 0.76, crownY: 0.94 },
  { z: 0.36, halfWidth: 0.48, bottomY: 0.38, shoulderY: 0.74, crownY: 0.91 },
  { z: 0.78, halfWidth: 0.42, bottomY: 0.39, shoulderY: 0.69, crownY: 0.82 },
  { z: 1.04, halfWidth: 0.37, bottomY: 0.4, shoulderY: 0.64, crownY: 0.75 },
];

/** 콕핏 뒤에서 기어박스까지 좁아지는 코크 보틀의 상부 덮개다. */
const ENGINE_COVER_STATIONS: readonly HullStation[] = [
  { z: 0.2, halfWidth: 0.35, bottomY: 0.5, shoulderY: 0.78, crownY: 1.03 },
  { z: 0.68, halfWidth: 0.33, bottomY: 0.5, shoulderY: 0.76, crownY: 1.1 },
  { z: 1.1, halfWidth: 0.29, bottomY: 0.49, shoulderY: 0.7, crownY: 1.02 },
  { z: 1.52, halfWidth: 0.22, bottomY: 0.48, shoulderY: 0.61, crownY: 0.84 },
  { z: 1.85, halfWidth: 0.16, bottomY: 0.46, shoulderY: 0.54, crownY: 0.7 },
];

/** 좌우 사이드포드의 깊은 언더컷과 후방 수축을 만드는 단면이다. */
const SIDEPOD_STATIONS: readonly SidepodStation[] = [
  { z: -1.2, innerX: 0.36, outerX: 0.7, bottomY: 0.37, shoulderY: 0.6, crownY: 0.68 },
  { z: -0.9, innerX: 0.41, outerX: 0.88, bottomY: 0.36, shoulderY: 0.68, crownY: 0.79 },
  // 흡입구 아래쪽을 안으로 밀어 넣고 어깨를 높여 2012년형 언더컷을 옆면에서 읽게 한다.
  { z: -0.48, innerX: 0.45, outerX: 0.91, bottomY: 0.35, shoulderY: 0.72, crownY: 0.84 },
  { z: 0.05, innerX: 0.45, outerX: 0.88, bottomY: 0.36, shoulderY: 0.7, crownY: 0.81 },
  { z: 0.6, innerX: 0.38, outerX: 0.7, bottomY: 0.38, shoulderY: 0.62, crownY: 0.71 },
  { z: 1.05, innerX: 0.3, outerX: 0.53, bottomY: 0.4, shoulderY: 0.54, crownY: 0.62 },
  { z: 1.35, innerX: 0.22, outerX: 0.4, bottomY: 0.41, shoulderY: 0.49, crownY: 0.56 },
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

/** 메인 플레인 앞쪽에 겹치는 얇은 플랩으로 2012년형 다층 프런트 윙의 밀도를 만든다. */
const FRONT_WING_UPPER_FLAP_PLANFORM: readonly PlanformPoint[] = [
  [-1.02, -2.62],
  [-0.58, -2.54],
  [0.58, -2.54],
  [1.02, -2.62],
  [0.91, -2.69],
  [-0.91, -2.69],
];

/** 노즈 단차의 평평한 상면을 별도 패널로 분리해 옆면 실루엣을 선명하게 한다. */
const NOSE_STEP_PLANFORM: readonly PlanformPoint[] = [
  [-0.31, -1.74],
  [0.31, -1.74],
  [0.34, -1.52],
  [-0.34, -1.52],
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
  rollingGroupRef,
  position,
  radius,
  side,
  steeringGroupRef,
  width,
}: {
  accentColor: string;
  rollingGroupRef: RefObject<THREE.Group | null>;
  position: Point3;
  radius: number;
  side: -1 | 1;
  steeringGroupRef?: RefObject<THREE.Group | null>;
  width: number;
}) {
  return (
    <group ref={steeringGroupRef} position={steeringGroupRef ? position : undefined}>
      <group ref={rollingGroupRef} position={steeringGroupRef ? undefined : position}>
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
    </group>
  );
}

/** 2012년형 전후 축 위치에 맞춰 바퀴와 얇은 브레이크 덕트를 배치한다. */
function Wheels({
  accentColor,
  wheelRefs,
  wheelSpinRad,
  steeringAngleRad = 0,
}: {
  accentColor: string;
  wheelRefs?: LowPolyCarWheelRefs;
  wheelSpinRad?: LowPolyCarWheelSpin;
  steeringAngleRad?: number;
}) {
  // 외부 참조가 없는 grid 차량도 초기 렌더에서 동일한 회전 구조를 갖도록 내부 참조를 만든다.
  const internalFrontLeftSteeringRef = useRef<THREE.Group>(null);
  const internalFrontLeftRollingRef = useRef<THREE.Group>(null);
  const internalFrontRightSteeringRef = useRef<THREE.Group>(null);
  const internalFrontRightRollingRef = useRef<THREE.Group>(null);
  const internalRearLeftRollingRef = useRef<THREE.Group>(null);
  const internalRearRightRollingRef = useRef<THREE.Group>(null);
  const resolvedFrontLeft = wheelRefs?.frontLeft ?? {
    steering: internalFrontLeftSteeringRef,
    rolling: internalFrontLeftRollingRef,
  };
  const resolvedFrontRight = wheelRefs?.frontRight ?? {
    steering: internalFrontRightSteeringRef,
    rolling: internalFrontRightRollingRef,
  };
  const resolvedRearLeft = wheelRefs?.rearLeft ?? { rolling: internalRearLeftRollingRef };
  const resolvedRearRight = wheelRefs?.rearRight ?? { rolling: internalRearRightRollingRef };
  // 시각 휠 축은 전·후 타이어 폭과 차체 어깨가 만드는 외부 stance에 맞춘다.
  const frontHalfTrackM = S1_2012_OPEN_WHEEL_DIMENSIONS.frontTrackWidthM * 0.5;
  const rearHalfTrackM = S1_2012_OPEN_WHEEL_DIMENSIONS.rearTrackWidthM * 0.5;
  const frontZ = -S1_2012_OPEN_WHEEL_DIMENSIONS.wheelbaseM * (1.815 / 3.3);
  const rearZ = S1_2012_OPEN_WHEEL_DIMENSIONS.wheelbaseM * (1.485 / 3.3);
  const frontRadius = S1_2012_OPEN_WHEEL_DIMENSIONS.wheelRadiusM * 0.98;
  const rearRadius = S1_2012_OPEN_WHEEL_DIMENSIONS.wheelRadiusM * 1.02;

  useEffect(() => {
    // 조향과 구름을 다른 그룹에 적용해 차체 yaw가 휠 회전축을 오염시키지 않게 한다.
    const safeSteeringAngleRad = Number.isFinite(steeringAngleRad) ? steeringAngleRad : 0;
    const safeWheelSpinRad = wheelSpinRad ?? {
      frontLeft: 0,
      frontRight: 0,
      rearLeft: 0,
      rearRight: 0,
    };
    if (resolvedFrontLeft.steering.current) {
      resolvedFrontLeft.steering.current.rotation.y = safeSteeringAngleRad;
    }
    if (resolvedFrontRight.steering.current) {
      resolvedFrontRight.steering.current.rotation.y = safeSteeringAngleRad;
    }
    const rollingRefs = [
      [resolvedFrontLeft.rolling, safeWheelSpinRad.frontLeft],
      [resolvedFrontRight.rolling, safeWheelSpinRad.frontRight],
      [resolvedRearLeft.rolling, safeWheelSpinRad.rearLeft],
      [resolvedRearRight.rolling, safeWheelSpinRad.rearRight],
    ] as const;
    for (const [ref, spinRad] of rollingRefs) {
      if (ref.current) ref.current.rotation.x = Number.isFinite(spinRad) ? spinRad : 0;
    }
  }, [resolvedFrontLeft, resolvedFrontRight, resolvedRearLeft, resolvedRearRight, steeringAngleRad, wheelSpinRad]);

  return (
    <>
      <Wheel
        steeringGroupRef={resolvedFrontLeft.steering}
        rollingGroupRef={resolvedFrontLeft.rolling}
        accentColor={accentColor}
        position={[-frontHalfTrackM, frontRadius, frontZ]}
        radius={frontRadius}
        side={-1}
        width={S1_2012_OPEN_WHEEL_DIMENSIONS.frontTyreWidthM}
      />
      <Wheel
        steeringGroupRef={resolvedFrontRight.steering}
        rollingGroupRef={resolvedFrontRight.rolling}
        accentColor={accentColor}
        position={[frontHalfTrackM, frontRadius, frontZ]}
        radius={frontRadius}
        side={1}
        width={S1_2012_OPEN_WHEEL_DIMENSIONS.frontTyreWidthM}
      />
      {([-1, 1] as const).map((side) => (
        <Wheel
          key={`rear-wheel-${side}`}
          rollingGroupRef={side < 0 ? resolvedRearLeft.rolling : resolvedRearRight.rolling}
          accentColor={accentColor}
          position={[side * rearHalfTrackM, rearRadius, rearZ]}
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
  const frontWheelX = S1_2012_OPEN_WHEEL_DIMENSIONS.frontTrackWidthM * 0.5;
  const rearWheelX = S1_2012_OPEN_WHEEL_DIMENSIONS.rearTrackWidthM * 0.5;

  return (
    <>
      {([-1, 1] as const).map((side) => (
        <group key={`suspension-${side}`}>
          <Link color={color} end={[side * frontWheelX, 0.5, frontZ]} start={[side * 0.38, 0.76, -1.18]} width={0.045} />
          <Link color={color} end={[side * frontWheelX, 0.46, frontZ]} start={[side * 0.48, 0.61, -1.42]} width={0.04} />
          <Link color={color} end={[side * frontWheelX, 0.38, frontZ]} start={[side * 0.52, 0.42, -1.34]} width={0.045} />
          {/* 후방 pull-rod는 휠 허브에서 기어박스 상부로 올라가는 반대 방향 링크다. */}
          <Link color={color} end={[side * rearWheelX, 0.48, rearZ]} start={[side * 0.26, 0.95, 0.98]} width={0.045} />
          <Link color={color} end={[side * rearWheelX, 0.54, rearZ]} start={[side * 0.42, 0.64, 1.16]} width={0.04} />
          <Link color={color} end={[side * rearWheelX, 0.38, rearZ]} start={[side * 0.5, 0.43, 1.14]} width={0.045} />
        </group>
      ))}
    </>
  );
}

/** 다차량·교육 화면에서 비용을 제한하면서도 콕핏 안의 운전자 방향을 읽게 하는 경량 실루엣이다. */
function GridDriverCockpit({ accentColor }: { accentColor: string }) {
  return (
    <group position={[0, 0.54, -0.02]}>
      <mesh position={[0, 0.22, 0.03]} castShadow>
        <boxGeometry args={[0.24, 0.32, 0.28]} />
        <meshStandardMaterial color="#111821" roughness={0.88} flatShading />
      </mesh>
      <mesh position={[0, 0.43, -0.01]} castShadow>
        <sphereGeometry args={[0.14, 6, 4]} />
        <meshStandardMaterial color={accentColor} roughness={0.66} flatShading />
      </mesh>
      <mesh position={[0, 0.44, -0.12]}>
        <boxGeometry args={[0.15, 0.05, 0.025]} />
        <meshStandardMaterial color="#05070a" metalness={0.42} roughness={0.24} flatShading />
      </mesh>
    </group>
  );
}

/** 다차량 레이스에서 프레임 비용을 제한하면서 2012년형 실루엣을 유지하는 LOD다. */
function GridCar({
  accentColor,
  bodyColor,
  groupRef,
  wheelRefs,
  wheelSpinRad,
  steeringAngleRad,
}: Pick<LowPolyCarProps, "accentColor" | "bodyColor" | "groupRef" | "steeringAngleRad" | "wheelRefs" | "wheelSpinRad">) {
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
      <PlanformPanel color={bodyColor} points={NOSE_STEP_PLANFORM} position={[0, 0.6, 0]} thickness={0.035} />
      <PlanformPanel color={carbonColor} points={FLOOR_PLANFORM} position={[0, 0.29, 0]} thickness={0.055} />
      <mesh position={[0, 0.9, -0.12]}>
        <boxGeometry args={[0.38, 0.045, 0.72]} />
        <meshStandardMaterial color="#07090c" roughness={0.92} flatShading />
      </mesh>
      <GridDriverCockpit accentColor={resolvedAccentColor} />
      <PlanformPanel color={aeroColor} points={FRONT_WING_MAIN_PLANFORM} position={[0, 0.25, 0]} thickness={0.07} />
      <PlanformPanel color={carbonColor} points={FRONT_WING_UPPER_FLAP_PLANFORM} position={[0, 0.4, 0]} thickness={0.03} />
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
        wheelRefs={wheelRefs}
        wheelSpinRad={wheelSpinRad}
        steeringAngleRad={steeringAngleRad}
      />
    </group>
  );
}

/** 외부 참조 사진에서 반복적으로 보이는 2012년형 공력·차체 층을 조합한다. */
export function LowPolyCar({
  groupRef,
  bodyColor,
  accentColor = "#d6b46a",
  emissiveColor = "#000000",
  detail = "hero",
  steeringAngleRad = 0,
  wheelRefs,
  wheelSpinRad,
}: LowPolyCarProps) {
  if (detail === "grid") {
    return (
      <GridCar
        groupRef={groupRef}
        wheelRefs={wheelRefs}
        bodyColor={bodyColor}
        accentColor={accentColor}
        wheelSpinRad={wheelSpinRad}
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

      {/* 스텝 노즈의 상면을 분리해 둥근 단일 노즈가 아닌 2012년형 단차를 보존한다. */}
      <PlanformPanel color={bodyColor} points={NOSE_STEP_PLANFORM} position={[0, 0.6, 0]} thickness={0.04} />
      <mesh position={[0, 0.56, -1.68]} castShadow>
        <boxGeometry args={[0.54, 0.06, 0.26]} />
        <meshStandardMaterial color={carbonColor} roughness={0.68} flatShading />
      </mesh>

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

      {/* 콕핏 가장자리를 얇은 탄소 섬유 림으로 분리해 낮은 시점에서도 운전석 깊이를 읽게 한다. */}
      {([-1, 1] as const).map((side) => (
        <group key={`cockpit-rim-${side}`}>
          <mesh position={[side * 0.27, 0.95, -0.22]}>
            <boxGeometry args={[0.045, 0.055, 0.72]} />
            <meshStandardMaterial color={carbonColor} roughness={0.82} flatShading />
          </mesh>
          {/* 거울은 차체 색을 복제하지 않고 작은 반사면으로만 표시한다. */}
          <Link color={carbonColor} start={[side * 0.3, 0.87, -0.48]} end={[side * 0.47, 0.96, -0.58]} width={0.035} />
          <mesh position={[side * 0.51, 0.98, -0.6]}>
            <boxGeometry args={[0.095, 0.045, 0.13]} />
            <meshStandardMaterial color={highlightColor} metalness={0.48} roughness={0.3} flatShading />
          </mesh>
        </group>
      ))}

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

      {/* 일부 2012 차량에서 보이는 낮은 엔진 커버 핀을 과장하지 않고 공통 시대감으로만 사용한다. */}
      <mesh position={[0, 1.08, 0.92]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.045, 0.28, 0.92]} />
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
          {/* 높은 어깨와 검은 흡입구를 나눠야 차체가 넓은 포드가 아니라 언더컷 포드로 읽힌다. */}
          <mesh position={[side * 0.79, 0.75, -0.52]} rotation={[0, side * 0.11, side * 0.04]}>
            <boxGeometry args={[0.12, 0.15, 0.56]} />
            <meshStandardMaterial color={carbonColor} roughness={0.88} flatShading />
          </mesh>
          <mesh position={[side * 0.84, 0.79, -0.5]} rotation={[0, side * 0.11, side * 0.04]}>
            <boxGeometry args={[0.035, 0.075, 0.38]} />
            <meshStandardMaterial color="#050608" roughness={0.96} flatShading />
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
      <PlanformPanel color={carbonColor} points={FRONT_WING_UPPER_FLAP_PLANFORM} position={[0, 0.4, 0]} thickness={0.035} />
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
      {/* 메인 플레인 사이의 수직 스트레이크로 2012년형 다층 프런트 윙의 방향성을 강조한다. */}
      {([-0.72, -0.32, 0.32, 0.72] as const).map((x) => (
        <mesh key={`front-wing-strake-${x}`} position={[x, 0.34, frontWingZ + 0.03]}>
          <boxGeometry args={[0.035, 0.13, 0.3]} />
          <meshStandardMaterial color={carbonColor} roughness={0.8} flatShading />
        </mesh>
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
      {/* 리어 윙 끝판은 날개 폭과 차체 중심선을 분리해 후면 실루엣을 강화한다. */}
      {([-1, 1] as const).map((side) => (
        <mesh key={`rear-wing-endplate-${side}`} position={[side * 0.91, 1.13, rearWingZ]}>
          <boxGeometry args={[0.055, 0.48, 0.18]} />
          <meshStandardMaterial color={aeroColor} roughness={0.76} flatShading />
        </mesh>
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
        wheelRefs={wheelRefs}
        wheelSpinRad={wheelSpinRad}
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
