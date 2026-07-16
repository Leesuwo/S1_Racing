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

## Physics Prototype v0.1

`src/game/input/BrowserVehicleInput.ts`가 브라우저 이벤트를 수집하고 모든 입력을 `VehicleControlInput`으로 변환한다. 물리 계층은 이 파일이나 DOM을 import하지 않는다.

### 현재 구현

- W/S 또는 방향키: 가속·브레이크
- A/D 또는 방향키: 키보드 조향
- Pointer Lock 마우스 좌우 이동: 누적형 조향
- 좌클릭 또는 E: 업시프트
- 우클릭 또는 Q: 다운시프트
- R: 차량 리셋
- Shift/Ctrl: 액티브 에어로·오버테이크 입력 계약

### 입력 안전 규칙

- 마우스 우클릭의 브라우저 컨텍스트 메뉴를 차단한다.
- Pointer Lock이 해제되면 마우스 누적량을 버리고 조향을 중앙으로 복귀시킨다.
- 탭이 숨겨지면 App이 주행을 일시정지한다.
- 키보드 이벤트는 Window와 Document에서 모두 수신하고 `event.code`가 없는 환경에서는 `event.key`를 정규화한다.
- `BrowserVehicleInput`은 `connect()`와 `dispose()`를 멱등적으로 제공해 React 개발 모드의 StrictMode effect 재실행 후에도 입력 리스너를 복구한다.
- 창 포커스 손실 또는 숨김 탭 전환 시 눌린 키·누적 조향·예약된 변속 입력을 초기화해 키가 붙는 현상을 방지한다.
