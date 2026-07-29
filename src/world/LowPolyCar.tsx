/**
 * 물리 스냅샷을 복제하지 않고 표시만 하는 저폴리 오픈휠 차량 모델이다.
 * 헤일로 도입 전 F1의 공통 형태만 참고하며, 특정 팀·차량·로고·스폰서 리버리는 사용하지 않는다.
 */
import { useEffect, useMemo, type RefObject } from "react";
import * as THREE from "three";

/** 렌더링용 차량의 외관만 전달하는 읽기 전용 입력이다. */
export interface LowPolyCarProps {
  /** 물리 포즈를 표시 그룹에 반영하기 위한 선택적 참조다. */
  groupRef?: RefObject<THREE.Group | null>;
  /** 차체 기본 도장 색상이다. 물리나 차량 성능에는 영향을 주지 않는다. */
  bodyColor: string;
  /** 림과 얇은 차체 포인트에 사용할 게임 내 대비 색상이다. */
  accentColor?: string;
  /** 교육 모드처럼 차체를 강조할 때 사용하는 선택적 발광 색상이다. */
  emissiveColor?: string;
}

/** 평면 차체 도면의 한 점이며 두 번째 값은 차량 로컬 -Z 기준의 길이 좌표다. */
type PlanformPoint = readonly [x: number, z: number];

/** 차체 중심 모노코크는 뒤쪽이 넓고 노즈 쪽으로 점진적으로 좁아진다. */
const MONOCOQUE_PLANFORM: readonly PlanformPoint[] = [
  [-0.42, 0.92],
  [0.42, 0.92],
  [0.37, 0.28],
  [0.27, -0.72],
  [0.18, -1.12],
  [-0.18, -1.12],
  [-0.27, -0.72],
  [-0.37, 0.28],
];

/** 낮고 긴 노즈는 수직 피라미드가 아니라 차량의 진행 방향으로 늘어난 평면이다. */
const NOSE_PLANFORM: readonly PlanformPoint[] = [
  [-0.25, -0.76],
  [0.25, -0.76],
  [0.12, -2.05],
  [-0.12, -2.05],
];

/** 사이드포드는 뒤쪽을 넓게, 앞쪽을 차체 안으로 감싸는 쐐기 형태다. */
const LEFT_SIDEPOD_PLANFORM: readonly PlanformPoint[] = [
  [-0.92, 0.62],
  [-0.43, 0.55],
  [-0.41, -0.53],
  [-0.68, -0.62],
  [-0.91, -0.12],
];

/** 오른쪽 사이드포드는 왼쪽 도면의 좌우 반전이다. */
const RIGHT_SIDEPOD_PLANFORM: readonly PlanformPoint[] = LEFT_SIDEPOD_PLANFORM.map(
  ([x, z]) => [-x, z] as PlanformPoint,
);

/** 운전석 뒤 엔진 커버는 에어박스까지 부드럽게 이어지는 작은 테이퍼다. */
const ENGINE_COVER_PLANFORM: readonly PlanformPoint[] = [
  [-0.34, 1.12],
  [0.34, 1.12],
  [0.3, 0.28],
  [-0.3, 0.28],
];

/** 프런트 윙은 직선 막대가 아니라 노즈를 감싸는 얕은 스윕 형상으로 만든다. */
const FRONT_WING_PLANFORM: readonly PlanformPoint[] = [
  [-1.12, -2.14],
  [-0.67, -2.08],
  [-0.28, -1.94],
  [0.28, -1.94],
  [0.67, -2.08],
  [1.12, -2.14],
  [0.98, -2.25],
  [-0.98, -2.25],
];

/** 2D 도면을 얇은 저폴리 입체 패널로 바꾸는 공통 생성기다. */
function createPlanformGeometry(points: readonly PlanformPoint[], thickness: number): THREE.ExtrudeGeometry {
  // Shape의 XY를 차량의 XZ 평면으로 회전해, 패널의 압출 방향이 차체 높이가 되게 한다.
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

/** 생성한 평면 도면을 명시적으로 해제해 레이스 주말의 차량 수 증가를 견딘다. */
function PlanformPanel({
  color,
  points,
  position,
  thickness,
}: {
  color: string;
  points: readonly PlanformPoint[];
  position: readonly [number, number, number];
  thickness: number;
}) {
  // 정적 도면 참조를 기준으로 차량 인스턴스마다 독립적인 geometry를 유지한다.
  const geometry = useMemo(() => createPlanformGeometry(points, thickness), [points, thickness]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} position={position} castShadow receiveShadow>
      <meshStandardMaterial color={color} metalness={0.16} roughness={0.54} flatShading />
    </mesh>
  );
}

/** 실제 오픈휠 비율을 읽게 하는 노출된 네 바퀴와 간단한 허브를 표시한다. */
function Wheels({ accentColor }: { accentColor: string }) {
  // 앞바퀴와 뒷바퀴를 차체 앞뒤에 배치하되, 날개처럼 보이는 과도한 가로 폭은 피한다.
  const wheelPositions = [
    [-1.02, 0.36, -1.16],
    [1.02, 0.36, -1.16],
    [-1.04, 0.36, 0.98],
    [1.04, 0.36, 0.98],
  ] as const;

  return (
    <>
      {wheelPositions.map(([x, y, z]) => (
        <group key={`${x}-${z}`} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.41, 0.41, 0.3, 10]} />
            <meshStandardMaterial color="#17151a" roughness={0.94} flatShading />
          </mesh>
          <mesh position={[0, 0.16, 0]}>
            <cylinderGeometry args={[0.19, 0.19, 0.035, 8]} />
            <meshStandardMaterial color={accentColor} metalness={0.68} roughness={0.32} flatShading />
          </mesh>
          <mesh position={[0, 0.181, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.04, 8]} />
            <meshStandardMaterial color="#111015" roughness={0.8} flatShading />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** 차체에서 바퀴 허브로 이어지는 얇은 프런트 서스펜션 암이다. */
function SuspensionArms({ side }: { side: -1 | 1 }) {
  return (
    <>
      <mesh position={[side * 0.76, 0.47, -1.05]} rotation={[0, side * 0.12, side * 0.18]}>
        <boxGeometry args={[0.055, 0.055, 0.7]} />
        <meshStandardMaterial color="#25222a" roughness={0.78} flatShading />
      </mesh>
      <mesh position={[side * 0.78, 0.44, -1.22]} rotation={[0, side * 0.1, -side * 0.2]}>
        <boxGeometry args={[0.05, 0.05, 0.54]} />
        <meshStandardMaterial color="#25222a" roughness={0.78} flatShading />
      </mesh>
      <mesh position={[side * 0.78, 0.47, 0.9]} rotation={[0, side * 0.12, side * 0.16]}>
        <boxGeometry args={[0.055, 0.055, 0.62]} />
        <meshStandardMaterial color="#25222a" roughness={0.78} flatShading />
      </mesh>
    </>
  );
}

/** 물리 상태를 직접 계산하지 않고 전형적인 저폴리 F1 오픈휠 외관만 표시한다. */
export function LowPolyCar({
  groupRef,
  bodyColor,
  accentColor = "#d6b46a",
  emissiveColor = "#000000",
}: LowPolyCarProps) {
  // 날개는 차체와 같은 도장 계열로 낮춰, 가로 막대가 먼저 보이는 비행기 실루엣을 줄인다.
  const aeroColor = "#2b252b";
  const carbonColor = "#17151a";

  return (
    <group ref={groupRef}>
      {/* 뒤가 넓고 앞이 좁아지는 모노코크가 차량의 중심 실루엣을 담당한다. */}
      <PlanformPanel color={bodyColor} points={MONOCOQUE_PLANFORM} position={[0, 0.48, 0]} thickness={0.2} />
      {/* 노즈는 진행 방향(-Z)으로 눕혀 실제 레이싱카의 낮고 긴 형태를 유지한다. */}
      <PlanformPanel color={bodyColor} points={NOSE_PLANFORM} position={[0, 0.41, 0]} thickness={0.16} />
      {/* 양쪽 사이드포드는 운전석 옆에서 뒤쪽 디퓨저로 이어지는 질량감을 만든다. */}
      <PlanformPanel color={bodyColor} points={LEFT_SIDEPOD_PLANFORM} position={[0, 0.42, 0]} thickness={0.2} />
      <PlanformPanel color={bodyColor} points={RIGHT_SIDEPOD_PLANFORM} position={[0, 0.42, 0]} thickness={0.2} />
      {/* 엔진 커버는 콕핏 뒤를 채워 차체가 앞뒤로 끊겨 보이지 않게 한다. */}
      <PlanformPanel color={bodyColor} points={ENGINE_COVER_PLANFORM} position={[0, 0.56, 0]} thickness={0.26} />

      {/* 헤일로 없이 낮은 시트와 검은 콕핏 바닥만 노출해 오픈 콕핏을 명확히 한다. */}
      <mesh position={[0, 0.61, 0.04]}>
        <boxGeometry args={[0.4, 0.035, 0.62]} />
        <meshStandardMaterial color={carbonColor} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0, 0.65, 0.08]}>
        <boxGeometry args={[0.27, 0.07, 0.42]} />
        <meshStandardMaterial color="#0e0d12" roughness={0.95} flatShading />
      </mesh>
      {/* 운전석 뒤의 낮은 에어박스는 수직 꼬리처럼 보이지 않는 실제 F1형 흡기 형태다. */}
      <mesh position={[0, 0.78, 0.72]} castShadow>
        <cylinderGeometry args={[0.17, 0.21, 0.2, 6]} />
        <meshStandardMaterial color={carbonColor} roughness={0.78} flatShading />
      </mesh>

      {/* 차체 중앙 스트라이프는 윙보다 얇게 두어 진행 방향을 강조한다. */}
      <mesh position={[0, 0.595, -0.58]}>
        <boxGeometry args={[0.07, 0.022, 1.52]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.1} flatShading />
      </mesh>

      {/* 프런트 윙은 스윕된 한 장과 얇은 보조 플랩으로 단순화한다. */}
      <PlanformPanel color={aeroColor} points={FRONT_WING_PLANFORM} position={[0, 0.29, 0]} thickness={0.075} />
      <mesh position={[0, 0.355, -2.08]}>
        <boxGeometry args={[1.42, 0.035, 0.055]} />
        <meshStandardMaterial color={accentColor} roughness={0.64} flatShading />
      </mesh>
      <mesh position={[-1.03, 0.4, -2.14]}>
        <boxGeometry args={[0.08, 0.25, 0.14]} />
        <meshStandardMaterial color={aeroColor} roughness={0.7} flatShading />
      </mesh>
      <mesh position={[1.03, 0.4, -2.14]}>
        <boxGeometry args={[0.08, 0.25, 0.14]} />
        <meshStandardMaterial color={aeroColor} roughness={0.7} flatShading />
      </mesh>

      {/* 리어 윙은 두 개의 얇은 플레이트와 낮은 지지대로 구성해 꼬리만 남긴다. */}
      <mesh position={[0, 0.82, 1.53]} castShadow>
        <boxGeometry args={[1.72, 0.08, 0.14]} />
        <meshStandardMaterial color={aeroColor} roughness={0.7} flatShading />
      </mesh>
      <mesh position={[0, 0.98, 1.57]}>
        <boxGeometry args={[1.56, 0.06, 0.1]} />
        <meshStandardMaterial color={aeroColor} roughness={0.7} flatShading />
      </mesh>
      <mesh position={[0, 1.02, 1.57]}>
        <boxGeometry args={[0.7, 0.025, 0.035]} />
        <meshStandardMaterial color={accentColor} roughness={0.64} flatShading />
      </mesh>
      <mesh position={[-0.77, 0.9, 1.57]}>
        <boxGeometry args={[0.08, 0.38, 0.12]} />
        <meshStandardMaterial color={aeroColor} roughness={0.74} flatShading />
      </mesh>
      <mesh position={[0.77, 0.9, 1.57]}>
        <boxGeometry args={[0.08, 0.38, 0.12]} />
        <meshStandardMaterial color={aeroColor} roughness={0.74} flatShading />
      </mesh>
      <mesh position={[-0.35, 0.67, 1.38]}>
        <boxGeometry args={[0.06, 0.38, 0.06]} />
        <meshStandardMaterial color={carbonColor} roughness={0.82} flatShading />
      </mesh>
      <mesh position={[0.35, 0.67, 1.38]}>
        <boxGeometry args={[0.06, 0.38, 0.06]} />
        <meshStandardMaterial color={carbonColor} roughness={0.82} flatShading />
      </mesh>

      <SuspensionArms side={-1} />
      <SuspensionArms side={1} />
      <Wheels accentColor={accentColor} />
    </group>
  );
}
