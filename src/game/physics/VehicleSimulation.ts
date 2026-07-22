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
  type TestTrackDefinition,
} from "../../tracks/TestTrack";

/** 렌더러가 물리 스냅샷에서 읽을 수 있는 보간 상태다. 위치·속도 단위는 각각 m, m/s다. */
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

/** HUD에 필요한 저주기 차량·트랙 상태다. 힘은 N, 토크는 N·m, 각도는 radian이다. */
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

/** Rapier 등 외부 물리 소유자가 평면 차량 상태를 다시 주입하는 경계다. */
export interface ExternalPlanarVehiclePose {
  position: { x: number; z: number };
  velocity: { x: number; z: number };
  yawRad: number;
  yawRateRadS: number;
  drivenWheelAngularSpeedRadS?: number;
}

/** X/Z 벡터를 차량 local 축에 투영한다. */
function dot(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return a.x * b.x + a.z * b.z;
}

/** 물리 yaw 기준의 우측 단위 벡터를 반환한다. */
function rightVector(yawRad: number): { x: number; z: number } {
  return { x: Math.cos(yawRad), z: Math.sin(yawRad) };
}

/**
 * 순수 평면 명령 모델과 외부 Rapier pose를 연결하는 차량 시뮬레이션 파사드다.
 * `previous`는 렌더 보간 전용으로 보존하고, 외부 pose 동기화 후에도 현재 상태의
 * 기어·RPM·텔레메트리 계약을 유지한다.
 */
export class VehicleSimulation {
  readonly config: VehiclePhysicsConfig;
  readonly current: VehicleState;
  readonly track: TestTrackDefinition;
  private previous: VehicleState;

  constructor(
    config: VehiclePhysicsConfig = DEFAULT_VEHICLE_CONFIG,
    track: TestTrackDefinition = TEST_TRACK_DATA,
  ) {
    this.config = config;
    this.track = track;
    this.current = createInitialVehicleState(track.startPose.position, track.startPose.yawRad);
    this.previous = cloneVehicleState(this.current);
  }

  /** 입력 에지를 기어에 적용한 뒤 현재 노면에서 한 고정 스텝을 진행한다. */
  step(input: VehicleControlInput, dt: number): void {
    this.previous = cloneVehicleState(this.current);

    if (input.shiftUp) {
      shiftGear(this.current, 1, this.config.gearRatios.length);
    }
    if (input.shiftDown) {
      shiftGear(this.current, -1, this.config.gearRatios.length);
    }

    const surface = sampleTrackSurface(this.current.position, this.track);
    stepVehicle(this.current, input, dt, this.config, surface);
  }

  /** 트랙 시작 pose와 초기 기어·RPM으로 현재·이전 스냅샷을 함께 되돌린다. */
  reset(): void {
    resetVehicleState(this.current, this.track.startPose.position, this.track.startPose.yawRad);
    this.previous = cloneVehicleState(this.current);
  }

  /**
   * M1C keeps the existing deterministic command, gear and telemetry model,
   * but replaces its predicted X/Z pose with Rapier's tire-force result after
   * each fixed step. `previous` intentionally remains the prior Rapier pose so
   * the renderer can interpolate without reading the physics world directly.
   */
  synchronizeFromExternalPose(pose: ExternalPlanarVehiclePose, dtSeconds: number): void {
    // 이전 Rapier pose와의 차이를 사용해 렌더·HUD에 필요한 횡가속도를 근사한다.
    const safeDtSeconds = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 1 / 120;
    const previousLateralSpeedMps = dot(this.previous.velocity, rightVector(this.previous.yawRad));

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
    if (pose.drivenWheelAngularSpeedRadS !== undefined && Number.isFinite(pose.drivenWheelAngularSpeedRadS)) {
      this.current.drivenWheelAngularSpeedRadS = pose.drivenWheelAngularSpeedRadS;
    }
    this.current.surface = sampleTestTrackLocation(this.current.position, this.track).surface;
  }

  /** 이전/현재 상태를 alpha로 보간해 렌더러에 제공한다. 물리 계층은 직접 노출하지 않는다. */
  getRenderSnapshot(alpha: number): VehicleRenderSnapshot {
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

  /** 현재 상태와 트랙 위치를 UI 계약으로 복사해 반환한다. 반환 객체는 호출자가 변형해도 안전하다. */
  getTelemetry(): VehicleTelemetry {
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
