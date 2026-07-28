/**
 * M2B~M3D 레이스 주말의 R3F 표시 장면이다.
 * RaceWeekendSession이 소유한 VehicleSimulation 스냅샷을 그리며, AI나 렌더러가 위치를 직접 변경하지 않는다.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { BrowserVehicleInput } from "../game/input/BrowserVehicleInput";
import { RaceWeekendSession, type RaceWeekendSnapshot } from "../gameplay/race/RaceWeekendSession";
import type { RaceVehicleRenderSnapshot } from "../gameplay/race/RaceSession";
import { physicsYawToThreeYaw } from "../rendering/physicsTransform";
import { TestTrackVisual } from "../world/TestTrackVisual";

/** 레이스 주말 장면이 앱 셸과 공유하는 입력·일시정지·스냅샷 경계다. */
export interface RaceWeekendSceneProps {
  session: RaceWeekendSession;
  input: BrowserVehicleInput;
  paused: boolean;
  onSnapshot: (snapshot: RaceWeekendSnapshot) => void;
}

/** 참가자 종류에 따라 시각적으로 구분하는 색상이다. 위치·속도 계산에는 사용하지 않는다. */
function vehicleColor(vehicle: RaceVehicleRenderSnapshot): string {
  if (vehicle.kind === "player") return "#e6506c";
  const palette = ["#2fc3d9", "#f2bd56", "#a782e6", "#6ed39d"];
  const index = Math.max(0, Number.parseInt(vehicle.id.replace("ai-", ""), 10) - 1) % palette.length;
  return palette[index] ?? palette[0];
}

/** 차량 하나의 물리 렌더 스냅샷을 표시한다. 이 컴포넌트는 상태를 계산하거나 소유하지 않는다. */
function RaceVehicleModel({ vehicle }: { vehicle: RaceVehicleRenderSnapshot }) {
  const { snapshot } = vehicle;
  return (
    <group
      position={[snapshot.position.x, 0.24, snapshot.position.z]}
      rotation={[0, physicsYawToThreeYaw(snapshot.yawRad), 0]}
    >
      <mesh position={[0, 0.32, 0]} castShadow>
        <boxGeometry args={[1.8, 0.34, 3.2]} />
        <meshStandardMaterial color={vehicleColor(vehicle)} metalness={0.35} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.54, -0.15]} castShadow>
        <boxGeometry args={[0.72, 0.25, 1.2]} />
        <meshStandardMaterial color="#161b25" metalness={0.15} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.3, -1.78]} castShadow>
        <boxGeometry args={[2.25, 0.1, 0.22]} />
        <meshStandardMaterial color="#11151d" roughness={0.7} />
      </mesh>
    </group>
  );
}

/** 주말 세션의 fixed-step을 진행하고 차량·카메라 스냅샷을 10Hz로 React에 전달한다. */
export function RaceWeekendScene({ session, input, paused, onSnapshot }: RaceWeekendSceneProps) {
  const { camera } = useThree();
  const [vehicles, setVehicles] = useState<readonly RaceVehicleRenderSnapshot[]>(() => session.getRaceSession().getRenderSnapshots(1));
  const snapshotClock = useRef(0);
  const target = useMemo(() => new THREE.Vector3(), []);
  const desiredCamera = useMemo(() => new THREE.Vector3(), []);
  const forward = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, deltaSeconds) => {
    const liveSnapshot = session.getSnapshot();
    if (!paused && liveSnapshot.stage === "race" && liveSnapshot.status === "running") {
      // 브라우저 입력은 공통 VehicleControlInput으로 변환되어 RaceSession의 120Hz 경계를 통과한다.
      session.advanceRace(input.sample(deltaSeconds), 2);
    }

    const renderSnapshots = session.getRaceSession().getRenderSnapshots(1);
    const player = renderSnapshots.find((vehicle) => vehicle.kind === "player") ?? renderSnapshots[0];
    if (player) {
      forward.set(Math.sin(player.snapshot.yawRad), 0, -Math.cos(player.snapshot.yawRad));
      desiredCamera.set(
        player.snapshot.position.x - forward.x * 10,
        8,
        player.snapshot.position.z - forward.z * 10,
      );
      camera.position.lerp(desiredCamera, paused ? 0.025 : 0.08);
      target.set(
        player.snapshot.position.x + forward.x * 3,
        0,
        player.snapshot.position.z + forward.z * 3,
      );
      camera.lookAt(target);
    }

    snapshotClock.current += deltaSeconds;
    if (snapshotClock.current >= 0.1) {
      snapshotClock.current = 0;
      setVehicles(renderSnapshots);
      onSnapshot(session.getSnapshot());
    }
  });

  return (
    <>
      <color attach="background" args={["#080b10"]} />
      <fog attach="fog" args={["#080b10", 45, 120]} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[-12, 18, 10]} intensity={2.2} castShadow />
      <TestTrackVisual track={session.track} />
      {vehicles.map((vehicle) => <RaceVehicleModel key={vehicle.id} vehicle={vehicle} />)}
    </>
  );
}
