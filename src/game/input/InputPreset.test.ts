import { describe, expect, it } from "vitest";
import {
  DEFAULT_WHEEL_INPUT_CALIBRATION,
  normalizeCenteredAxis,
  normalizePedalAxis,
} from "./InputPreset";

// 휠 원시 축을 공통 VehicleControlInput 범위로 변환하는 순수 보정 계약 테스트다.
describe("InputPreset calibration", () => {
  it("normalizes a centered steering axis with a deadzone", () => {
    // deadzone 안의 노이즈는 0, 양끝은 정확히 -1..1이어야 한다.
    const calibration = DEFAULT_WHEEL_INPUT_CALIBRATION.steering;

    expect(normalizeCenteredAxis(0.02, calibration)).toBe(0);
    expect(normalizeCenteredAxis(1, calibration)).toBe(1);
    expect(normalizeCenteredAxis(-1, calibration)).toBe(-1);
  });

  it("normalizes wheel pedal travel to the shared [0, 1] contract", () => {
    // 페달은 중심 기준이 아니라 원시 min..max 전체 이동량을 0..1로 매핑한다.
    const calibration = DEFAULT_WHEEL_INPUT_CALIBRATION.throttle;

    expect(normalizePedalAxis(-1, calibration)).toBe(0);
    expect(normalizePedalAxis(0, calibration)).toBe(0.5);
    expect(normalizePedalAxis(1, calibration)).toBe(1);
  });
});
