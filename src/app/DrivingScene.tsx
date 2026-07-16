import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { BrowserVehicleInput } from "../game/input/BrowserVehicleInput";
import { FixedTimestepAccumulator } from "../game/loop/FixedTimestep";
import { VehicleSimulation, type VehicleTelemetry } from "../game/physics/VehicleSimulation";
import { physicsYawToThreeYaw } from "../rendering/physicsTransform";

interface DrivingSceneProps {
  input: BrowserVehicleInput;
  paused: boolean;
  onTelemetry: (telemetry: VehicleTelemetry) => void;
}

function TrackSurface() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[58, 40]} />
        <meshStandardMaterial color="#17271f" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.48, 0]}>
        <planeGeometry args={[44, 28]} />
        <meshStandardMaterial color="#303844" roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.46, 0]}>
        <planeGeometry args={[26, 12]} />
        <meshStandardMaterial color="#1c3a2b" roughness={1} />
      </mesh>

      <mesh position={[0, -0.39, 6]}>
        <boxGeometry args={[26, 0.08, 0.3]} />
        <meshStandardMaterial color="#d6dbe0" roughness={0.8} />
      </mesh>
      <mesh position={[0, -0.39, -6]}>
        <boxGeometry args={[26, 0.08, 0.3]} />
        <meshStandardMaterial color="#d6dbe0" roughness={0.8} />
      </mesh>
      <mesh position={[13, -0.39, 0]}>
        <boxGeometry args={[0.3, 0.08, 12]} />
        <meshStandardMaterial color="#d6dbe0" roughness={0.8} />
      </mesh>
      <mesh position={[-13, -0.39, 0]}>
        <boxGeometry args={[0.3, 0.08, 12]} />
        <meshStandardMaterial color="#d6dbe0" roughness={0.8} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-10, -0.4, 10]}>
        <planeGeometry args={[0.7, 8]} />
        <meshBasicMaterial color="#f7f8fa" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-9.1, -0.4, 10]}>
        <planeGeometry args={[0.35, 8]} />
        <meshBasicMaterial color="#c9314a" />
      </mesh>

      {[-5, 0, 5].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.4, 10]}>
          <planeGeometry args={[0.12, 3]} />
          <meshBasicMaterial color="#9ea7b3" />
        </mesh>
      ))}
    </group>
  );
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

export function DrivingScene({ input, paused, onTelemetry }: DrivingSceneProps) {
  const { camera } = useThree();
  const simulation = useMemo(() => new VehicleSimulation(), []);
  const accumulator = useMemo(() => new FixedTimestepAccumulator(), []);
  const vehicleRef = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(), []);
  const desiredCamera = useMemo(() => new THREE.Vector3(), []);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const telemetryClock = useRef(0);

  useFrame((_, deltaSeconds) => {
    if (input.consumeReset()) {
      simulation.reset();
      input.resetSteering();
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
        stepIndex += 1;
      });
      alpha = result.alpha;
    }

    const snapshot = simulation.getRenderSnapshot(alpha);
    if (vehicleRef.current) {
      vehicleRef.current.position.set(snapshot.position.x, 0, snapshot.position.z);
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
    }
  });

  return (
    <>
      <color attach="background" args={["#080b10"]} />
      <fog attach="fog" args={["#080b10", 35, 90]} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[-12, 18, 10]} intensity={2.2} castShadow />
      <TrackSurface />
      <VehicleModel groupRef={vehicleRef} />
    </>
  );
}
