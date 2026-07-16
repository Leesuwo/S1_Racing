# Input Spec

## 공통 경계

모든 입력 장치는 다음 인터페이스로 변환한다.

```ts
interface VehicleControlInput {
  steering: number;
  throttle: number;
  brake: number;
  clutch: number;
  shiftUp: boolean;
  shiftDown: boolean;
  overtakeMode: boolean;
  activeAero: boolean;
}
```

`steering`, `throttle`, `brake`, `clutch`의 유효 범위는 `[-1, 1]`이며, 가속·브레이크는 이후 입력 계층에서 `[0, 1]`로 제한한다.

## 예정 프리셋

- Mouse Steering: 마우스 좌우 누적 조향, 좌클릭 업시프트, 우클릭 다운시프트, W/S 가속·브레이크
- Keyboard: A/D 조향, W/S 가속·브레이크, Q/E 변속
- Gamepad: 스틱·트리거·범퍼
- Wheel: 축 캘리브레이션 기반 best-effort 지원

## Milestone 0

입력 이벤트를 차량에 연결하지 않는다. 물리 계층이 UI나 브라우저 이벤트를 직접 import하지 않도록 타입 경계만 고정한다.
