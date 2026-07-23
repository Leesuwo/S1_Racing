/**
 * 장치별 입력 프리셋과 휠 축 캘리브레이션을 공통 입력 계약으로 변환하는
 * 순수 데이터·정규화 모듈이다.
 */
/** 사용자가 선택할 수 있는 입력 장치 식별자다. */
export type VehicleInputPresetId = "keyboard" | "mouse" | "gamepad" | "wheel";

/** UI에 표시할 입력 프리셋 설명 데이터다. */
export interface VehicleInputPresetDefinition {
  id: VehicleInputPresetId;
  label: string;
  description: string;
}

/** 지원 장치의 표시 순서와 사용자 안내 문구다. */
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

/** 하나의 입력 축을 장치 원시 범위에서 공통 범위로 보정하는 설정이다. */
export interface AxisCalibration {
  min: number;
  center: number;
  max: number;
  deadzone?: number;
  invert?: boolean;
}

/** 휠의 조향·가속·브레이크 세 축에 대한 캘리브레이션이다. */
export interface WheelInputCalibration {
  steering: AxisCalibration;
  throttle: AxisCalibration;
  brake: AxisCalibration;
}

/** 별도 설정이 없을 때 사용하는 일반적인 장치 축 범위다. */
export const DEFAULT_WHEEL_INPUT_CALIBRATION: WheelInputCalibration = {
  steering: { min: -1, center: 0, max: 1, deadzone: 0.05 },
  throttle: { min: -1, center: 0, max: 1 },
  brake: { min: -1, center: 0, max: 1 },
};

/** 캘리브레이션 계산 중간값을 요청된 범위로 제한한다. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 중심값이 있는 조향 축을 deadzone과 반전 옵션까지 반영해 [-1, 1]로 변환한다. */
export function normalizeCenteredAxis(value: number, calibration: AxisCalibration): number {
  // NaN은 중심값으로 대체해 연결 직후의 장치 미초기화 상태를 중립으로 만든다.
  const safeValue = Number.isFinite(value) ? value : calibration.center;
  // 양·음 방향의 비대칭 장치 범위를 각각 정규화하기 위한 최소 안전 분모다.
  const positiveRange = Math.max(1e-6, calibration.max - calibration.center);
  // 음의 조향 방향은 중심에서 min까지의 별도 원시 범위를 사용한다.
  const negativeRange = Math.max(1e-6, calibration.center - calibration.min);
  // 중심 기준으로 방향별 범위를 적용한다.
  const normalized = safeValue >= calibration.center
    ? (safeValue - calibration.center) / positiveRange
    : (safeValue - calibration.center) / negativeRange;
  // 작은 센서 떨림을 제거하되 95%보다 넓은 deadzone은 허용하지 않는다.
  const deadzone = clamp(calibration.deadzone ?? 0, 0, 0.95);
  // deadzone 판단을 위해 정규화 축의 절대 크기만 분리한다.
  const magnitude = Math.abs(normalized);
  // deadzone 바깥 구간을 다시 전체 범위로 확장한다.
  const withDeadzone = magnitude <= deadzone
    ? 0
    : Math.sign(normalized) * ((magnitude - deadzone) / (1 - deadzone));
  // deadzone 보정으로 범위를 벗어날 수 있으므로 최종 계약을 다시 적용한다.
  const result = clamp(withDeadzone, -1, 1);
  // 반전 축은 마지막에 처리해 모든 장치에서 동일한 deadzone 의미를 유지한다.
  return calibration.invert ? -result : result;
}

/** 페달 축을 이동 거리 기반의 [0, 1] 입력으로 변환한다. */
export function normalizePedalAxis(value: number, calibration: AxisCalibration): number {
  // min~max가 지나치게 작거나 역전된 장치도 0 나눗셈 없이 처리한다.
  const range = Math.max(1e-6, calibration.max - calibration.min);
  // 원시 축을 보정 범위에 먼저 자르고, 이후 공통 페달 범위로 변환한다.
  const normalized = clamp((Number.isFinite(value) ? value : calibration.min) - calibration.min, 0, range) / range;
  // 부동소수점 오차와 잘못된 장치 값을 최종 범위에서 제거한다.
  const result = clamp(normalized, 0, 1);
  return calibration.invert ? 1 - result : result;
}
