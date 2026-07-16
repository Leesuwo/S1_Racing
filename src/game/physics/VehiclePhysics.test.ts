import { describe, expect, it } from "vitest";
import {
  ASPHALT_SURFACE,
  createInitialVehicleState,
  DEFAULT_VEHICLE_CONFIG,
  GRASS_SURFACE,
  stepVehicle,
} from "./VehiclePhysics";
import { neutralVehicleControlInput } from "../input/VehicleControlInput";

describe("VehiclePhysics", () => {
  it("accelerates under throttle and keeps the simulation finite", () => {
    const state = createInitialVehicleState();
    const input = { ...neutralVehicleControlInput(), throttle: 1 };

    for (let step = 0; step < 240; step += 1) {
      stepVehicle(state, input, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);
    }

    expect(state.speedMps).toBeGreaterThan(10);
    expect(Number.isFinite(state.position.x)).toBe(true);
    expect(Number.isFinite(state.position.z)).toBe(true);
    expect(Number.isFinite(state.rpm)).toBe(true);
  });

  it("reduces forward speed when braking after acceleration", () => {
    const state = createInitialVehicleState();
    const throttleInput = { ...neutralVehicleControlInput(), throttle: 1 };
    const brakeInput = { ...neutralVehicleControlInput(), brake: 1 };

    for (let step = 0; step < 180; step += 1) {
      stepVehicle(state, throttleInput, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);
    }
    const speedBeforeBrake = state.speedMps;

    for (let step = 0; step < 120; step += 1) {
      stepVehicle(state, brakeInput, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);
    }

    expect(speedBeforeBrake).toBeGreaterThan(5);
    expect(state.speedMps).toBeLessThan(speedBeforeBrake);
  });

  it("has less grip and more resistance on grass", () => {
    const asphaltState = createInitialVehicleState();
    const grassState = createInitialVehicleState();
    const input = { ...neutralVehicleControlInput(), throttle: 1, steering: 0.4 };

    for (let step = 0; step < 180; step += 1) {
      stepVehicle(asphaltState, input, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);
      stepVehicle(grassState, input, 1 / 120, DEFAULT_VEHICLE_CONFIG, GRASS_SURFACE);
    }

    expect(grassState.speedMps).toBeLessThan(asphaltState.speedMps);
  });

  it("exposes four-wheel loads and transfers load during braking", () => {
    const state = createInitialVehicleState();
    const throttleInput = { ...neutralVehicleControlInput(), throttle: 1 };
    const brakeInput = { ...neutralVehicleControlInput(), brake: 1 };

    for (let step = 0; step < 180; step += 1) {
      stepVehicle(state, throttleInput, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);
    }

    stepVehicle(state, brakeInput, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);

    const frontLoadN = state.wheelLoadsN.frontLeft + state.wheelLoadsN.frontRight;
    const rearLoadN = state.wheelLoadsN.rearLeft + state.wheelLoadsN.rearRight;

    expect(frontLoadN).toBeGreaterThan(rearLoadN);
    expect(Object.values(state.wheelLoadsN).every(Number.isFinite)).toBe(true);
    expect(Object.values(state.wheelCompressionM).every(Number.isFinite)).toBe(true);
  });
});
