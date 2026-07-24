/**
 * AITrainingRunner의 결정적 평면 스냅샷을 R3F 장면으로 표시하는 교육실이다.
 * 이 장면은 물리 상태를 소유하지 않고, 교육 실행기의 위치·목표점·상태만 읽는다.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import {
  AITrainingRunner,
  type AITrainingSnapshot,
} from "../gameplay/training/AITrainingRunner";
import type { VehicleRenderSnapshot } from "../game/physics/VehicleSimulation";
import { physicsYawToThreeYaw } from "../rendering/physicsTransform";
import { TestTrackVisual } from "../world/TestTrackVisual";

/** 교육 장면이 React HUD에 전달하는 읽기 전용 상태 경계다. */
interface TrainingSceneProps {
  runner: AITrainingRunner;
  paused: boolean;
  onSnapshot: (snapshot: AITrainingSnapshot) => void;
}

/** AI 차량을 계속 화면에 유지하는 교육용 추적 카메라의 초기 거리·높이(m)다. */
const TRAINING_CAMERA_FOLLOW_DISTANCE_M = 15;
const TRAINING_CAMERA_LATERAL_OFFSET_M = 4.5;
const TRAINING_CAMERA_HEIGHT_M = 10;
const TRAINING_CAMERA_LOOK_AHEAD_M = 8;

/** 프레임 시간과 무관하게 안정적인 카메라 추적 감쇠율을 만든다. */
function followDamping(deltaSeconds: number, responsePerSecond: number): number {
  return 1 - Math.exp(-Math.max(0, deltaSeconds) * responsePerSecond);
}

/** 물리 yaw의 전방·오른쪽 벡터로 AI 뒤쪽의 관찰 시점과 전방 주시점을 계산한다. */
function getTrainingCameraPose(snapshot: VehicleRenderSnapshot): {
  position: THREE.Vector3;
  target: THREE.Vector3;
} {
  const forward = new THREE.Vector3(Math.sin(snapshot.yawRad), 0, -Math.cos(snapshot.yawRad));
  const right = new THREE.Vector3(Math.cos(snapshot.yawRad), 0, Math.sin(snapshot.yawRad));
  const position = new THREE.Vector3(snapshot.position.x, TRAINING_CAMERA_HEIGHT_M, snapshot.position.z)
    .addScaledVector(forward, -TRAINING_CAMERA_FOLLOW_DISTANCE_M)
    .addScaledVector(right, TRAINING_CAMERA_LATERAL_OFFSET_M);
  const target = new THREE.Vector3(snapshot.position.x, 0.6, snapshot.position.z)
    .addScaledVector(forward, TRAINING_CAMERA_LOOK_AHEAD_M);
  return { position, target };
}

/** 교육 중인 AI 차량을 데이터 스냅샷으로만 표시하는 렌더 모델이다. */
function TrainingVehicleModel({ groupRef }: { groupRef: RefObject<THREE.Group | null> }) {
  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.32, 0]} castShadow>
        <boxGeometry args={[1.8, 0.34, 3.2]} />
        <meshStandardMaterial
          color="#32c8e8"
          emissive="#075e75"
          emissiveIntensity={0.65}
          metalness={0.45}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0, 0.54, -0.15]} castShadow>
        <boxGeometry args={[0.72, 0.25, 1.2]} />
        <meshStandardMaterial color="#07121b" metalness={0.25} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.3, -1.78]} castShadow>
        <boxGeometry args={[2.25, 0.1, 0.22]} />
        <meshStandardMaterial color="#0b1118" roughness={0.68} />
      </mesh>
      <mesh position={[0, 0.3, 1.76]} castShadow>
        <boxGeometry args={[2.05, 0.12, 0.28]} />
        <meshStandardMaterial color="#0b1118" roughness={0.68} />
      </mesh>
      {[
        [-0.95, 0.22, -1.05],
        [0.95, 0.22, -1.05],
        [-0.95, 0.22, 1.05],
        [0.95, 0.22, 1.05],
      ].map(([x, y, z]) => (
        <mesh key={`${x}-${z}`} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.36, 0.36, 0.22, 16]} />
          <meshStandardMaterial color="#05070a" roughness={0.92} />
        </mesh>
      ))}
    </group>
  );
}

/** 레이싱 라인을 화면에서 cyan 선으로 표시해 AI가 따라가는 경로를 드러낸다. */
function TrainingRacingLine({ runner }: { runner: AITrainingRunner }) {
  const lineObject = useMemo(() => {
    const points = runner.track.racingLine.map((point) => (
      new THREE.Vector3(point.position.x, -0.34, point.position.z)
    ));
    points.push(points[0]?.clone() ?? new THREE.Vector3());
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: "#36d7ff",
      transparent: true,
      opacity: 0.8,
    });
    return new THREE.Line(geometry, material);
  }, [runner]);

  useEffect(() => () => {
    lineObject.geometry.dispose();
    if (Array.isArray(lineObject.material)) {
      lineObject.material.forEach((material) => material.dispose());
    } else {
      lineObject.material.dispose();
    }
  }, [lineObject]);

  return <primitive object={lineObject} />;
}

/** 현재 AI 목표점을 발광 링으로 표시해 제동·조향의 기준점을 관찰하게 한다. */
function TrainingTargetMarker({ snapshot }: { snapshot: AITrainingSnapshot }) {
  const targetRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!targetRef.current) return;
    targetRef.current.position.set(snapshot.targetPoint.x, -0.25, snapshot.targetPoint.z);
    targetRef.current.rotation.z += 0.015;
  });

  return (
    <mesh ref={targetRef} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.45, 0.62, 24]} />
      <meshBasicMaterial color={snapshot.brakePoint ? "#ffbe55" : "#e7fbff"} transparent opacity={0.95} />
    </mesh>
  );
}

/** AI를 근거리에서 추적해 레이싱 라인·제동·차량 자세를 관찰하게 하는 교육 장면이다. */
export function TrainingScene({ runner, paused, onSnapshot }: TrainingSceneProps) {
  const { camera } = useThree();
  const vehicleRef = useRef<THREE.Group>(null);
  const snapshotRef = useRef<AITrainingSnapshot>(runner.getSnapshot());
  const snapshotClock = useRef(0);
  const cameraPosition = useMemo(() => new THREE.Vector3(), []);
  const cameraTarget = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const initialSnapshot = runner.getSnapshot();
    snapshotRef.current = initialSnapshot;
    // 첫 프레임부터 시작 지점의 AI가 보이도록 현재 차량 포즈로 카메라를 즉시 배치한다.
    const initialCameraPose = getTrainingCameraPose(runner.getRenderSnapshot(1));
    camera.position.copy(initialCameraPose.position);
    cameraTarget.copy(initialCameraPose.target);
    camera.lookAt(cameraTarget);
    onSnapshot(initialSnapshot);
  }, [camera, cameraTarget, onSnapshot, runner]);

  useFrame((_, deltaSeconds) => {
    // 페이지가 숨겨진 동안에는 브라우저 visibility 정책에 따라 교육 스텝을 멈춘다.
    if (!paused) {
      // 두 fixed step을 60fps 프레임마다 실행해 120Hz 교육 시간이 실제 관찰 시간과 맞게 한다.
      snapshotRef.current = runner.advance(2);
    }

    // AI 차량은 교육 실행기가 소유한 평면 스냅샷만 읽어 렌더 transform을 갱신한다.
    const snapshot = runner.getRenderSnapshot(1);
    if (vehicleRef.current) {
      vehicleRef.current.position.set(snapshot.position.x, -0.08, snapshot.position.z);
      vehicleRef.current.rotation.y = physicsYawToThreeYaw(snapshot.yawRad);
    }

    // AI 뒤쪽·위쪽의 추적 카메라를 사용해 차체와 전방 레이싱 라인이 항상 프레임에 들어오게 한다.
    const desiredCameraPose = getTrainingCameraPose(snapshot);
    cameraPosition.copy(desiredCameraPose.position);
    cameraTarget.copy(desiredCameraPose.target);
    camera.position.lerp(cameraPosition, followDamping(deltaSeconds, 5.5));
    camera.lookAt(cameraTarget);

    // HUD는 10Hz로만 React 상태를 갱신해 물리 120Hz와 렌더링을 분리한다.
    snapshotClock.current += deltaSeconds;
    if (snapshotClock.current >= 0.1) {
      snapshotClock.current = 0;
      const nextSnapshot = runner.getSnapshot();
      snapshotRef.current = nextSnapshot;
      onSnapshot(nextSnapshot);
    }
  });

  return (
    <>
      <color attach="background" args={["#061118"]} />
      <fog attach="fog" args={["#061118", 60, 240]} />
      <ambientLight intensity={1.15} />
      <directionalLight position={[-12, 22, 14]} intensity={2.5} castShadow />
      <pointLight position={[0, 8, 0]} intensity={18} distance={45} color="#1caac6" />
      <TestTrackVisual track={runner.track} />
      <TrainingRacingLine runner={runner} />
      <TrainingTargetMarker snapshot={snapshotRef.current} />
      <TrainingVehicleModel groupRef={vehicleRef} />
    </>
  );
}
