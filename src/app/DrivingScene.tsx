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

function rapierRotationToPhysicsYaw(rotation: { x: number; y: number; z: number; w: number }): number {
  const rapierYawRad = Math.atan2(
    2 * (rotation.w * rotation.y + rotation.x * rotation.z),
    1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z),
  );

  return -rapierYawRad;
}

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
    let disposed = false;

    void RapierChassisSuspension.create().then((rig) => {
      if (disposed) {
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
      const rapierTelemetry = suspensionRig.current?.getTelemetry();
      const visualHeight = rapierTelemetry
        ? rapierTelemetry.chassisHeightM - rapierTelemetry.referenceRideHeightM
        : 0;
      vehicleRef.current.position.set(snapshot.position.x, visualHeight, snapshot.position.z);
      vehicleRef.current.rotation.y = physicsYawToThreeYaw(snapshot.yawRad);
    }

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
