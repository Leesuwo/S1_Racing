/**
 * 차량 물리의 결정성·가속·관성주행·공력 스케일·유한값을 빠르게 점검하는
 * 명세형 검증 모듈이다. 실제 차량 튜닝 검증이 아니라 프로토타입 안전 게이트다.
 */
import { calculateAeroForces } from "./AeroModel";
import {
  ASPHALT_SURFACE,
  createInitialVehicleState,
  DEFAULT_VEHICLE_CONFIG,
  stepVehicle,
  type VehiclePhysicsConfig,
} from "./VehiclePhysics";
import { neutralVehicleControlInput, type VehicleControlInput } from "../input/VehicleControlInput";

/** 단일 물리 검증 항목의 측정값과 통과 기준이다. */
export interface PhysicsValidationMetric {
  id: string;
  value: number;
  passed: boolean;
  expectation: string;
}

/** 전체 검증 결과와 항목별 결과를 함께 제공한다. */
export interface PhysicsValidationReport {
  passed: boolean;
  metrics: readonly PhysicsValidationMetric[];
}

/** 주어진 입력을 120Hz로 반복 적용해 상태를 재현한다. */
function runSteps(
  state: ReturnType<typeof createInitialVehicleState>,
  input: VehicleControlInput,
  steps: number,
  config: VehiclePhysicsConfig,
): void {
  // 고정 스텝 수를 직접 사용해 렌더러 프레임률과 무관한 검증을 만든다.
  for (let step = 0; step < steps; step += 1) {
    stepVehicle(state, input, 1 / 120, config, ASPHALT_SURFACE);
  }
}

/** 보고서에 넣을 수치가 모두 유한한지 확인한다. */
function allFinite(values: readonly number[]): boolean {
  return values.every(Number.isFinite);
}

/** 기본 주행 시나리오를 실행하고 수치 기반 통과 여부를 반환한다. */
export function runPhysicsValidation(
  config: VehiclePhysicsConfig = DEFAULT_VEHICLE_CONFIG,
): PhysicsValidationReport {
  // 4초 전개 가속 시나리오는 구동계와 타이어 힘의 연결을 확인한다.
  const accelerationState = createInitialVehicleState();
  // full throttle 입력은 모든 다른 입력을 중립으로 유지한 경계 픽스처다.
  const throttleInput = { ...neutralVehicleControlInput(), throttle: 1 };
  runSteps(accelerationState, throttleInput, 480, config);

  // 클러치 입력 후 속도가 감소하는 관성주행 시나리오다.
  const coastState = createInitialVehicleState();
  runSteps(coastState, throttleInput, 300, config);
  const coastSpeedBeforeMps = coastState.speedMps;
  // 클러치를 완전히 분리해 엔진 브레이크가 관성주행을 방해하지 않게 한다.
  const coastInput = { ...neutralVehicleControlInput(), clutch: 1 };
  runSteps(coastState, coastInput, 240, config);

  // 30 m/s와 60 m/s를 비교해 속도 제곱 공력 법칙을 확인한다.
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
  // 각 항목은 사람이 읽을 기대값과 자동 판정값을 함께 기록한다.
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
