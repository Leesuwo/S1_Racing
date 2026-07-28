/**
 * M3B 타이어 열·마모·공기압의 온도창, 열화, 컴파운드 교체와 결정성을 검증한다.
 * 실제 타이어 데이터가 아니라 fixed-step 상태 불변식과 주행 피드백 경계를 검사한다.
 */
import { describe, expect, it } from "vitest";
import {
  changeTyre,
  createInitialTyreCondition,
  getTyreConditionSnapshot,
  stepTyreCondition,
} from "./TyreCondition";

describe("TyreCondition", () => {
  it("heats under sustained braking and lateral stress, then reduces grip when overheated", () => {
    let state = createInitialTyreCondition("soft");
    const initial = getTyreConditionSnapshot(state);
    for (let step = 0; step < 3_600; step += 1) {
      state = stepTyreCondition(state, {
        dtSeconds: 1 / 120,
        speedMps: 80,
        forwardSpeedMps: 70,
        lateralSpeedMps: 18,
        throttleInput: 1,
        brakeInput: 0.8,
        steeringInput: 1,
        surfaceGripMultiplier: 1,
      });
    }
    const stressed = getTyreConditionSnapshot(state);

    expect(stressed.averageTemperatureC).toBeGreaterThan(initial.averageTemperatureC);
    expect(stressed.averagePressureKPa).toBeGreaterThan(initial.averagePressureKPa);
    expect(stressed.averageWearRatio).toBeGreaterThan(0);
    expect(stressed.overheating).toBe(true);
    expect(stressed.gripMultiplier).toBeLessThan(1.08);
  });

  it("preserves finite bounds while cooling and changing to a new compound", () => {
    let state = createInitialTyreCondition("medium");
    for (let step = 0; step < 600; step += 1) {
      state = stepTyreCondition(state, {
        dtSeconds: 1 / 120,
        speedMps: 0,
        forwardSpeedMps: 0,
        lateralSpeedMps: 0,
        throttleInput: 0,
        brakeInput: 0,
        steeringInput: 0,
        surfaceGripMultiplier: 1,
      });
    }
    const changed = changeTyre(state, "hard");
    const snapshot = getTyreConditionSnapshot(changed);

    expect(snapshot.compound).toBe("hard");
    expect(snapshot.averageWearRatio).toBe(0);
    expect(snapshot.averageTemperatureC).toBeCloseTo(44, 5);
    expect(snapshot.averagePressureKPa).toBe(172);
    expect(Number.isFinite(snapshot.gripMultiplier)).toBe(true);
  });

  it("replays the same fixed-step inputs deterministically", () => {
    const input = {
      dtSeconds: 1 / 120,
      speedMps: 45,
      forwardSpeedMps: 44,
      lateralSpeedMps: 2,
      throttleInput: 0.6,
      brakeInput: 0,
      steeringInput: 0.2,
      surfaceGripMultiplier: 1,
    };
    let first = createInitialTyreCondition("hard");
    let second = createInitialTyreCondition("hard");
    for (let step = 0; step < 300; step += 1) {
      first = stepTyreCondition(first, input);
      second = stepTyreCondition(second, input);
    }

    expect(getTyreConditionSnapshot(first)).toEqual(getTyreConditionSnapshot(second));
  });
});
