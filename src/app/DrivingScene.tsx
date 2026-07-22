import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { BrowserVehicleInput } from "../game/input/BrowserVehicleInput";
import { FixedTimestepAccumulator } from "../game/loop/FixedTimestep";
import {
  RapierChassisSuspension,
  type RapierSuspensionTelemetry,
} from "../game/physics/RapierChassisSuspension";
import { sampleTestTrackSurface } from "../game/physics/TrackSurface";
import { VehicleSimulation, type VehicleTelemetry } from "../game/physics/VehicleSimulation";
import { physicsYawToThreeYaw } from "../rendering/physicsTransform";
import { TestTrackVisual } from "../world/TestTrackVisual";

interface DrivingSceneProps {
  input: BrowserVehicleInput;
  paused: boolean;
  onTelemetry: (telemetry: VehicleTelemetry) => void;
  onSuspensionTelemetry: (telemetry: RapierSuspensionTelemetry | null) => void;
}

/**
 * 물리 상태를 소유하지 않는 임시 차량 시각화다. `groupRef`만 외부 프레임 루프가 갱신하고,
 * 하위 mesh는 장면의 렌더링 구조를 표현한다.
 */
function VehicleModel({ groupRef }: { groupRef: RefObject<THREE.Group | null> }) {
  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.32, 0]} castShadow>
        <boxGeometry args={[1.8, 0.34, 3.2]} />
        <meshStandardMaterial color="#d92f4f" metalness={0.35} roughness={0.42} />
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

/** Rapier quaternion의 Y 회전을 S1 물리 yaw(+Y 회전 부호)로 변환한다. */
function rapierRotationToPhysicsYaw(rotation: { x: number; y: number; z: number; w: number }): number {
  const rapierYawRad = Math.atan2(
    2 * (rotation.w * rotation.y + rotation.x * rotation.z),
    1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z),
  );

  return -rapierYawRad;
}

/**
 * 고정 120Hz 물리, Rapier 차체, 렌더 스냅샷 보간, 추적 카메라를 연결한다.
 * 입력은 `VehicleControlInput` 경계를 통해서만 물리에 들어가며, Rapier는 외부 평면 포즈로
 * `VehicleSimulation`에 동기화되어 HUD와 렌더러가 같은 차량 상태를 읽는다.
 */
export function DrivingScene({ input, paused, onTelemetry, onSuspensionTelemetry }: DrivingSceneProps) {
  const { camera } = useThree();
  const simulation = useMemo(() => new VehicleSimulation(), []);
  const accumulator = useMemo(() => new FixedTimestepAccumulator(), []);
  const vehicleRef = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(), []);
  const desiredCamera = useMemo(() => new THREE.Vector3(), []);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const telemetryClock = useRef(0);
  const suspensionRig = useRef<RapierChassisSuspension | null>(null);

  useEffect(() => {
    // Rapier 초기화는 비동기이므로 완료 전 장면은 평면 프로토타입 상태로 렌더한다.
    let disposed = false;

    void RapierChassisSuspension.create().then((rig) => {
      if (disposed) {
        // effect가 먼저 정리된 경우 새로 만든 native world를 누수시키지 않는다.
        rig.dispose();
        return;
      }

      const initialSnapshot = simulation.getRenderSnapshot(1);
      rig.syncPlanarPose({
        position: initialSnapshot.position,
        velocity: initialSnapshot.velocity,
        yawRad: initialSnapshot.yawRad,
        yawRateRadS: initialSnapshot.yawRateRadS,
      });
      suspensionRig.current = rig;
    }).catch(() => {
      if (!disposed) {
        onSuspensionTelemetry(null);
      }
    });

    return () => {
      // StrictMode 재실행과 장면 언마운트 모두 동일한 정리 경로를 사용한다.
      disposed = true;
      suspensionRig.current?.dispose();
      suspensionRig.current = null;
    };
  }, [onSuspensionTelemetry]);

  useFrame((_, deltaSeconds) => {
    if (input.consumeReset()) {
      simulation.reset();
      input.resetSteering();
      const rig = suspensionRig.current;
      rig?.reset();
      const resetSnapshot = simulation.getRenderSnapshot(1);
      rig?.syncPlanarPose({
        position: resetSnapshot.position,
        velocity: resetSnapshot.velocity,
        yawRad: resetSnapshot.yawRad,
        yawRateRadS: resetSnapshot.yawRateRadS,
      });
    }

    let alpha = 0;
    if (!paused) {
      const frameInput = input.sample(deltaSeconds);
      let stepIndex = 0;
      // 한 렌더 프레임의 입력은 모든 고정 스텝에 공유하되, 변속 에지는 첫 스텝에서만 소비한다.
      const result = accumulator.advance(deltaSeconds, (dt) => {
        simulation.step(
          {
            ...frameInput,
            shiftUp: stepIndex === 0 && frameInput.shiftUp,
            shiftDown: stepIndex === 0 && frameInput.shiftDown,
          },
          dt,
        );
        const rig = suspensionRig.current;
        if (rig) {
          // 평면 명령을 먼저 계산한 뒤 같은 dt에 Rapier 접지·타이어·공력을 적용한다.
          // 순서를 바꾸면 구동 토크와 실제 접지력의 한 스텝 지연이 생긴다.
          const rapierSnapshot = rig.getSnapshot();
          const surface = sampleTestTrackSurface({
            x: rapierSnapshot.position.x,
            z: rapierSnapshot.position.z,
          });
          rig.step(dt, {
            steeringInput: frameInput.steering,
            rearDriveTorqueNm: simulation.current.driveTorqueNm,
            engineBrakeTorqueNm: simulation.current.engineBrakeTorqueNm,
            brakeForceN: simulation.current.brake * simulation.config.maxBrakeForceN,
            surfaceGripMultiplier: surface.gripMultiplier,
            surfaceDragMultiplier: surface.dragMultiplier,
          });
          const updatedRapierSnapshot = rig.getSnapshot();
          const tireStates = rig.getWheelTireStates();
          // 구동계 RPM 피드백은 두 후륜의 평균 각속도를 사용해 좌우 미세 차이를 제거한다.
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
          }, dt);
        }
        stepIndex += 1;
      });
      alpha = result.alpha;
    }

    const snapshot = simulation.getRenderSnapshot(alpha);
    if (vehicleRef.current) {
      // Rapier의 절대 높이 대신 기준 ride height 대비 변화만 시각 모델에 적용한다.
      const rapierTelemetry = suspensionRig.current?.getTelemetry();
      const visualHeight = rapierTelemetry
        ? rapierTelemetry.chassisHeightM - rapierTelemetry.referenceRideHeightM
        : 0;
      vehicleRef.current.position.set(snapshot.position.x, visualHeight, snapshot.position.z);
      vehicleRef.current.rotation.y = physicsYawToThreeYaw(snapshot.yawRad);
    }

    // 카메라 위치와 시선은 보간된 렌더 스냅샷을 사용해 고정 스텝 경계에서 튀지 않게 한다.
    forward.set(Math.sin(snapshot.yawRad), 0, -Math.cos(snapshot.yawRad));
    desiredCamera.set(
      snapshot.position.x - forward.x * 7,
      4.2,
      snapshot.position.z - forward.z * 7,
    );
    camera.position.lerp(desiredCamera, paused ? 0.025 : 0.08);
    target.set(
      snapshot.position.x + forward.x * 4,
      0.35,
      snapshot.position.z + forward.z * 4,
    );
    camera.lookAt(target);

    telemetryClock.current += deltaSeconds;
    if (telemetryClock.current >= 0.1) {
      // React 상태 갱신은 120Hz 물리와 분리해 HUD가 입력 반응성을 저해하지 않게 한다.
      telemetryClock.current = 0;
      onTelemetry(simulation.getTelemetry());
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
      <VehicleModel groupRef={vehicleRef} />
    </>
  );
}
