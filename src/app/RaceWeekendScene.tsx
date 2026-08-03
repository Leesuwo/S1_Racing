/**
 * M2B~M3D 레이스 주말의 R3F 표시 장면이다.
 * RaceWeekendSession이 소유한 VehicleSimulation 스냅샷을 그리며, AI나 렌더러가 위치를 직접 변경하지 않는다.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { BrowserVehicleInput } from "../game/input/BrowserVehicleInput";
import { RaceWeekendSession, type RaceWeekendSnapshot } from "../gameplay/race/RaceWeekendSession";
import type { RaceVehicleRenderSnapshot } from "../gameplay/race/RaceSession";
import { physicsYawToThreeYaw } from "../rendering/physicsTransform";
import { LowPolyCar } from "../world/LowPolyCar";
import { SceneLighting } from "../world/SceneLighting";
import { TestTrackVisual } from "../world/TestTrackVisual";
import { RapierMultiCarCollision } from "../gameplay/race/RapierMultiCarCollision";
import { FixedTimestepAccumulator } from "../game/loop/FixedTimestep";

/** Canvas가 frame을 중단한 환경에서 Race Weekend fixed step을 확인하는 간격(ms)이다. */
const WEEKEND_FALLBACK_INTERVAL_MS = 1000 / 60;
/** R3F frame 부재로 판단하는 보수적 지연(ms)이다. */
const WEEKEND_RENDER_STALL_MS = 100;

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
  const vehicleRef = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    // AI도 플레이어와 같은 RB8 hero geometry를 쓰지만, 19대가 모두 shadow map을 갱신하면
    // 외관 통일과 무관하게 draw-call 비용이 급증하므로, 플레이어만 그림자를 남긴다.
    if (vehicle.kind === "player") return;
    vehicleRef.current?.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = false;
        object.receiveShadow = false;
      }
    });
  });

  return (
    <group
      ref={vehicleRef}
      position={[snapshot.position.x, 0.24, snapshot.position.z]}
      rotation={[0, physicsYawToThreeYaw(snapshot.yawRad), 0]}
    >
      <LowPolyCar
        bodyColor={vehicleColor(vehicle)}
        accentColor="#d8b96a"
        // 플레이어와 AI가 같은 RB8 Form Study 외관을 써야 레이스 결과 화면에서 차량 정체성이 달라지지 않는다.
        detail="hero"
        steeringAngleRad={snapshot.steeringAngleRad}
        wheelSpinRad={snapshot.wheelSpinRad}
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
  // Race Weekend도 Driving과 같은 누적기를 사용해 ceil 기반 과잉 step과 catch-up 폭주를 막는다.
  const fixedTimestep = useMemo(() => new FixedTimestepAccumulator(), []);
  // lazy scene·WebGL 절전으로 R3F frame이 멈춘 시간을 기록한다.
  const lastRenderFrameAtMs = useRef(performance.now());

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

  useEffect(() => {
    // 정상 frame이 있는 동안에는 아래 useFrame만 실행한다. fallback은 렌더가 멈춘 경우에만
    // 동일한 accumulator와 입력 경계로 레이스를 진행해 상태 패널과 물리 시간이 분리되지 않게 한다.
    const intervalId = window.setInterval(() => {
      const nowMs = performance.now();
      const liveSnapshot = session.getSnapshot();
      if (
        paused
        || nowMs - lastRenderFrameAtMs.current < WEEKEND_RENDER_STALL_MS
        || liveSnapshot.stage !== "race"
        || liveSnapshot.status !== "running"
      ) return;
      session.getRaceSession().setCollisionWorld(collisionWorldRef.current ?? undefined);
      fixedTimestep.advance(WEEKEND_FALLBACK_INTERVAL_MS / 1000, (dtSeconds) => {
        session.advanceRace(input.sample(dtSeconds), 1);
      });
      snapshotClock.current += WEEKEND_FALLBACK_INTERVAL_MS / 1000;
      if (snapshotClock.current >= 0.1) {
        snapshotClock.current = 0;
        setVehicles(session.getRaceSession().getRenderSnapshots(1));
        onSnapshot(session.getSnapshot());
      }
    }, WEEKEND_FALLBACK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [fixedTimestep, input, onSnapshot, paused, session]);

  useFrame((_, deltaSeconds) => {
    lastRenderFrameAtMs.current = performance.now();
    const liveSnapshot = session.getSnapshot();
    if (!paused && liveSnapshot.stage === "race" && liveSnapshot.status === "running") {
      // 브라우저 입력은 공통 VehicleControlInput으로 변환되어 RaceSession의 120Hz 경계를 통과한다.
      // RaceWeekendSession은 레이스 시작 때 RaceSession 인스턴스를 교체하므로 매 프레임 현재 세션에 연결한다.
      session.getRaceSession().setCollisionWorld(collisionWorldRef.current ?? undefined);
      // 렌더 프레임 delta는 120Hz 누적기에만 전달한다. 느린 프레임에서 이전 구현처럼
      // 한 렌더마다 최대 12회의 Rapier·리플레이 작업을 몰아 실행하지 않는다.
      fixedTimestep.advance(deltaSeconds, (dtSeconds) => {
        session.advanceRace(input.sample(dtSeconds), 1);
      });
    }

    // 카메라는 매 프레임 플레이어 하나만 읽고, 전체 그리드 배열은 HUD와 같은 10Hz로만 복사한다.
    const player = session.getRaceSession().getPlayerRenderSnapshot(1);
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
      setVehicles(session.getRaceSession().getRenderSnapshots(1));
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
