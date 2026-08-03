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
import {
  SingleOpponentAI,
  type SingleOpponentAIConfig,
} from "../gameplay/ai/SingleOpponentAI";
import { FixedTimestepAccumulator } from "../game/loop/FixedTimestep";
import {
  RapierChassisSuspension,
  type RapierSuspensionTelemetry,
} from "../game/physics/RapierChassisSuspension";
import { sampleTestTrackSurface } from "../game/physics/TrackSurface";
import { VehicleSimulation, type VehicleTelemetry } from "../game/physics/VehicleSimulation";
import { TrackLimitsMonitor, type TrackLimitsSnapshot } from "../gameplay/race/TrackLimits";
import { physicsSteeringToThreeWheelYaw, physicsYawToThreeYaw } from "../rendering/physicsTransform";
import { LowPolyCar, type LowPolyCarWheelRefs } from "../world/LowPolyCar";
import { SceneLighting } from "../world/SceneLighting";
import { TestTrackVisual } from "../world/TestTrackVisual";

/** 주행 화면에서 차량을 외부에서 추적하거나 운전자 위치에서 관찰하는 렌더 전용 시점이다. */
export type DrivingCameraView = "chase" | "cockpit";

/**
 * 2012년 온보드 자료에서 추출한 콕핏 카메라의 렌더링 전용 기준값이다.
 * 실제 차량 CAD 치수가 아니므로 `initial_assumption`이며 물리 차체의 무게중심이나 충돌 형상에는 사용하지 않는다.
 */
const COCKPIT_CAMERA = {
  /** 휠 뒤쪽의 운전자 눈 위치에 두기 위한 차량 로컬 후방 오프셋(m)이다. */
  forwardOffsetM: -0.25,
  /** 낮은 2012년형 착좌 자세를 읽게 하는 차체 기준 높이(m)다. */
  heightM: 1,
  /** 노즈·프런트 윙과 전방 트랙을 함께 보게 하는 바라보기 거리(m)다. */
  lookAheadM: 18,
  /** 수평선보다 약간 아래를 보게 해 스티어링 휠·노즈가 화면 하단에 남도록 하는 오프셋(m)이다. */
  lookDownM: 0.35,
  /** 좁은 추적 시점보다 넓은 온보드 주변 시야를 위한 수직 시야각(deg)이다. */
  fovDeg: 68,
} as const;

/** 외부 추적 시점은 차량 자세와 트랙을 함께 읽기 위한 기존 수직 시야각(deg)이다. */
const CHASE_CAMERA_FOV_DEG = 55;

/** R3F 장면과 플레이어·AI 텔레메트리 콜백 사이의 통합 경계다. */
interface DrivingSceneProps {
  input: BrowserVehicleInput;
  paused: boolean;
  /** App 셸이 소유하는 UI 시점 선택이며 차량 물리와 분리된다. */
  cameraView: DrivingCameraView;
  /** M2A-0에서 검증·적용된 AI 설정이며, 생략하지 않고 주행 세션에 전달한다. */
  opponentAIConfig: SingleOpponentAIConfig;
  onTelemetry: (telemetry: VehicleTelemetry) => void;
  onOpponentTelemetry: (telemetry: VehicleTelemetry) => void;
  onSuspensionTelemetry: (telemetry: RapierSuspensionTelemetry | null) => void;
  onTrackLimits: (player: TrackLimitsSnapshot, opponent: TrackLimitsSnapshot) => void;
}

/** 물리 스냅샷을 표시하는 단순 차량 모델이며 물리 상태를 소유하지 않는다. */
function VehicleModel({
  groupRef,
  wheelRefs,
  color,
  hideDriver = false,
}: {
  groupRef: RefObject<THREE.Group | null>;
  wheelRefs: LowPolyCarWheelRefs;
  color: string;
  /** 1인칭 시점에서 플레이어 자신의 외부 드라이버 메시를 생략한다. */
  hideDriver?: boolean;
}) {
  return (
    <LowPolyCar
      groupRef={groupRef}
      wheelRefs={wheelRefs}
      bodyColor={color}
      accentColor="#d8b96a"
      hideDriver={hideDriver}
    />
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
  const tyreCondition = simulation.getTyreCondition();
  rig.step(dtSeconds, {
    steeringInput: input.steering,
    rearDriveTorqueNm: simulation.current.driveTorqueNm,
    engineBrakeTorqueNm: simulation.current.engineBrakeTorqueNm,
    brakeForceN: simulation.current.brake * simulation.config.maxBrakeForceN,
    surfaceGripMultiplier: surface.gripMultiplier * tyreCondition.gripMultiplier,
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
    wheelAngularSpeedRadS: {
      frontLeft: tireStates.frontLeft.wheelAngularSpeedRadS,
      frontRight: tireStates.frontRight.wheelAngularSpeedRadS,
      rearLeft: tireStates.rearLeft.wheelAngularSpeedRadS,
      rearRight: tireStates.rearRight.wheelAngularSpeedRadS,
    },
  }, dtSeconds);
}

/** Rapier 차체 높이와 보간된 평면 포즈를 Three.js 차량 그룹에 반영한다. */
function updateVehicleModel(
  vehicleRef: RefObject<THREE.Group | null>,
  wheelRefs: LowPolyCarWheelRefs,
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
  // 차체 yaw와 분리해 앞축만 시각 조향한다. 차량 포즈·타이어 힘·입력 상태는 이 함수가 소유하지 않는다.
  const steeringAngleRad = Number.isFinite(snapshot.steeringAngleRad) ? snapshot.steeringAngleRad : 0;
  // 물리의 양의 조향은 +X를 향하지만 Three.js의 +Y 회전은 -Z 전방을 -X로 보내므로 부호를 변환한다.
  const visualSteeringAngleRad = physicsSteeringToThreeWheelYaw(steeringAngleRad);
  wheelRefs.frontLeft.steering.current && (wheelRefs.frontLeft.steering.current.rotation.y = visualSteeringAngleRad);
  wheelRefs.frontRight.steering.current && (wheelRefs.frontRight.steering.current.rotation.y = visualSteeringAngleRad);
  // Rapier 우선 또는 평면 fallback으로 계산된 누적 회전량을 네 바퀴의 X축에 적용한다.
  for (const [ref, spinRad] of [
    [wheelRefs.frontLeft.rolling, snapshot.wheelSpinRad.frontLeft],
    [wheelRefs.frontRight.rolling, snapshot.wheelSpinRad.frontRight],
    [wheelRefs.rearLeft.rolling, snapshot.wheelSpinRad.rearLeft],
    [wheelRefs.rearRight.rolling, snapshot.wheelSpinRad.rearRight],
  ] as const) {
    if (ref.current) ref.current.rotation.x = Number.isFinite(spinRad) ? spinRad : 0;
  }
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
  cameraView,
  opponentAIConfig,
  onTelemetry,
  onOpponentTelemetry,
  onSuspensionTelemetry,
  onTrackLimits,
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
  const opponentAI = useMemo(
    () => new SingleOpponentAI(opponentSimulation.track, opponentAIConfig),
    [opponentAIConfig, opponentSimulation],
  );
  // 차량별 도로 이탈 이벤트와 랩 유효성을 물리 포즈와 같은 트랙 원본에서 계산한다.
  const trackLimits = useMemo(() => new TrackLimitsMonitor(simulation.track), [simulation]);
  const opponentTrackLimits = useMemo(() => new TrackLimitsMonitor(opponentSimulation.track), [opponentSimulation]);
  // 렌더 delta를 120Hz physics step으로 분해하는 누적기다.
  const accumulator = useMemo(() => new FixedTimestepAccumulator(), []);
  // 플레이어 차량의 표시 그룹 참조다.
  const vehicleRef = useRef<THREE.Group>(null);
  // 두 번째 차량 모델의 Three.js 표시 그룹 참조다.
  const opponentVehicleRef = useRef<THREE.Group>(null);
  // 플레이어와 AI가 각각 조향축과 구름축을 독립적으로 표시하도록 네 바퀴 참조를 만든다.
  const wheelRefs: LowPolyCarWheelRefs = {
    frontLeft: { steering: useRef<THREE.Group>(null), rolling: useRef<THREE.Group>(null) },
    frontRight: { steering: useRef<THREE.Group>(null), rolling: useRef<THREE.Group>(null) },
    rearLeft: { rolling: useRef<THREE.Group>(null) },
    rearRight: { rolling: useRef<THREE.Group>(null) },
  };
  const opponentWheelRefs: LowPolyCarWheelRefs = {
    frontLeft: { steering: useRef<THREE.Group>(null), rolling: useRef<THREE.Group>(null) },
    frontRight: { steering: useRef<THREE.Group>(null), rolling: useRef<THREE.Group>(null) },
    rearLeft: { rolling: useRef<THREE.Group>(null) },
    rearRight: { rolling: useRef<THREE.Group>(null) },
  };
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
    // 시점 전환은 projection만 바꾸며, 렌더러가 차량 포즈나 입력을 수정하지 않게 한다.
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    const nextFovDeg = cameraView === "cockpit" ? COCKPIT_CAMERA.fovDeg : CHASE_CAMERA_FOV_DEG;
    if (camera.fov === nextFovDeg) return;

    camera.fov = nextFovDeg;
    camera.updateProjectionMatrix();
  }, [camera, cameraView]);

  useEffect(() => {
    // Rapier WASM 생성은 비동기이므로 언마운트 이후 결과를 폐기할 수 있게 한다.
    let disposed = false;

    void Promise.all([
      RapierChassisSuspension.create(undefined, simulation.track),
      RapierChassisSuspension.create(undefined, opponentSimulation.track),
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
      trackLimits.reset();
      opponentTrackLimits.reset();
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
        trackLimits.update(simulation.current.position, dt);
        opponentTrackLimits.update(opponentSimulation.current.position, dt);
        stepIndex += 1;
      });
      alpha = result.alpha;
    }

    // 두 차량 모두 현재 누적기 alpha로 보간된 표시 포즈를 읽는다.
    const snapshot = simulation.getRenderSnapshot(alpha);
    // AI 차량도 동일한 보간 계수로 렌더링해 두 차량의 시간축을 일치시킨다.
    const opponentSnapshot = opponentSimulation.getRenderSnapshot(alpha);
    updateVehicleModel(vehicleRef, wheelRefs, snapshot, suspensionRig.current);
    updateVehicleModel(opponentVehicleRef, opponentWheelRefs, opponentSnapshot, opponentSuspensionRig.current);

    // 차량 전방을 기준으로 후방·콕핏 카메라가 공유할 차량 로컬 전방 벡터를 계산한다.
    forward.set(Math.sin(snapshot.yawRad), 0, -Math.cos(snapshot.yawRad));
    // Rapier 차체의 승차 높이는 콕핏에서만 필요하므로 외부 추적 시점의 프레임 비용에 넣지 않는다.
    const cockpitRigTelemetry = cameraView === "cockpit" ? suspensionRig.current?.getTelemetry() : null;
    // 차량 내부에서 카메라만 수직으로 떠 보이지 않게 현재 승차 높이 차이를 읽기 전용으로 사용한다.
    const cockpitVisualHeight = cockpitRigTelemetry
      ? cockpitRigTelemetry.chassisHeightM - cockpitRigTelemetry.referenceRideHeightM
      : 0;
    if (cameraView === "cockpit") {
      // 헬멧보다 앞·휠보다 위에 고정해 운전자 눈높이에서 노즈와 스티어링 휠을 함께 읽게 한다.
      desiredCamera.set(
        snapshot.position.x + forward.x * COCKPIT_CAMERA.forwardOffsetM,
        cockpitVisualHeight + COCKPIT_CAMERA.heightM,
        snapshot.position.z + forward.z * COCKPIT_CAMERA.forwardOffsetM,
      );
      target.copy(desiredCamera).addScaledVector(forward, COCKPIT_CAMERA.lookAheadM);
      target.y -= COCKPIT_CAMERA.lookDownM;
      // 운전자 시점은 차체에 고정돼야 하므로 추적 카메라처럼 지연 보간하지 않는다.
      camera.position.copy(desiredCamera);
    } else {
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
    }
    camera.lookAt(target);

    // 물리 루프는 120Hz지만 HUD는 10Hz 샘플로 충분해 렌더 상태 갱신을 줄인다.
    telemetryClock.current += deltaSeconds;
    if (telemetryClock.current >= 0.1) {
      telemetryClock.current = 0;
      onTelemetry(simulation.getTelemetry());
      onOpponentTelemetry(opponentSimulation.getTelemetry());
      onSuspensionTelemetry(suspensionRig.current?.getTelemetry() ?? null);
      onTrackLimits(trackLimits.getSnapshot(), opponentTrackLimits.getSnapshot());
    }
  });

  return (
    <>
      <SceneLighting variant="driving" />
      <TestTrackVisual track={simulation.track} />
      <VehicleModel
        groupRef={vehicleRef}
        wheelRefs={wheelRefs}
        color="#d92f4f"
        hideDriver={cameraView === "cockpit"}
      />
      <VehicleModel groupRef={opponentVehicleRef} wheelRefs={opponentWheelRefs} color="#27b8d6" />
    </>
  );
}
