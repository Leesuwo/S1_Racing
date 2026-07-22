export type VehicleInputPresetId = "keyboard" | "mouse" | "gamepad" | "wheel";

export interface VehicleInputPresetDefinition {
  id: VehicleInputPresetId;
  label: string;
  description: string;
}

export const VEHICLE_INPUT_PRESETS: readonly VehicleInputPresetDefinition[] = [
  {
    id: "keyboard",
    label: "Keyboard",
    description: "A/D 조향, W/S 가속·브레이크, Q/E 변속",
  },
  {
    id: "mouse",
    label: "Mouse Steering",
    description: "Pointer Lock 좌우 조향, 클릭 변속, W/S 페달",
  },
  {
    id: "gamepad",
    label: "Gamepad",
    description: "왼쪽 스틱·트리거·범퍼",
  },
  {
    id: "wheel",
    label: "Wheel",
    description: "축 캘리브레이션 기반 best-effort 입력",
  },
];

export interface AxisCalibration {
  min: number;
  center: number;
  max: number;
  deadzone?: number;
  invert?: boolean;
}

export interface WheelInputCalibration {
  steering: AxisCalibration;
  throttle: AxisCalibration;
  brake: AxisCalibration;
}

export const DEFAULT_WHEEL_INPUT_CALIBRATION: WheelInputCalibration = {
  steering: { min: -1, center: 0, max: 1, deadzone: 0.05 },
  throttle: { min: -1, center: 0, max: 1 },
  brake: { min: -1, center: 0, max: 1 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeCenteredAxis(value: number, calibration: AxisCalibration): number {
  const safeValue = Number.isFinite(value) ? value : calibration.center;
  const positiveRange = Math.max(1e-6, calibration.max - calibration.center);
  const negativeRange = Math.max(1e-6, calibration.center - calibration.min);
  const normalized = safeValue >= calibration.center
    ? (safeValue - calibration.center) / positiveRange
    : (safeValue - calibration.center) / negativeRange;
  const deadzone = clamp(calibration.deadzone ?? 0, 0, 0.95);
  const magnitude = Math.abs(normalized);
  const withDeadzone = magnitude <= deadzone
    ? 0
    : Math.sign(normalized) * ((magnitude - deadzone) / (1 - deadzone));
  const result = clamp(withDeadzone, -1, 1);
  return calibration.invert ? -result : result;
}

export function normalizePedalAxis(value: number, calibration: AxisCalibration): number {
  const range = Math.max(1e-6, calibration.max - calibration.min);
  const normalized = clamp((Number.isFinite(value) ? value : calibration.min) - calibration.min, 0, range) / range;
  const result = clamp(normalized, 0, 1);
  return calibration.invert ? 1 - result : result;
}
