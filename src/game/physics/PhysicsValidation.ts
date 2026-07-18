import { calculateAeroForces } from "./AeroModel";
import {
  ASPHALT_SURFACE,
  createInitialVehicleState,
  DEFAULT_VEHICLE_CONFIG,
  stepVehicle,
  type VehiclePhysicsConfig,
} from "./VehiclePhysics";
import { neutralVehicleControlInput, type VehicleControlInput } from "../input/VehicleControlInput";

export interface PhysicsValidationMetric {
  id: string;
  value: number;
  passed: boolean;
  expectation: string;
}

export interface PhysicsValidationReport {
  passed: boolean;
  metrics: readonly PhysicsValidationMetric[];
}

function runSteps(
  state: ReturnType<typeof createInitialVehicleState>,
  input: VehicleControlInput,
  steps: number,
  config: VehiclePhysicsConfig,
): void {
  for (let step = 0; step < steps; step += 1) {
    stepVehicle(state, input, 1 / 120, config, ASPHALT_SURFACE);
  }
}

function allFinite(values: readonly number[]): boolean {
  return values.every(Number.isFinite);
}

export function runPhysicsValidation(
  config: VehiclePhysicsConfig = DEFAULT_VEHICLE_CONFIG,
): PhysicsValidationReport {
  const accelerationState = createInitialVehicleState();
  const throttleInput = { ...neutralVehicleControlInput(), throttle: 1 };
  runSteps(accelerationState, throttleInput, 480, config);

  const coastState = createInitialVehicleState();
  runSteps(coastState, throttleInput, 300, config);
  const coastSpeedBeforeMps = coastState.speedMps;
  const coastInput = { ...neutralVehicleControlInput(), clutch: 1 };
  runSteps(coastState, coastInput, 240, config);

  const lowSpeedAero = calculateAeroForces({ speedMps: 30 }, {
    downforceCoefficientNPerMps2: config.aeroDownforceCoefficient,
    dragCoefficientNPerMps2: config.dragCoefficient,
    frontBalance: config.aeroBalanceFront,
  });
  const highSpeedAero = calculateAeroForces({ speedMps: 60 }, {
    downforceCoefficientNPerMps2: config.aeroDownforceCoefficient,
    dragCoefficientNPerMps2: config.dragCoefficient,
    frontBalance: config.aeroBalanceFront,
  });
  const metrics: PhysicsValidationMetric[] = [
    {
      id: "straight-line-acceleration",
      value: accelerationState.speedMps,
      passed: accelerationState.speedMps > 20,
      expectation: "> 20 m/s after 4 s throttle",
    },
    {
      id: "coast-down",
      value: coastSpeedBeforeMps - coastState.speedMps,
      passed: coastSpeedBeforeMps > 10 && coastState.speedMps < coastSpeedBeforeMps,
      expectation: "speed decreases after clutch-in coast",
    },
    {
      id: "aero-speed-scaling",
      value: highSpeedAero.downforceN / Math.max(1, lowSpeedAero.downforceN),
      passed: highSpeedAero.downforceN > lowSpeedAero.downforceN * 3.9,
      expectation: "downforce scales approximately with speed squared",
    },
    {
      id: "finite-state",
      value: Number(allFinite([
        accelerationState.speedMps,
        accelerationState.rpm,
        accelerationState.engineForceN,
        accelerationState.downforceN,
        coastState.speedMps,
        coastState.rpm,
        highSpeedAero.dragForceN,
      ])),
      passed: allFinite([
        accelerationState.speedMps,
        accelerationState.rpm,
        accelerationState.engineForceN,
        accelerationState.downforceN,
        coastState.speedMps,
        coastState.rpm,
        highSpeedAero.dragForceN,
      ]),
      expectation: "all validation outputs remain finite",
    },
  ];

  return {
    passed: metrics.every((metric) => metric.passed),
    metrics,
  };
}
