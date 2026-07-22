import { calculateAeroForces } from "./AeroModel";
import {
  ASPHALT_SURFACE,
  createInitialVehicleState,
  DEFAULT_VEHICLE_CONFIG,
  stepVehicle,
  type VehiclePhysicsConfig,
} from "./VehiclePhysics";
import { neutralVehicleControlInput, type VehicleControlInput } from "../input/VehicleControlInput";

/** 한 물리 검증 게이트의 측정값·판정·사람이 읽을 기대 조건이다. */
export interface PhysicsValidationMetric {
  id: string;
  value: number;
  passed: boolean;
  expectation: string;
}

/** 순수 평면 물리의 결정성·공력·유한 상태를 한 번에 요약한 검증 보고서다. */
export interface PhysicsValidationReport {
  passed: boolean;
  metrics: readonly PhysicsValidationMetric[];
}

/** 120Hz 고정 dt로 동일 입력을 반복해 상태를 누적한다. 테스트와 검증 게이트가 공유한다. */
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

/** 모든 검증 출력이 NaN·Infinity 없이 물리 계층에 남아 있는지 확인한다. */
function allFinite(values: readonly number[]): boolean {
  return values.every(Number.isFinite);
}

/**
 * 4초 가속, 클러치 인 코스트다운, 속도 제곱 공력, 유한 상태를 빠르게 점검한다.
 * 각 threshold는 실차 인증값이 아니라 현재 프로토타입의 회귀 방지 게이트다.
 */
export function runPhysicsValidation(
  config: VehiclePhysicsConfig = DEFAULT_VEHICLE_CONFIG,
): PhysicsValidationReport {
  // 480 steps = 4초이며, 이후 모든 비교는 동일한 120Hz dt를 사용한다.
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
  // metric 배열은 CI가 개별 실패 원인을 출력할 수 있도록 계산과 판정을 함께 보관한다.
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
