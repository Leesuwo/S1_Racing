/**
 * 플레이어와 이후 AI가 물리 계층에 전달하는 유일한 차량 조작 경계다.
 * `steering`은 -1..1, 페달·클러치는 0..1이며, 변속 플래그는 한 샘플에서
 * 소비되는 상승 에지다. 물리 계층은 브라우저 이벤트나 장치별 축 배치를 알지 않는다.
 */
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

/** 장치 입력이 없거나 일시정지·포커스 해제 직후에 사용할 안전한 중립 입력이다. */
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

/** 아날로그 조작값을 물리 경계의 유효 범위로 제한한다. */
export function clampAnalogInput(value: number): number {
  return Math.max(-1, Math.min(1, value));
}
