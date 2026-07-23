/** 공통 VehicleControlInput의 중립값과 아날로그 범위를 검증한다. */
import { describe, expect, it } from "vitest";
import { clampAnalogInput, neutralVehicleControlInput } from "./VehicleControlInput";

describe("VehicleControlInput", () => {
  // 중립 입력은 변속·오버테이크·공력 같은 숨은 제어를 모두 비활성화해야 한다.
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

  // 직접 입력되는 아날로그 값도 물리 경계의 [-1, 1] 계약을 지켜야 한다.
  it("clamps analog input to the contract range", () => {
    expect(clampAnalogInput(-2)).toBe(-1);
    expect(clampAnalogInput(0.25)).toBe(0.25);
    expect(clampAnalogInput(2)).toBe(1);
  });
});
