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

## 입력 프리셋

- Mouse Steering: 마우스 좌우 누적 조향, 좌클릭 업시프트, 우클릭 다운시프트, W/S 가속·브레이크
- Keyboard: A/D 조향, W/S 가속·브레이크, Q/E 변속
- Gamepad: 표준 왼쪽 스틱·LT/RT 트리거·LB/RB 변속
- Wheel: 장치 ID·비표준 매핑 best-effort 탐색, 조향·페달 축 캘리브레이션

UI의 `입력 프리셋` 선택은 런타임에 입력 상태를 초기화한 뒤 새 프리셋을 적용한다. 게임패드·휠이 연결되지 않으면 키보드 페달을 폴백으로 사용한다.

휠 캘리브레이션은 `min`, `center`, `max`, 선택적 `deadzone`·`invert`로 정의한다. 조향은 `[-1, 1]`, 페달은 `[0, 1]`로 정규화한다. 제조사 SDK나 영구 설정 저장은 범위에 포함하지 않는다.

## Physics Prototype v0.1

`src/game/input/BrowserVehicleInput.ts`가 브라우저 이벤트와 Gamepad API를 수집하고 모든 입력을 `VehicleControlInput`으로 변환한다. 물리 계층은 이 파일이나 DOM/Gamepad API를 import하지 않는다.

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
- 게임패드 변속은 버튼 상승 에지에서만 한 번 예약해 고정 스텝마다 중복 변속하지 않는다.
- `requestReset()`은 UI와 `R` 키가 공유하는 일회성 리셋 요청을 만든다.
- 창 포커스 손실 또는 숨김 탭 전환 시 눌린 키·누적 조향·예약된 변속 입력을 초기화해 키가 붙는 현상을 방지한다.
