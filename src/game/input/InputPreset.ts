/** 브라우저 입력 장치의 사용자 선택 가능한 프리셋 식별자다. */
export type VehicleInputPresetId = "keyboard" | "mouse" | "gamepad" | "wheel";

/** UI에 표시할 입력 프리셋 설명과 물리 경계에서 사용할 식별자를 묶는다. */
export interface VehicleInputPresetDefinition {
  id: VehicleInputPresetId;
  label: string;
  description: string;
}

/** 프리셋 순서는 설정 UI에 그대로 노출되며, 장치별 이벤트 처리는 별도 입력 어댑터가 소유한다. */
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

/** 한 축의 장치 원시 범위와 보정 방향을 표현한다. 값의 단위는 장치 축값이다. */
export interface AxisCalibration {
  min: number;
  center: number;
  max: number;
  deadzone?: number;
  invert?: boolean;
}

/** 휠 프리셋이 조향·가속·브레이크 축을 정규화할 때 사용하는 보정 묶음이다. */
export interface WheelInputCalibration {
  steering: AxisCalibration;
  throttle: AxisCalibration;
  brake: AxisCalibration;
}

/**
 * 대부분의 표준 Gamepad 축을 가정한 초기값이다. 특정 휠 장치의 실제 축 배치가
 * 확인된 값은 아니므로 `initial_assumption`이며, 장치별 설정에서 덮어쓸 수 있다.
 */
export const DEFAULT_WHEEL_INPUT_CALIBRATION: WheelInputCalibration = {
  steering: { min: -1, center: 0, max: 1, deadzone: 0.05 },
  throttle: { min: -1, center: 0, max: 1 },
  brake: { min: -1, center: 0, max: 1 },
};

/** 정규화 결과가 물리 경계의 -1..1 범위를 벗어나지 않도록 제한한다. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 중심축을 -1..1로 변환하고 중심 주변 deadzone과 반전 옵션을 적용한다.
 * 비유한 원시값은 중심으로 취급해 장치 오류가 차량에 직접 전달되지 않게 한다.
 */
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

/** 페달 축의 min..max 범위를 0..1로 변환하고 필요하면 입력 방향을 반전한다. */
export function normalizePedalAxis(value: number, calibration: AxisCalibration): number {
  const range = Math.max(1e-6, calibration.max - calibration.min);
  const normalized = clamp((Number.isFinite(value) ? value : calibration.min) - calibration.min, 0, range) / range;
  const result = clamp(normalized, 0, 1);
  return calibration.invert ? 1 - result : result;
}
