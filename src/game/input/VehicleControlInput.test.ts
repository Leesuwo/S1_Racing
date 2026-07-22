import { describe, expect, it } from "vitest";
import { clampAnalogInput, neutralVehicleControlInput } from "./VehicleControlInput";

// 장치 어댑터가 물리 계층에 전달하기 전 지켜야 하는 중립 상태와 범위 계약이다.
describe("VehicleControlInput", () => {
  it("creates a neutral input without hidden controls", () => {
    expect(neutralVehicleControlInput()).toEqual({
      steering: 0,
      throttle: 0,
      brake: 0,
      clutch: 0,
      shiftUp: false,
      shiftDown: false,
      overtakeMode: false,
      activeAero: false,
    });
  });

  it("clamps analog input to the contract range", () => {
    expect(clampAnalogInput(-2)).toBe(-1);
    expect(clampAnalogInput(0.25)).toBe(0.25);
    expect(clampAnalogInput(2)).toBe(1);
  });
});
