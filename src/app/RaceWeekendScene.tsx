/**
 * M2B~M3D 레이스 주말의 R3F 표시 장면이다.
 * RaceWeekendSession이 소유한 VehicleSimulation 스냅샷을 그리며, AI나 렌더러가 위치를 직접 변경하지 않는다.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { BrowserVehicleInput } from "../game/input/BrowserVehicleInput";
import { RaceWeekendSession, type RaceWeekendSnapshot } from "../gameplay/race/RaceWeekendSession";
import type { RaceVehicleRenderSnapshot } from "../gameplay/race/RaceSession";
import { physicsYawToThreeYaw } from "../rendering/physicsTransform";
import { LowPolyCar } from "../world/LowPolyCar";
import { SceneLighting } from "../world/SceneLighting";
import { TestTrackVisual } from "../world/TestTrackVisual";
import { RapierMultiCarCollision } from "../gameplay/race/RapierMultiCarCollision";

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
      <LowPolyCar
        bodyColor={vehicleColor(vehicle)}
        accentColor="#d8b96a"
        detail={vehicle.kind === "player" ? "hero" : "grid"}
        steeringAngleRad={snapshot.steeringAngleRad}
      />
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
  const collisionWorldRef = useRef<RapierMultiCarCollision | null>(null);

  useEffect(() => {
    let disposed = false;
    void RapierMultiCarCollision.create(session.track).then((collisionWorld) => {
      if (disposed) {
        collisionWorld.dispose();
        return;
      }
      collisionWorldRef.current = collisionWorld;
      session.getRaceSession().setCollisionWorld(collisionWorld);
    });
    return () => {
      disposed = true;
      session.getRaceSession().setCollisionWorld(undefined);
      collisionWorldRef.current?.dispose();
      collisionWorldRef.current = null;
    };
  }, [session]);

  useFrame((_, deltaSeconds) => {
    const liveSnapshot = session.getSnapshot();
    if (!paused && liveSnapshot.stage === "race" && liveSnapshot.status === "running") {
      // 브라우저 입력은 공통 VehicleControlInput으로 변환되어 RaceSession의 120Hz 경계를 통과한다.
      // RaceWeekendSession은 레이스 시작 때 RaceSession 인스턴스를 교체하므로 매 프레임 현재 세션에 연결한다.
      session.getRaceSession().setCollisionWorld(collisionWorldRef.current ?? undefined);
      // Rapier 다차량 충돌로 렌더 프레임이 낮아져도 레이스 시간이 화면 프레임에 종속되지 않게
      // 경과 시간에 필요한 fixed-step을 보충한다. 최대 12스텝은 탭 복귀 시 긴 catch-up으로
      // 한 프레임을 독점하는 것을 막는 안전 상한이며, RaceSession 내부는 여전히 120Hz를 사용한다.
      const fixedStepCount = Math.max(1, Math.min(12, Math.ceil(Math.max(0, deltaSeconds) * 120)));
      session.advanceRace(input.sample(deltaSeconds), fixedStepCount);
    }

    const renderSnapshots = session.getRaceSession().getRenderSnapshots(1);
    const player = renderSnapshots.find((vehicle) => vehicle.kind === "player") ?? renderSnapshots[0];
    if (player) {
      forward.set(Math.sin(player.snapshot.yawRad), 0, -Math.cos(player.snapshot.yawRad));
      desiredCamera.set(
        player.snapshot.position.x - forward.x * 8.5,
        6.5,
        player.snapshot.position.z - forward.z * 8.5,
      );
      camera.position.lerp(desiredCamera, paused ? 0.025 : 0.08);
      target.set(
        player.snapshot.position.x + forward.x * 3.5,
        0.2,
        player.snapshot.position.z + forward.z * 3.5,
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
      <SceneLighting variant="weekend" />
      <TestTrackVisual track={session.track} />
      {vehicles.map((vehicle) => <RaceVehicleModel key={vehicle.id} vehicle={vehicle} />)}
    </>
  );
}
