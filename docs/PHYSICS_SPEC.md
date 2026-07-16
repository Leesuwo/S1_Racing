# Physics Spec

## 역할 분리

Rapier는 향후 차체 강체·트랙 충돌·벽 충돌을 담당한다. 차량의 타이어 힘, 서스펜션, 하중 이동, 공력, 파워트레인은 순수 TypeScript 물리 계층에서 계산한다.

## 목표 신호 흐름

```text
VehicleControlInput
→ powertrain
→ wheel kinematics
→ suspension load
→ tire forces
→ aero forces
→ chassis integration
→ Rapier step
→ render snapshot
```

## 시간 규칙

- 목표 물리 주기: 120Hz
- 렌더링 주기: 브라우저 주사율
- 렌더링은 이전·현재 물리 상태를 보간
- 프레임 델타는 최대 0.1초로 제한
- 한 프레임 최대 보정 스텝은 4회

## 현재 상태

`Physics Prototype v0.1`에서 단순화된 평면 차량 물리 계산을 구현했다. `src/game/physics/VehiclePhysics.ts`는 순수 TypeScript로 엔진 구동력, 브레이크, 슬립각 기반 횡력, 결합 그립, 다운포스, 항력을 계산한다.

현재 프로토타입은 실제 F1 차량을 재현하지 않으며, 검증 가능한 주행 감각을 확보하기 위한 `initial_assumption`이다. Rapier 차체 충돌과 4개 휠 레이캐스트 서스펜션은 다음 단계에서 추가한다.

검증 우선순위는 고정 스텝 → 차체 안정성 → 휠 운동학 → 서스펜션 → 타이어 힘 → 구동계 → 공력 순서다.
