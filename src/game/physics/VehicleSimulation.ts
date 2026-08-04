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
import { zeroWheelValues, type WheelValues } from "./Suspension";
import {
  sampleTestTrackLocation,
  TEST_TRACK_DATA,
  type TestTrackStartPose,
  type TestTrackDefinition,
} from "../../tracks/TestTrack";
import {
  changeTyre,
  createInitialTyreCondition,
  getTyreConditionSnapshot,
  stepTyreCondition,
  type TyreCompound,
  type TyreConditionState,
  type TyreConditionSnapshot,
} from "./TyreCondition";
import {
  DEFAULT_VEHICLE_SETUP,
  getVehicleSetup,
  type VehicleSetup,
  type VehicleSetupPresetId,
} from "./VehicleSetup";

/** 렌더러가 보간해 표시할 차량 평면 상태의 읽기 전용 스냅샷이다. */
export interface VehicleRenderSnapshot {
  position: { x: number; z: number };
  velocity: { x: number; z: number };
  yawRad: number;
  yawRateRadS: number;
  /** 현재 입력과 차량 설정으로 계산한 앞축 시각 조향각(rad)이다. 물리 포즈를 변경하지 않는다. */
  steeringAngleRad: number;
  /** 각 바퀴의 누적 시각 회전량(rad)이다. 차량 포즈와 분리된 렌더링 상태다. */
  wheelSpinRad: WheelValues;
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
  tyreCondition: TyreConditionSnapshot;
}

/** 외부 Rapier 포즈를 기존 차량 상태로 전달하는 평면 물리 경계다. */
export interface ExternalPlanarVehiclePose {
  position: { x: number; z: number };
  velocity: { x: number; z: number };
  yawRad: number;
  yawRateRadS: number;
  drivenWheelAngularSpeedRadS?: number;
  /** Rapier가 계산한 바퀴별 각속도(rad/s)이며 시각 회전 보정에만 사용한다. */
  wheelAngularSpeedRadS?: Partial<WheelValues>;
}

/** 차량의 네 바퀴를 고정 순서로 순회해 좌우 회전 상태를 동일하게 갱신한다. */
const WHEEL_POSITIONS: readonly (keyof WheelValues)[] = [
  "frontLeft",
  "frontRight",
  "rearLeft",
  "rearRight",
];

/** 누적 회전량이 장시간 주행에서 불필요하게 커지지 않도록 시각 각도를 정규화한다. */
function wrapAngleRad(angleRad: number): number {
  return Math.atan2(Math.sin(angleRad), Math.cos(angleRad));
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
  /** 타이어 열화 상태는 차량 물리와 함께 fixed-step으로 갱신한다. */
  private tyreCondition: TyreConditionState;
  /** 레이스 주말이 선택한 제한형 셋업이며 AI와 플레이어에 같은 물리 경계를 적용한다. */
  private vehicleSetup: VehicleSetup = { ...DEFAULT_VEHICLE_SETUP };
  /** 손상으로 인한 그립 저하는 레이스 세션이 설정하는 읽기 전용 배율이다. */
  private damagePerformanceMultiplier = 1;
  /** 각 바퀴의 화면 회전량이며 물리 위치·속도와 별도로 렌더러에 전달한다. */
  private wheelSpinRad = zeroWheelValues();
  /** Rapier 각속도로 대체하기 전 fixed step의 fallback 회전량을 보관한다. */
  private lastFallbackWheelSpinDeltaRad = zeroWheelValues();

  constructor(
    config: VehiclePhysicsConfig = DEFAULT_VEHICLE_CONFIG,
    track: TestTrackDefinition = TEST_TRACK_DATA,
    startPose: TestTrackStartPose = track.startPose,
    tyreCompound: TyreCompound = "medium",
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
    this.tyreCondition = createInitialTyreCondition(tyreCompound);
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
    // 셋업은 입력·그립 배율만 조정하며 차량 위치나 힘을 외부에서 직접 쓰지 않는다.
    const setupInput: VehicleControlInput = {
      ...input,
      throttle: Math.max(0, Math.min(1, input.throttle * this.vehicleSetup.enginePowerMultiplier)),
      brake: Math.max(0, Math.min(1, input.brake * this.vehicleSetup.brakePressureMultiplier)),
    };
    // 실제 슬립각을 별도 타이어 힘 계산기에서 재사용하지 않고, 현재 차량 축 속도와 입력으로
    // 열화 스트레스를 추정해 물리 계층을 순수 상태로 유지한다.
    this.tyreCondition = stepTyreCondition(this.tyreCondition, {
      dtSeconds: dt,
      speedMps: this.current.speedMps,
      forwardSpeedMps: this.current.forwardSpeedMps,
      lateralSpeedMps: this.current.lateralSpeedMps,
      throttleInput: setupInput.throttle,
      brakeInput: setupInput.brake,
      steeringInput: input.steering,
      surfaceGripMultiplier: surface.gripMultiplier,
    });
    const tyreCondition = getTyreConditionSnapshot(this.tyreCondition);
    stepVehicle(this.current, setupInput, dt, this.config, {
      ...surface,
      gripMultiplier: surface.gripMultiplier
        * tyreCondition.gripMultiplier
        * this.damagePerformanceMultiplier
        * this.vehicleSetup.aeroGripMultiplier,
    });
    // Rapier가 없는 AI 교육·순수 단위 테스트에서도 속도에 비례한 바퀴 회전을 제공한다.
    this.advanceFallbackWheelSpin(dt);
  }

  reset(): void {
    // AI 차량은 플레이어와 다른 그리드 포즈를 사용할 수 있으므로 track.startPose를 다시 읽지 않는다.
    resetVehicleState(this.current, this.startPose.position, this.startPose.yawRad);
    this.previous = cloneVehicleState(this.current);
    this.tyreCondition = createInitialTyreCondition(this.tyreCondition.compound);
    this.damagePerformanceMultiplier = 1;
    this.wheelSpinRad = zeroWheelValues();
    this.lastFallbackWheelSpinDeltaRad = zeroWheelValues();
  }

  /** 레이스 시작 전 선택한 프리셋을 복사해 이후 UI 객체 변경과 물리 상태를 분리한다. */
  setVehicleSetup(id: VehicleSetupPresetId): void {
    this.vehicleSetup = getVehicleSetup(id);
  }

  /** 현재 물리 입력에 반영 중인 셋업의 읽기 전용 복사본이다. */
  getVehicleSetup(): VehicleSetup {
    return { ...this.vehicleSetup };
  }

  /** 피트 정지나 전략 전환에서 타이어 세트를 새 컴파운드로 교체한다. */
  changeTyre(compound: TyreCompound): void {
    this.tyreCondition = changeTyre(this.tyreCondition, compound);
  }

  /** 레이스 세션이 접촉 손상에 따른 그립 저하를 물리 입력에 반영한다. */
  setDamagePerformanceMultiplier(multiplier: number): void {
    this.damagePerformanceMultiplier = Number.isFinite(multiplier)
      ? Math.max(0.35, Math.min(1, multiplier))
      : 1;
  }

  /** 타이어 모델의 내부 객체가 아닌 복사된 현재 상태를 반환한다. */
  getTyreCondition(): TyreConditionSnapshot {
    return { ...getTyreConditionSnapshot(this.tyreCondition) };
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
    // 한 fixed step에서 먼저 계산한 속도 fallback을 제거하고, Rapier 바퀴 각속도를 우선 반영한다.
    // 이렇게 해야 AI·플레이어의 화면 회전이 실제 접지 슬립과 같은 시간축을 사용한다.
    if (pose.wheelAngularSpeedRadS) {
      for (const id of WHEEL_POSITIONS) {
        const fallbackDeltaRad = this.lastFallbackWheelSpinDeltaRad[id];
        const externalAngularSpeedRadS = pose.wheelAngularSpeedRadS[id];
        this.wheelSpinRad[id] = wrapAngleRad(this.wheelSpinRad[id] - fallbackDeltaRad);
        if (externalAngularSpeedRadS !== undefined && Number.isFinite(externalAngularSpeedRadS)) {
          // 차량 전방이 -Z이므로 Three.js X축 회전은 물리 각속도의 반대 부호로 표시한다.
          this.wheelSpinRad[id] = wrapAngleRad(
            this.wheelSpinRad[id] - externalAngularSpeedRadS * safeDtSeconds,
          );
        } else {
          this.wheelSpinRad[id] = wrapAngleRad(this.wheelSpinRad[id] + fallbackDeltaRad);
        }
        this.lastFallbackWheelSpinDeltaRad[id] = 0;
      }
    }
    // 후륜 각속도가 전달된 경우에만 구동계 RPM 피드백을 교체한다.
    if (pose.drivenWheelAngularSpeedRadS !== undefined && Number.isFinite(pose.drivenWheelAngularSpeedRadS)) {
      this.current.drivenWheelAngularSpeedRadS = pose.drivenWheelAngularSpeedRadS;
    }
    this.current.surface = sampleTestTrackLocation(this.current.position, this.track).surface;
  }

  /**
   * M3A 접촉 해결기가 계산한 위치·속도 응답을 차량 물리 경계에 적용한다.
   * AI나 렌더러가 호출하지 않으며, 접촉 침투를 분리한 뒤에도 기어·RPM·입력 소유권은 유지한다.
   */
  applyContactResolution(response: Pick<ExternalPlanarVehiclePose, "position" | "velocity">): void {
    this.synchronizeFromExternalPose({
      position: response.position,
      velocity: response.velocity,
      yawRad: this.current.yawRad,
      yawRateRadS: this.current.yawRateRadS,
    }, 1 / 120);
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
      // 앞축 표시 방향은 같은 차량 설정의 최대 조향각을 사용해 물리 입력과 시각 모델을 일치시킨다.
      steeringAngleRad: this.current.steeringInput * this.config.maxSteeringAngleRad,
      wheelSpinRad: { ...this.wheelSpinRad },
      speedMps: this.current.speedMps,
      rpm: this.current.rpm,
      gear: this.current.gear,
      surface: this.current.surface,
    };
  }

  /** 순수 평면 물리에서 속도 기반 fallback 휠 회전을 fixed step마다 누적한다. */
  private advanceFallbackWheelSpin(dtSeconds: number): void {
    const safeDtSeconds = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 1 / 120;
    const fallbackAngularSpeedRadS = this.current.forwardSpeedMps / Math.max(this.config.wheelRadiusM, 0.01);

    for (const id of WHEEL_POSITIONS) {
      const deltaRad = -fallbackAngularSpeedRadS * safeDtSeconds;
      this.wheelSpinRad[id] = wrapAngleRad(this.wheelSpinRad[id] + deltaRad);
      this.lastFallbackWheelSpinDeltaRad[id] = deltaRad;
    }
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
      tyreCondition: this.getTyreCondition(),
    };
  }
}
