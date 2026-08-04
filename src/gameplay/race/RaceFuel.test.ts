/** M8 연료 소비·구동 제한·재급유가 고정 입력에서 재현되는지 검증한다. */
import { describe, expect, it } from "vitest";
import { neutralVehicleControlInput } from "../../game/input/VehicleControlInput";
import { createRaceFuelState, limitInputForFuel, refuelRaceFuel, stepRaceFuel } from "./RaceFuel";

describe("RaceFuel", () => {
  /** 연료가 소진되면 제동·조향을 보존한 채 구동 관련 명령만 제한해야 한다. */
  it("consumes fuel deterministically and limits only propulsion at empty fuel", () => {
    const plan = { startFuelKg: 0.25, pitRefuelKg: 1.5, fullThrottleConsumptionKgPerSecond: 0.2 };
    let fuel = createRaceFuelState(plan);
    for (let step = 0; step < 300; step += 1) fuel = stepRaceFuel(fuel, plan, 1, 1 / 120);
    const limited = limitInputForFuel({ ...neutralVehicleControlInput(), steering: 0.4, brake: 0.3, throttle: 1, activeAero: true }, fuel);

    expect(fuel.remainingFuelKg).toBe(0);
    expect(fuel.engineLimited).toBe(true);
    expect(limited).toMatchObject({ steering: 0.4, brake: 0.3, throttle: 0, activeAero: false });
  });

  /** 피트 연료는 누적량과 안전 상한을 모두 공개 상태로 보존해야 한다. */
  it("adds the configured pit fuel without exceeding the safety limit", () => {
    const plan = { startFuelKg: 19.5, pitRefuelKg: 3, fullThrottleConsumptionKgPerSecond: 0.04 };
    const refuelled = refuelRaceFuel(createRaceFuelState(plan), plan);

    expect(refuelled.remainingFuelKg).toBe(20);
    expect(refuelled.refuelledFuelKg).toBe(0.5);
  });
});
