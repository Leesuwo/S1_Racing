/**
 * M8 연료량·소모·피트 재급유의 순수 상태 경계다.
 * 차량 질량 변화와 실제 엔진 맵을 추측하지 않고, 연료가 0일 때 구동을 차단하는
 * 운영 규칙과 replay 가능한 질량 단위 상태만 RaceSession에 제공한다.
 */
import type { VehicleControlInput } from "../../game/input/VehicleControlInput";

/** 레이스 시작과 피트 서비스에 공유하는 연료 계획이다. 단위는 kg, kg/s다. */
export interface RaceFuelPlan {
  /** 그리드에서 적재하는 연료량(kg)이다. */
  startFuelKg: number;
  /** 피트 서비스에서 추가하는 연료량(kg)이다. */
  pitRefuelKg: number;
  /** 풀스로틀 1초당 최대 연료 소모량(kg/s)인 initial_assumption이다. */
  fullThrottleConsumptionKgPerSecond: number;
}

/** HUD·결정성 digest에 노출하는 읽기 전용 연료 상태다. */
export interface RaceFuelSnapshot {
  startFuelKg: number;
  remainingFuelKg: number;
  consumedFuelKg: number;
  refuelledFuelKg: number;
  engineLimited: boolean;
}

/** 레이스 참가자 한 대가 소유하는 변경 가능한 연료 상태다. */
export interface RaceFuelState extends RaceFuelSnapshot {}

/** 45초 프로토타입 레이스에서 전략을 관찰할 수 있도록 잡은 기본 연료 계획이다. */
export const DEFAULT_RACE_FUEL_PLAN: RaceFuelPlan = {
  startFuelKg: 5,
  pitRefuelKg: 1.5,
  fullThrottleConsumptionKgPerSecond: 0.04,
};

/** 유한한 범위로 연료 계획을 정규화해 잘못된 UI 입력이 물리 루프를 오염시키지 않게 한다. */
export function normalizeRaceFuelPlan(plan: RaceFuelPlan = DEFAULT_RACE_FUEL_PLAN): RaceFuelPlan {
  return {
    startFuelKg: Number.isFinite(plan.startFuelKg) ? Math.max(0.25, Math.min(20, plan.startFuelKg)) : DEFAULT_RACE_FUEL_PLAN.startFuelKg,
    pitRefuelKg: Number.isFinite(plan.pitRefuelKg) ? Math.max(0, Math.min(10, plan.pitRefuelKg)) : DEFAULT_RACE_FUEL_PLAN.pitRefuelKg,
    fullThrottleConsumptionKgPerSecond: Number.isFinite(plan.fullThrottleConsumptionKgPerSecond)
      ? Math.max(0.001, Math.min(0.2, plan.fullThrottleConsumptionKgPerSecond))
      : DEFAULT_RACE_FUEL_PLAN.fullThrottleConsumptionKgPerSecond,
  };
}

/** 새 그리드에서 사용하는 독립 연료 상태를 만든다. */
export function createRaceFuelState(plan: RaceFuelPlan = DEFAULT_RACE_FUEL_PLAN): RaceFuelState {
  const normalized = normalizeRaceFuelPlan(plan);
  return {
    startFuelKg: normalized.startFuelKg,
    remainingFuelKg: normalized.startFuelKg,
    consumedFuelKg: 0,
    refuelledFuelKg: 0,
    engineLimited: false,
  };
}

/** 연료가 모두 소진된 뒤에도 조향·제동은 보존하고 구동 명령만 차단한다. */
export function limitInputForFuel(input: VehicleControlInput, state: RaceFuelState): VehicleControlInput {
  if (state.remainingFuelKg > 0) return { ...input };
  return { ...input, throttle: 0, overtakeMode: false, activeAero: false };
}

/** 한 fixed-step의 스로틀 사용량을 반영한 새 연료 상태를 반환한다. */
export function stepRaceFuel(
  state: RaceFuelState,
  plan: RaceFuelPlan,
  throttle: number,
  dtSeconds: number,
): RaceFuelState {
  const normalized = normalizeRaceFuelPlan(plan);
  const safeDt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 1 / 120;
  const throttleRatio = Number.isFinite(throttle) ? Math.max(0, Math.min(1, throttle)) : 0;
  // 공회전 소모를 아주 작게 남겨, 장시간 저스로틀 주행도 replay에서 동일하게 누적되게 한다.
  const requestedKg = normalized.fullThrottleConsumptionKgPerSecond * (0.08 + throttleRatio * 0.92) * safeDt;
  const consumedKg = Math.min(Math.max(0, state.remainingFuelKg), requestedKg);
  // 120Hz 누적 오차로 0에 매우 가까운 양이 남으면 구동 제한 시점이 실행마다 달라질 수 있다.
  // 따라서 1 ng 이하를 연료 소진으로 정규화해 replay의 입력 경계를 일정하게 유지한다.
  const unconstrainedRemainingFuelKg = Math.max(0, state.remainingFuelKg - consumedKg);
  const remainingFuelKg = unconstrainedRemainingFuelKg <= 1e-9 ? 0 : unconstrainedRemainingFuelKg;
  return {
    ...state,
    remainingFuelKg,
    consumedFuelKg: state.consumedFuelKg + consumedKg,
    engineLimited: remainingFuelKg <= 0,
  };
}

/** 피트 서비스 완료 시 계획된 연료를 더하고 20 kg 안전 상한을 유지한다. */
export function refuelRaceFuel(state: RaceFuelState, plan: RaceFuelPlan): RaceFuelState {
  const normalized = normalizeRaceFuelPlan(plan);
  const addedFuelKg = Math.min(20 - state.remainingFuelKg, normalized.pitRefuelKg);
  return {
    ...state,
    remainingFuelKg: Math.max(0, state.remainingFuelKg + addedFuelKg),
    refuelledFuelKg: state.refuelledFuelKg + addedFuelKg,
    engineLimited: state.remainingFuelKg + addedFuelKg <= 0,
  };
}

/** 외부 상태 공유를 막기 위한 연료 스냅샷 복사본을 만든다. */
export function getRaceFuelSnapshot(state: RaceFuelState): RaceFuelSnapshot {
  return { ...state };
}
