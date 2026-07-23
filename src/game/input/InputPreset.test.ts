/** 장치 축 캘리브레이션이 공통 입력 계약으로 정규화되는지 검증한다. */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WHEEL_INPUT_CALIBRATION,
  normalizeCenteredAxis,
  normalizePedalAxis,
} from "./InputPreset";

describe("InputPreset calibration", () => {
  // 조향 중심 deadzone과 양끝점이 [-1, 1]로 매핑되어야 한다.
  it("normalizes a centered steering axis with a deadzone", () => {
    // 기본 휠 캘리브레이션은 중심 조향 축의 대표 장치 픽스처다.
    const calibration = DEFAULT_WHEEL_INPUT_CALIBRATION.steering;

    expect(normalizeCenteredAxis(0.02, calibration)).toBe(0);
    expect(normalizeCenteredAxis(1, calibration)).toBe(1);
    expect(normalizeCenteredAxis(-1, calibration)).toBe(-1);
  });

  // 페달 축은 원시 장치 범위와 무관하게 [0, 1]을 사용해야 한다.
  it("normalizes wheel pedal travel to the shared [0, 1] contract", () => {
    const calibration = DEFAULT_WHEEL_INPUT_CALIBRATION.throttle;

    expect(normalizePedalAxis(-1, calibration)).toBe(0);
    expect(normalizePedalAxis(0, calibration)).toBe(0.5);
    expect(normalizePedalAxis(1, calibration)).toBe(1);
  });
});
