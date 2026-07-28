/**
 * 타이어 컴파운드의 온도·마모·공기압 상태를 계산하는 순수 fixed-step 모델이다.
 * 힘 계산기와 분리해 차량 물리·레이스 전략·HUD가 같은 상태 스냅샷을 읽게 한다.
 * 모든 수치는 실제 타이어 규정값이 아닌 initial_assumption이다.
 */

/** 레이스에서 선택할 수 있는 타이어 컴파운드다. */
export type TyreCompound = "soft" | "medium" | "hard";

/** 컴파운드별 열화와 작동 온도 설정이다. 온도는 °C, 압력은 kPa다. */
export interface TyreCompoundConfig {
  gripMultiplier: number;
  optimalTemperatureC: number;
  minimumTemperatureC: number;
  maximumTemperatureC: number;
  wearRatePerSecond: number;
  initialPressureKPa: number;
}

/** UI·전략 검증에서 사용하는 고정 컴파운드 순서다. */
export const TYRE_COMPOUNDS: readonly TyreCompound[] = ["soft", "medium", "hard"];

/** M3B 초기 컴파운드 가정이다. 실차 데이터로 해석하지 않는다. */
export const TYRE_COMPOUND_CONFIG: Readonly<Record<TyreCompound, TyreCompoundConfig>> = {
  soft: {
    gripMultiplier: 1.08,
    optimalTemperatureC: 96,
    minimumTemperatureC: 72,
    maximumTemperatureC: 116,
    wearRatePerSecond: 0.00022,
    initialPressureKPa: 168,
  },
  medium: {
    gripMultiplier: 1,
    optimalTemperatureC: 90,
    minimumTemperatureC: 68,
    maximumTemperatureC: 112,
    wearRatePerSecond: 0.00016,
    initialPressureKPa: 170,
  },
  hard: {
    gripMultiplier: 0.94,
    optimalTemperatureC: 84,
    minimumTemperatureC: 64,
    maximumTemperatureC: 106,
    wearRatePerSecond: 0.00011,
    initialPressureKPa: 172,
  },
};

/** 차량의 네 휠을 고정된 순서로 식별한다. */
export type TyreWheelId = "frontLeft" | "frontRight" | "rearLeft" | "rearRight";

const TYRE_WHEEL_IDS: readonly TyreWheelId[] = [
  "frontLeft",
  "frontRight",
  "rearLeft",
  "rearRight",
];

/** 한 휠의 누적 상태다. */
export interface TyreWheelCondition {
  temperatureC: number;
  wearRatio: number;
  pressureKPa: number;
}

/** 차량 한 대의 타이어 상태 소유 구조다. */
export interface TyreConditionState {
  compound: TyreCompound;
  ambientTemperatureC: number;
  wheels: Record<TyreWheelId, TyreWheelCondition>;
}

/** 현재 차량 상태에서 열·마모·공기압을 갱신하는 입력이다. */
export interface TyreConditionInput {
  dtSeconds: number;
  speedMps: number;
  forwardSpeedMps: number;
  lateralSpeedMps: number;
  throttleInput: number;
  brakeInput: number;
  steeringInput: number;
  surfaceGripMultiplier: number;
}

/** HUD와 물리 계층에 전달하는 타이어 상태다. */
export interface TyreConditionSnapshot {
  compound: TyreCompound;
  averageTemperatureC: number;
  minimumTemperatureC: number;
  maximumTemperatureC: number;
  averageWearRatio: number;
  averagePressureKPa: number;
  gripMultiplier: number;
  overheating: boolean;
  underTemperature: boolean;
}

/** 값이 유한하지 않을 때 물리 모델의 안전한 기본값을 반환한다. */
function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** 입력값을 허용 범위로 제한해 온도·마모 상태가 발산하지 않게 한다. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** 초기 그리드에서 타이어를 차갑지만 주행 가능한 상태로 만든다. */
export function createInitialTyreCondition(
  compound: TyreCompound = "medium",
  ambientTemperatureC = 22,
): TyreConditionState {
  const config = TYRE_COMPOUND_CONFIG[compound];
  const safeAmbientTemperatureC = clamp(finiteOr(ambientTemperatureC, 22), -20, 50);
  const initialWheel = (): TyreWheelCondition => ({
    temperatureC: safeAmbientTemperatureC + 22,
    wearRatio: 0,
    pressureKPa: config.initialPressureKPa,
  });
  return {
    compound,
    ambientTemperatureC: safeAmbientTemperatureC,
    wheels: {
      frontLeft: initialWheel(),
      frontRight: initialWheel(),
      rearLeft: initialWheel(),
      rearRight: initialWheel(),
    },
  };
}

/** 피트에서 컴파운드를 교체할 때 마모·열·압력을 새 세트로 복원한다. */
export function changeTyre(
  state: TyreConditionState,
  compound: TyreCompound,
): TyreConditionState {
  return createInitialTyreCondition(compound, state.ambientTemperatureC);
}

/** 휠별 제동 배분과 횡미끄러짐 대리값으로 열화 스트레스를 계산한다. */
function calculateWheelStress(
  wheelId: TyreWheelId,
  input: TyreConditionInput,
): number {
  const safeForwardSpeedMps = Math.max(1, Math.abs(finiteOr(input.forwardSpeedMps, 0)));
  const slipProxy = Math.abs(finiteOr(input.lateralSpeedMps, 0)) / safeForwardSpeedMps;
  const brakeBias = wheelId.startsWith("front") ? 0.58 : 0.42;
  const brakeStress = clamp(finiteOr(input.brakeInput, 0), 0, 1) * brakeBias;
  const steeringStress = Math.abs(clamp(finiteOr(input.steeringInput, 0), -1, 1)) * 0.18;
  const throttleStress = clamp(finiteOr(input.throttleInput, 0), 0, 1) * 0.08;
  const speedStress = clamp(Math.abs(finiteOr(input.speedMps, 0)) / 70, 0, 1) * 0.05;
  return clamp(slipProxy * 0.9 + brakeStress * 0.42 + steeringStress + throttleStress + speedStress, 0, 2.5);
}

/** 한 fixed step에서 네 휠의 온도·마모·공기압을 갱신한다. */
export function stepTyreCondition(
  state: TyreConditionState,
  input: TyreConditionInput,
): TyreConditionState {
  const config = TYRE_COMPOUND_CONFIG[state.compound];
  const safeDtSeconds = Number.isFinite(input.dtSeconds) && input.dtSeconds > 0
    ? Math.min(input.dtSeconds, 0.1)
    : 1 / 120;
  const surfaceGripMultiplier = clamp(finiteOr(input.surfaceGripMultiplier, 1), 0, 3);
  const nextWheels = {} as Record<TyreWheelId, TyreWheelCondition>;

  TYRE_WHEEL_IDS.forEach((wheelId) => {
    const current = state.wheels[wheelId];
    const stress = calculateWheelStress(wheelId, input);
    const heatGenerationCPerSecond = (stress * 90 + Math.abs(finiteOr(input.speedMps, 0)) * 0.08)
      * surfaceGripMultiplier;
    const coolingRatePerSecond = 0.18 + Math.abs(finiteOr(input.speedMps, 0)) * 0.006;
    const ambientDeltaC = current.temperatureC - state.ambientTemperatureC;
    const temperatureC = clamp(
      current.temperatureC
        + (heatGenerationCPerSecond - ambientDeltaC * coolingRatePerSecond) * safeDtSeconds,
      state.ambientTemperatureC,
      180,
    );
    const overheatRatio = clamp(
      (temperatureC - config.maximumTemperatureC) / 35,
      0,
      2,
    );
    const wearRatio = clamp(
      current.wearRatio
        + config.wearRatePerSecond * (0.3 + stress) * (1 + overheatRatio) * safeDtSeconds,
      0,
      1,
    );
    const targetPressureKPa = config.initialPressureKPa
      + Math.max(0, temperatureC - state.ambientTemperatureC) * 0.16;
    const pressureKPa = current.pressureKPa
      + (targetPressureKPa - current.pressureKPa) * clamp(safeDtSeconds * 0.7, 0, 1);

    nextWheels[wheelId] = {
      temperatureC,
      wearRatio,
      pressureKPa,
    };
  });

  return {
    ...state,
    wheels: nextWheels,
  };
}

/** 평균 온도·마모·공기압으로 현재 타이어가 제공할 그립 배율을 계산한다. */
export function getTyreConditionSnapshot(
  state: TyreConditionState,
): TyreConditionSnapshot {
  const config = TYRE_COMPOUND_CONFIG[state.compound];
  const wheels = TYRE_WHEEL_IDS.map((wheelId) => state.wheels[wheelId]);
  const temperatures = wheels.map((wheel) => finiteOr(wheel.temperatureC, state.ambientTemperatureC));
  const wears = wheels.map((wheel) => clamp(finiteOr(wheel.wearRatio, 0), 0, 1));
  const pressures = wheels.map((wheel) => Math.max(0, finiteOr(wheel.pressureKPa, config.initialPressureKPa)));
  const averageTemperatureC = temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length;
  const averageWearRatio = wears.reduce((sum, value) => sum + value, 0) / wears.length;
  const averagePressureKPa = pressures.reduce((sum, value) => sum + value, 0) / pressures.length;
  const temperatureDistance = Math.abs(averageTemperatureC - config.optimalTemperatureC);
  const temperatureFactor = clamp(1 - temperatureDistance / 75, 0.55, 1);
  const pressureDistance = Math.abs(averagePressureKPa - (config.initialPressureKPa + 11));
  const pressureFactor = clamp(1 - pressureDistance / 125, 0.82, 1);
  const wearFactor = 1 - averageWearRatio * 0.42;

  return {
    compound: state.compound,
    averageTemperatureC,
    minimumTemperatureC: Math.min(...temperatures),
    maximumTemperatureC: Math.max(...temperatures),
    averageWearRatio,
    averagePressureKPa,
    gripMultiplier: clamp(config.gripMultiplier * temperatureFactor * pressureFactor * wearFactor, 0.35, 1.2),
    overheating: temperatures.some((temperatureC) => temperatureC > config.maximumTemperatureC),
    underTemperature: temperatures.some((temperatureC) => temperatureC < config.minimumTemperatureC),
  };
}
