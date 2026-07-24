/**
 * 입력·기어·차량 텔레메트리와 순수 평면 차량 물리를 묶는 상태 브리지다.
 * Rapier를 사용하는 장면에서는 외부 포즈를 동기화하되 렌더러는 스냅샷만 읽는다.
 */
import type { VehicleControlInput } from "../input/VehicleControlInput";
import { sampleTrackSurface } from "./TrackSurface";
import {
  cloneVehicleState,
  createInitialVehicleState,
  DEFAULT_VEHICLE_CONFIG,
  resetVehicleState,
  shiftGear,
  stepVehicle,
  type VehiclePhysicsConfig,
  type VehicleState,
} from "./VehiclePhysics";
import type { WheelValues } from "./Suspension";
import {
  sampleTestTrackLocation,
  TEST_TRACK_DATA,
  type TestTrackStartPose,
  type TestTrackDefinition,
} from "../../tracks/TestTrack";

/** 렌더러가 보간해 표시할 차량 평면 상태의 읽기 전용 스냅샷이다. */
export interface VehicleRenderSnapshot {
  position: { x: number; z: number };
  velocity: { x: number; z: number };
  yawRad: number;
  yawRateRadS: number;
  speedMps: number;
  rpm: number;
  gear: number;
  surface: VehicleState["surface"];
}

/** HUD와 검증에 필요한 차량·트랙·휠 상태를 표시용 단위로 제공한다. */
export interface VehicleTelemetry {
  speedKmh: number;
  rpm: number;
  redlineRpm: number;
  gear: number;
  throttle: number;
  brake: number;
  steering: number;
  surface: VehicleState["surface"];
  lateralG: number;
  downforceN: number;
  dragForceN: number;
  engineForceN: number;
  engineTorqueNm: number;
  driveTorqueNm: number;
  engineBrakeTorqueNm: number;
  wheelLoadsN: WheelValues;
  wheelCompressionM: WheelValues;
  trackSectionId: string;
  trackSectionLabel: string;
  onTrack: boolean;
  distanceToBoundaryM: number;
}

/** 외부 Rapier 포즈를 기존 차량 상태로 전달하는 평면 물리 경계다. */
export interface ExternalPlanarVehiclePose {
  position: { x: number; z: number };
  velocity: { x: number; z: number };
  yawRad: number;
  yawRateRadS: number;
  drivenWheelAngularSpeedRadS?: number;
}

/** 두 평면 벡터의 내적을 속도 성분 투영에 사용한다. */
function dot(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return a.x * b.x + a.z * b.z;
}

/** yaw 기준 차량 오른쪽 단위 벡터를 반환한다. */
function rightVector(yawRad: number): { x: number; z: number } {
  return { x: Math.cos(yawRad), z: Math.sin(yawRad) };
}

/**
 * 입력·기어·RPM·텔레메트리를 소유하고, 외부 Rapier 포즈를 읽기 전용 스냅샷으로 연결하는 차량 브리지다.
 * AI도 이 클래스에 동일한 VehicleControlInput을 전달하므로 위치 직접 조작 경계가 생기지 않는다.
 */
export class VehicleSimulation {
  /** 차량 튜닝값과 물리 단위를 보유한다. */
  readonly config: VehiclePhysicsConfig;
  /** fixed step마다 갱신되는 현재 차량 상태다. */
  readonly current: VehicleState;
  /** 노면·경계·레이싱 라인을 제공하는 데이터 기반 트랙이다. */
  readonly track: TestTrackDefinition;
  /** 리셋 시 복원할 플레이어 또는 AI의 데이터 정의 시작 포즈다. */
  readonly startPose: TestTrackStartPose;
  /** 렌더 보간용 이전 fixed step 상태다. */
  private previous: VehicleState;

  constructor(
    config: VehiclePhysicsConfig = DEFAULT_VEHICLE_CONFIG,
    track: TestTrackDefinition = TEST_TRACK_DATA,
    startPose: TestTrackStartPose = track.startPose,
  ) {
    // 시작 포즈를 복사해 외부 객체 변경이 시뮬레이션 상태를 오염시키지 않게 한다.
    this.config = config;
    this.track = track;
    this.startPose = {
      position: { ...startPose.position },
      yawRad: startPose.yawRad,
    };
    // 현재와 이전 상태를 같은 시작 포즈로 만들어 첫 프레임 보간을 안정화한다.
    this.current = createInitialVehicleState(this.startPose.position, this.startPose.yawRad);
    this.previous = cloneVehicleState(this.current);
  }

  step(input: VehicleControlInput, dt: number): void {
    // 렌더러가 두 fixed step 사이를 보간할 수 있도록 이전 상태를 먼저 저장한다.
    this.previous = cloneVehicleState(this.current);

    if (input.shiftUp) {
      shiftGear(this.current, 1, this.config.gearRatios.length);
    }
    if (input.shiftDown) {
      shiftGear(this.current, -1, this.config.gearRatios.length);
    }

    // 차량 위치에서 노면을 샘플링해 동일한 입력이 표면별 그립을 받게 한다.
    const surface = sampleTrackSurface(this.current.position, this.track);
    stepVehicle(this.current, input, dt, this.config, surface);
  }

  reset(): void {
    // AI 차량은 플레이어와 다른 그리드 포즈를 사용할 수 있으므로 track.startPose를 다시 읽지 않는다.
    resetVehicleState(this.current, this.startPose.position, this.startPose.yawRad);
    this.previous = cloneVehicleState(this.current);
  }

  /**
   * M1C keeps the existing deterministic command, gear and telemetry model,
   * but replaces its predicted X/Z pose with Rapier's tire-force result after
   * each fixed step. `previous` intentionally remains the prior Rapier pose so
   * the renderer can interpolate without reading the physics world directly.
   */
  synchronizeFromExternalPose(pose: ExternalPlanarVehiclePose, dtSeconds: number): void {
    // 외부 물리 엔진이 제공하지 못하는 유한 dt도 120Hz 기본값으로 안전하게 보완한다.
    const safeDtSeconds = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 1 / 120;
    // 새 Rapier lateral speed로 횡가속도를 계산하려면 이전 스냅샷이 필요하다.
    const previousLateralSpeedMps = dot(this.previous.velocity, rightVector(this.previous.yawRad));

    // Rapier가 소유한 평면 위치·속도·방향을 기존 텔레메트리 상태로 복사한다.
    this.current.position = { ...pose.position };
    this.current.velocity = { ...pose.velocity };
    this.current.yawRad = pose.yawRad;
    this.current.yawRateRadS = pose.yawRateRadS;
    this.current.speedMps = Math.hypot(pose.velocity.x, pose.velocity.z);
    this.current.forwardSpeedMps = dot(
      pose.velocity,
      { x: Math.sin(pose.yawRad), z: -Math.cos(pose.yawRad) },
    );
    this.current.lateralSpeedMps = dot(pose.velocity, rightVector(pose.yawRad));
    this.current.lateralAccelerationMps2 = (
      this.current.lateralSpeedMps - previousLateralSpeedMps
    ) / safeDtSeconds;
    // 후륜 각속도가 전달된 경우에만 구동계 RPM 피드백을 교체한다.
    if (pose.drivenWheelAngularSpeedRadS !== undefined && Number.isFinite(pose.drivenWheelAngularSpeedRadS)) {
      this.current.drivenWheelAngularSpeedRadS = pose.drivenWheelAngularSpeedRadS;
    }
    this.current.surface = sampleTestTrackLocation(this.current.position, this.track).surface;
  }

  getRenderSnapshot(alpha: number): VehicleRenderSnapshot {
    // 렌더 보간 비율은 누적기 오류가 있어도 [0, 1]을 벗어나지 않게 한다.
    const blend = Math.max(0, Math.min(1, alpha));
    return {
      position: {
        x: this.previous.position.x + (this.current.position.x - this.previous.position.x) * blend,
        z: this.previous.position.z + (this.current.position.z - this.previous.position.z) * blend,
      },
      velocity: { ...this.current.velocity },
      yawRad: this.previous.yawRad + (this.current.yawRad - this.previous.yawRad) * blend,
      yawRateRadS: this.current.yawRateRadS,
      speedMps: this.current.speedMps,
      rpm: this.current.rpm,
      gear: this.current.gear,
      surface: this.current.surface,
    };
  }

  getTelemetry(): VehicleTelemetry {
    // 트랙 위치는 포즈를 소유하지 않는 조회 전용 데이터로만 계산한다.
    const trackLocation = sampleTestTrackLocation(this.current.position, this.track);

    return {
      speedKmh: this.current.speedMps * 3.6,
      rpm: this.current.rpm,
      redlineRpm: this.config.redlineRpm,
      gear: this.current.gear,
      throttle: this.current.throttle,
      brake: this.current.brake,
      steering: this.current.steeringInput,
      surface: this.current.surface,
      lateralG: this.current.lateralAccelerationMps2 / 9.81,
      downforceN: this.current.downforceN,
      dragForceN: this.current.dragForceN,
      engineForceN: this.current.engineForceN,
      engineTorqueNm: this.current.engineTorqueNm,
      driveTorqueNm: this.current.driveTorqueNm,
      engineBrakeTorqueNm: this.current.engineBrakeTorqueNm,
      wheelLoadsN: { ...this.current.wheelLoadsN },
      wheelCompressionM: { ...this.current.wheelCompressionM },
      trackSectionId: trackLocation.sectionId,
      trackSectionLabel: trackLocation.sectionLabel,
      onTrack: trackLocation.onTrack,
      distanceToBoundaryM: trackLocation.distanceToBoundaryM,
    };
  }
}
