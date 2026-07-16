import type { VehicleControlInput } from "../input/VehicleControlInput";
import { sampleTestTrackSurface } from "./TrackSurface";
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
  engineForceN: number;
  wheelLoadsN: WheelValues;
  wheelCompressionM: WheelValues;
}

export interface ExternalPlanarVehiclePose {
  position: { x: number; z: number };
  velocity: { x: number; z: number };
  yawRad: number;
  yawRateRadS: number;
}

function dot(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return a.x * b.x + a.z * b.z;
}

function rightVector(yawRad: number): { x: number; z: number } {
  return { x: Math.cos(yawRad), z: Math.sin(yawRad) };
}

export class VehicleSimulation {
  readonly config: VehiclePhysicsConfig;
  readonly current: VehicleState;
  private previous: VehicleState;

  constructor(config: VehiclePhysicsConfig = DEFAULT_VEHICLE_CONFIG) {
    this.config = config;
    this.current = createInitialVehicleState();
    this.previous = cloneVehicleState(this.current);
  }

  step(input: VehicleControlInput, dt: number): void {
    this.previous = cloneVehicleState(this.current);

    if (input.shiftUp) {
      shiftGear(this.current, 1, this.config.gearRatios.length);
    }
    if (input.shiftDown) {
      shiftGear(this.current, -1, this.config.gearRatios.length);
    }

    const surface = sampleTestTrackSurface(this.current.position);
    stepVehicle(this.current, input, dt, this.config, surface);
  }

  reset(): void {
    resetVehicleState(this.current);
    this.previous = cloneVehicleState(this.current);
  }

  /**
   * M1C keeps the existing deterministic command, gear and telemetry model,
   * but replaces its predicted X/Z pose with Rapier's tire-force result after
   * each fixed step. `previous` intentionally remains the prior Rapier pose so
   * the renderer can interpolate without reading the physics world directly.
   */
  synchronizeFromExternalPose(pose: ExternalPlanarVehiclePose, dtSeconds: number): void {
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
    this.current.surface = sampleTestTrackSurface(this.current.position).type;
  }

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

  getTelemetry(): VehicleTelemetry {
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
      engineForceN: this.current.engineForceN,
      wheelLoadsN: { ...this.current.wheelLoadsN },
      wheelCompressionM: { ...this.current.wheelCompressionM },
    };
  }
}
