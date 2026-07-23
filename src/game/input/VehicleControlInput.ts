/**
 * 키보드·마우스·게임패드·휠·AI가 물리 계층으로 넘기는 공통 입력 계약이다.
 * 모든 입력 소스는 이 경계에서 같은 범위와 의미로 정규화되어야 한다.
 */
/** 물리 시뮬레이션이 소비하는 프레임 입력 값이다. 아날로그 값은 지정 범위를 따른다. */
export interface VehicleControlInput {
  steering: number;
  throttle: number;
  brake: number;
  clutch: number;
  shiftUp: boolean;
  shiftDown: boolean;
  overtakeMode: boolean;
  activeAero: boolean;
}

/** 조작이 없는 한 틱을 표현하는 새 입력 객체를 생성한다. */
export const neutralVehicleControlInput = (): VehicleControlInput => ({
  steering: 0,
  throttle: 0,
  brake: 0,
  clutch: 0,
  shiftUp: false,
  shiftDown: false,
  overtakeMode: false,
  activeAero: false,
});

/** 조향처럼 [-1, 1]을 계약으로 사용하는 아날로그 입력을 안전하게 제한한다. */
export function clampAnalogInput(value: number): number {
  // 장치 노이즈나 잘못된 대역값이 물리 계층까지 전파되지 않게 한다.
  return Math.max(-1, Math.min(1, value));
}
