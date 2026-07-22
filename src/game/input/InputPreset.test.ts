import { describe, expect, it } from "vitest";
import {
  DEFAULT_WHEEL_INPUT_CALIBRATION,
  normalizeCenteredAxis,
  normalizePedalAxis,
} from "./InputPreset";

describe("InputPreset calibration", () => {
  it("normalizes a centered steering axis with a deadzone", () => {
    const calibration = DEFAULT_WHEEL_INPUT_CALIBRATION.steering;

    expect(normalizeCenteredAxis(0.02, calibration)).toBe(0);
    expect(normalizeCenteredAxis(1, calibration)).toBe(1);
    expect(normalizeCenteredAxis(-1, calibration)).toBe(-1);
  });

  it("normalizes wheel pedal travel to the shared [0, 1] contract", () => {
    const calibration = DEFAULT_WHEEL_INPUT_CALIBRATION.throttle;

    expect(normalizePedalAxis(-1, calibration)).toBe(0);
    expect(normalizePedalAxis(0, calibration)).toBe(0.5);
    expect(normalizePedalAxis(1, calibration)).toBe(1);
  });
});
