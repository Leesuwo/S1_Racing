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

Milestone 0에서는 계산을 구현하지 않는다. `src/game/loop/FixedTimestep.ts`는 시간 누적 규칙만 검증한다.

검증 우선순위는 고정 스텝 → 차체 안정성 → 휠 운동학 → 서스펜션 → 타이어 힘 → 구동계 → 공력 순서다.
