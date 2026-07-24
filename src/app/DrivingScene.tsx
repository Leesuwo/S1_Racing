/**
 * R3F 렌더 루프를 플레이어·AI의 fixed timestep, VehicleSimulation,
 * Rapier 리그와 연결하는 주행 장면이다. 차량 모델은 스냅샷을 표시할 뿐
 * 물리 상태를 소유하지 않는다.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { BrowserVehicleInput } from "../game/input/BrowserVehicleInput";
import type { VehicleControlInput } from "../game/input/VehicleControlInput";
import { SingleOpponentAI } from "../gameplay/ai/SingleOpponentAI";
import { FixedTimestepAccumulator } from "../game/loop/FixedTimestep";
import {
  RapierChassisSuspension,
  type RapierSuspensionTelemetry,
} from "../game/physics/RapierChassisSuspension";
import { sampleTestTrackSurface } from "../game/physics/TrackSurface";
import { VehicleSimulation, type VehicleTelemetry } from "../game/physics/VehicleSimulation";
import { physicsYawToThreeYaw } from "../rendering/physicsTransform";
import { TestTrackVisual } from "../world/TestTrackVisual";

/** R3F 장면과 플레이어·AI 텔레메트리 콜백 사이의 통합 경계다. */
interface DrivingSceneProps {
  input: BrowserVehicleInput;
  paused: boolean;
  onTelemetry: (telemetry: VehicleTelemetry) => void;
  onOpponentTelemetry: (telemetry: VehicleTelemetry) => void;
  onSuspensionTelemetry: (telemetry: RapierSuspensionTelemetry | null) => void;
}

/** 물리 스냅샷을 표시하는 단순 차량 모델이며 물리 상태를 소유하지 않는다. */
function VehicleModel({
  groupRef,
  color,
}: {
  groupRef: RefObject<THREE.Group | null>;
  color: string;
}) {
  // groupRef는 물리 객체가 아닌 렌더링 transform의 소유 참조다.
  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.32, 0]} castShadow>
        <boxGeometry args={[1.8, 0.34, 3.2]} />
        <meshStandardMaterial color={color} metalness={0.35} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.54, -0.15]} castShadow>
        <boxGeometry args={[0.72, 0.25, 1.2]} />
        <meshStandardMaterial color="#161b25" metalness={0.15} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.3, -1.78]} castShadow>
        <boxGeometry args={[2.25, 0.1, 0.22]} />
        <meshStandardMaterial color="#11151d" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.3, 1.76]} castShadow>
        <boxGeometry args={[2.05, 0.12, 0.28]} />
        <meshStandardMaterial color="#11151d" roughness={0.7} />
      </mesh>
      {/* 렌더링용 휠 위치는 차량 모델 시각화에만 사용한다. */}
      {[
        [-0.95, 0.22, -1.05],
        [0.95, 0.22, -1.05],
        [-0.95, 0.22, 1.05],
        [0.95, 0.22, 1.05],
      ].map(([x, y, z]) => (
        <mesh key={`${x}-${z}`} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.36, 0.36, 0.22, 16]} />
          <meshStandardMaterial color="#080a0e" roughness={0.92} />
        </mesh>
      ))}
    </group>
  );
}
/** 시뮬레이션의 시작·리셋 포즈를 해당 Rapier 리그에 동기화한다. */
function syncRigFromSimulation(
  rig: RapierChassisSuspension,
  simulation: VehicleSimulation,
): void {
  // 렌더링 보간 기준이 되는 현재 물리 포즈 스냅샷이다.
  const snapshot = simulation.getRenderSnapshot(1);
  rig.syncPlanarPose({
    position: snapshot.position,
    velocity: snapshot.velocity,
    yawRad: snapshot.yawRad,
    yawRateRadS: snapshot.yawRateRadS,
  });
}

/**
 * 두 차량 모두 동일한 순서로 Simulation 명령을 만든 뒤 Rapier에 힘을 적용한다.
 * 이 순서를 지켜야 AI가 위치를 덮어쓰지 않고 플레이어와 같은 120Hz 물리 경계를 통과한다.
 */
function stepSimulationWithRig(
  simulation: VehicleSimulation,
  rig: RapierChassisSuspension | null,
  input: VehicleControlInput,
  dtSeconds: number,
): void {
  simulation.step(input, dtSeconds);
  if (!rig) {
    return;
  }

  // 힘을 적용하기 직전 Rapier 차체의 위치로 노면 배율을 샘플링한다.
  const rapierSnapshot = rig.getSnapshot();
  // 플레이어와 AI가 공유하는 트랙 데이터에서 현재 노면 물리 계수를 읽는다.
  const surface = sampleTestTrackSurface({
    x: rapierSnapshot.position.x,
    z: rapierSnapshot.position.z,
  });
  rig.step(dtSeconds, {
    steeringInput: input.steering,
    rearDriveTorqueNm: simulation.current.driveTorqueNm,
    engineBrakeTorqueNm: simulation.current.engineBrakeTorqueNm,
    brakeForceN: simulation.current.brake * simulation.config.maxBrakeForceN,
    surfaceGripMultiplier: surface.gripMultiplier,
    surfaceDragMultiplier: surface.dragMultiplier,
  });
  // 한 fixed step 뒤 Rapier가 소유한 최신 차체 포즈다.
  const updatedRapierSnapshot = rig.getSnapshot();
  // 후륜 타이어 각속도 상태를 차량 구동계 RPM 피드백으로 전달한다.
  const tireStates = rig.getWheelTireStates();
  // 좌우 후륜 각속도의 평균(rad/s)으로 좌우 타이어 노이즈를 줄인다.
  const drivenWheelAngularSpeedRadS = (
    tireStates.rearLeft.wheelAngularSpeedRadS
    + tireStates.rearRight.wheelAngularSpeedRadS
  ) * 0.5;
  simulation.synchronizeFromExternalPose({
    position: {
      x: updatedRapierSnapshot.position.x,
      z: updatedRapierSnapshot.position.z,
    },
    velocity: {
      x: updatedRapierSnapshot.linearVelocity.x,
      z: updatedRapierSnapshot.linearVelocity.z,
    },
    yawRad: rapierRotationToPhysicsYaw(updatedRapierSnapshot.rotation),
    yawRateRadS: -updatedRapierSnapshot.angularVelocity.y,
    drivenWheelAngularSpeedRadS,
  }, dtSeconds);
}

/** Rapier 차체 높이와 보간된 평면 포즈를 Three.js 차량 그룹에 반영한다. */
function updateVehicleModel(
  vehicleRef: RefObject<THREE.Group | null>,
  snapshot: ReturnType<VehicleSimulation["getRenderSnapshot"]>,
  rig: RapierChassisSuspension | null,
): void {
  if (!vehicleRef.current) {
    return;
  }

  // 차체 높이와 기준 승차 높이 차이를 시각화용 수직 오프셋으로 사용한다.
  const rapierTelemetry = rig?.getTelemetry();
  // Rapier 높이를 기준 승차 높이 대비 상대값(m)으로 렌더링한다.
  const visualHeight = rapierTelemetry
    ? rapierTelemetry.chassisHeightM - rapierTelemetry.referenceRideHeightM
    : 0;
  vehicleRef.current.position.set(snapshot.position.x, visualHeight, snapshot.position.z);
  vehicleRef.current.rotation.y = physicsYawToThreeYaw(snapshot.yawRad);
}

/** Rapier quaternion을 프로젝트 물리 좌표계의 yaw(rad)로 변환한다. */
function rapierRotationToPhysicsYaw(rotation: { x: number; y: number; z: number; w: number }): number {
  // quaternion을 평면 yaw로 줄여 VehicleSimulation의 좌표계로 보낸다.
  const rapierYawRad = Math.atan2(
    2 * (rotation.w * rotation.y + rotation.x * rotation.z),
    1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z),
  );

  return -rapierYawRad;
}

/** 플레이어와 단일 AI를 각각 고정 스텝·Rapier 리그에 연결하는 R3F 장면이다. */
export function DrivingScene({
  input,
  paused,
  onTelemetry,
  onOpponentTelemetry,
  onSuspensionTelemetry,
}: DrivingSceneProps) {
  // 현재 R3F 카메라를 차량 추적 위치로 갱신할 렌더링 소유 참조다.
  const { camera } = useThree();
  // 카메라와 두 차량의 시뮬레이션 객체는 컴포넌트 수명 동안 유지한다.
  const simulation = useMemo(() => new VehicleSimulation(), []);
  // 플레이어와 다른 데이터 정의 그리드 포즈를 사용하는 AI 차량 시뮬레이션이다.
  const opponentSimulation = useMemo(
    () => new VehicleSimulation(undefined, undefined, simulation.track.opponentStartPose),
    [simulation],
  );
  // AI 시뮬레이션에만 입력을 공급하는 순수 컨트롤러 인스턴스다.
  const opponentAI = useMemo(() => new SingleOpponentAI(opponentSimulation.track), [opponentSimulation]);
  // 렌더 delta를 120Hz physics step으로 분해하는 누적기다.
  const accumulator = useMemo(() => new FixedTimestepAccumulator(), []);
  // 플레이어 차량의 표시 그룹 참조다.
  const vehicleRef = useRef<THREE.Group>(null);
  // 두 번째 차량 모델의 Three.js 표시 그룹 참조다.
  const opponentVehicleRef = useRef<THREE.Group>(null);
  // 매 프레임 할당을 피하는 카메라 목표·바라보기·전방 벡터 버퍼다.
  const target = useMemo(() => new THREE.Vector3(), []);
  // 차량 뒤쪽에서 따라갈 카메라 위치 버퍼다.
  const desiredCamera = useMemo(() => new THREE.Vector3(), []);
  // 차량 yaw에서 계산한 -Z 전방 벡터 버퍼다.
  const forward = useMemo(() => new THREE.Vector3(), []);
  // HUD 콜백을 100 ms 간격으로 샘플링하는 누적 시계(초)다.
  const telemetryClock = useRef(0);
  // 플레이어 Rapier world의 생명주기와 힘 적용 대상을 참조한다.
  const suspensionRig = useRef<RapierChassisSuspension | null>(null);
  // AI 차량의 독립 Rapier world와 차체를 소유하는 리그 참조다.
  const opponentSuspensionRig = useRef<RapierChassisSuspension | null>(null);

  useEffect(() => {
    // Rapier WASM 생성은 비동기이므로 언마운트 이후 결과를 폐기할 수 있게 한다.
    let disposed = false;

    void Promise.all([
      RapierChassisSuspension.create(),
      RapierChassisSuspension.create(),
    ]).then(([playerRig, opponentRig]) => {
      // 플레이어와 AI가 각각 소유하는 독립 Rapier 리그다.
      if (disposed) {
        playerRig.dispose();
        opponentRig.dispose();
        return;
      }

      syncRigFromSimulation(playerRig, simulation);
      syncRigFromSimulation(opponentRig, opponentSimulation);
      suspensionRig.current = playerRig;
      opponentSuspensionRig.current = opponentRig;
    }).catch(() => {
      // 렌더링은 유지하되 HUD에 물리 초기화 실패를 표시한다.
      if (!disposed) {
        onSuspensionTelemetry(null);
      }
    });

    return () => {
      // 장면 종료 시 두 독립 world의 WASM 자원을 해제한다.
      disposed = true;
      suspensionRig.current?.dispose();
      opponentSuspensionRig.current?.dispose();
      suspensionRig.current = null;
      opponentSuspensionRig.current = null;
    };
  }, [onOpponentTelemetry, onSuspensionTelemetry, opponentSimulation, simulation]);

  useFrame((_, deltaSeconds) => {
    // UI 또는 R키 리셋은 플레이어·AI·두 Rapier 리그에 동시에 적용한다.
    if (input.consumeReset()) {
      simulation.reset();
      opponentSimulation.reset();
      opponentAI.reset();
      input.resetSteering();
      // 현재 리그 참조를 지역 변수로 고정해 한 번의 리셋이 동일 대상을 사용하게 한다.
      const rig = suspensionRig.current;
      // AI 리그도 같은 리셋 이벤트에 맞춰 독립적으로 초기화한다.
      const opponentRig = opponentSuspensionRig.current;
      rig?.reset();
      opponentRig?.reset();
      if (rig) syncRigFromSimulation(rig, simulation);
      if (opponentRig) syncRigFromSimulation(opponentRig, opponentSimulation);
    }

    // 누적기에서 반환하는 렌더 보간 계수(0..1)다.
    // 일시정지 중에는 누적기와 입력을 진행하지 않고 마지막 상태를 렌더링한다.
    let alpha = 0;
    if (!paused) {
      // 한 렌더 프레임에서 읽은 플레이어 장치 입력을 모든 fixed step에 재사용한다.
      const frameInput = input.sample(deltaSeconds);
      // 여러 fixed step이 발생해도 수동 변속 edge는 첫 step에만 전달한다.
      let stepIndex = 0;
      // 한 렌더 프레임 동안 실행된 fixed step 수와 최종 보간 계수다.
      // frameInput의 edge는 여러 fixed step 중 첫 step에만 전달한다.
      const result = accumulator.advance(deltaSeconds, (dt) => {
        // 플레이어 입력은 브라우저 입력 경계에서 온 값을 fixed step 명령으로 제한한다.
        const playerInput = {
          ...frameInput,
          shiftUp: stepIndex === 0 && frameInput.shiftUp,
          shiftDown: stepIndex === 0 && frameInput.shiftDown,
        };
        // AI도 같은 VehicleControlInput을 매 fixed step 새로 생성한다.
        // AI도 현재 차량 상태만 읽어 매 fixed step 새 공통 입력을 생성한다.
        const aiInput = opponentAI.update({
          ...opponentSimulation.current,
          maxGear: opponentSimulation.config.gearRatios.length,
        }, dt);
        stepSimulationWithRig(simulation, suspensionRig.current, playerInput, dt);
        stepSimulationWithRig(opponentSimulation, opponentSuspensionRig.current, aiInput, dt);
        stepIndex += 1;
      });
      alpha = result.alpha;
    }

    // 두 차량 모두 현재 누적기 alpha로 보간된 표시 포즈를 읽는다.
    const snapshot = simulation.getRenderSnapshot(alpha);
    // AI 차량도 동일한 보간 계수로 렌더링해 두 차량의 시간축을 일치시킨다.
    const opponentSnapshot = opponentSimulation.getRenderSnapshot(alpha);
    updateVehicleModel(vehicleRef, snapshot, suspensionRig.current);
    updateVehicleModel(opponentVehicleRef, opponentSnapshot, opponentSuspensionRig.current);

    // 차량 전방을 기준으로 후방 카메라 위치와 바라볼 점을 계산한다.
    forward.set(Math.sin(snapshot.yawRad), 0, -Math.cos(snapshot.yawRad));
    desiredCamera.set(
      snapshot.position.x - forward.x * 7,
      4.2,
      snapshot.position.z - forward.z * 7,
    );
    // pause 중에는 카메라까지 느리게 보간해 화면이 갑자기 움직이지 않게 한다.
    camera.position.lerp(desiredCamera, paused ? 0.025 : 0.08);
    target.set(
      snapshot.position.x + forward.x * 4,
      0.35,
      snapshot.position.z + forward.z * 4,
    );
    camera.lookAt(target);

    // 물리 루프는 120Hz지만 HUD는 10Hz 샘플로 충분해 렌더 상태 갱신을 줄인다.
    telemetryClock.current += deltaSeconds;
    if (telemetryClock.current >= 0.1) {
      telemetryClock.current = 0;
      onTelemetry(simulation.getTelemetry());
      onOpponentTelemetry(opponentSimulation.getTelemetry());
      onSuspensionTelemetry(suspensionRig.current?.getTelemetry() ?? null);
    }
  });

  return (
    <>
      <color attach="background" args={["#080b10"]} />
      <fog attach="fog" args={["#080b10", 35, 90]} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[-12, 18, 10]} intensity={2.2} castShadow />
      <TestTrackVisual />
      <VehicleModel groupRef={vehicleRef} color="#d92f4f" />
      <VehicleModel groupRef={opponentVehicleRef} color="#27b8d6" />
    </>
  );
}
