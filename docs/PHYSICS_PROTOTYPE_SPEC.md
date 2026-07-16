# Physics Prototype v0.1

## 목적

브라우저에서 차량을 직접 운전하며 고정 스텝, 입력 반응, 표면 그립, 공력 저항, 기본 횡력 모델을 검증하는 첫 번째 세로 절단(vertical slice)이다.

## 포함 범위

- 순수 TypeScript 차량 물리
- Three.js 좌표계: +X 오른쪽, +Y 위, -Z 전방
- 120Hz 고정 스텝과 최대 4회 프레임 보정
- 780kg 초기 가정 차량
- 후륜 구동과 8단 기어
- 토크 곡선 기반 엔진 구동력
- 앞·뒤 타이어의 단순 슬립각 기반 횡력
- 결합 그립 제한(friction circle)
- 속도 제곱 기반 다운포스·항력
- 아스팔트와 잔디의 그립·저항 차이
- 키보드 W/S/A/D와 Pointer Lock 마우스 조향
- 좌클릭 업시프트·우클릭 다운시프트
- 테스트 트랙과 추적 카메라
- 속도·RPM·기어·G값·다운포스 텔레메트리

## 구현 경계

```text
BrowserVehicleInput
→ VehicleControlInput
→ FixedTimestepAccumulator
→ VehicleSimulation
→ VehiclePhysics
→ VehicleRenderSnapshot
→ R3F Canvas
```

`VehiclePhysics.ts`, `TrackSurface.ts`, `VehicleSimulation.ts`는 React, R3F, Zustand, DOM을 import하지 않는다. 브라우저 이벤트는 `BrowserVehicleInput.ts`에서만 처리한다.

## 현재 수치의 상태

현재 물리 계수는 실제 특정 차량의 공식 데이터가 아니라 `initial_assumption`이다. 다음 항목은 아직 `simulation_required`다.

- 실제 무게중심과 관성 모멘트
- 타이어 온도·마모·압력
- 실제 타이어 Magic Formula 계수
- 서스펜션·안티롤바
- Rapier 차체·트랙 충돌
- 차량 손상과 공력 부품 손실

## 조작

| 입력 | 기능 |
|---|---|
| W / ↑ | 가속 |
| S / ↓ | 브레이크 |
| A / D / ← / → | 키보드 조향 |
| Pointer Lock 마우스 좌우 | 누적형 조향 |
| 좌클릭 / E | 업시프트 |
| 우클릭 / Q | 다운시프트 |
| R | 차량 리셋 |
| Shift | 액티브 에어로 입력 계약 |
| Ctrl | 오버테이크 입력 계약 |

## 합격 기준

- 정지 상태에서 W 입력으로 차량이 가속한다.
- 브레이크 입력으로 주행 속도가 감소한다.
- 조향 입력으로 yaw와 횡가속도가 발생한다.
- 잔디에서 아스팔트보다 속도와 그립이 낮아진다.
- 120Hz 물리 계산이 렌더링 주사율과 독립적으로 실행된다.
- 차량 상태에 NaN·Infinity가 발생하지 않는다.
- HUD에서 속도·RPM·기어·표면 상태를 확인할 수 있다.

## 다음 확장

1. 자동 물리 검증 코스와 기대 범위
2. 차체 강체 및 4개 휠 레이캐스트 서스펜션
3. 휠 운동학과 하중 이동
4. 타이어 온도·마모·노면 진화
5. Rapier 충돌과 트랙 리밋
