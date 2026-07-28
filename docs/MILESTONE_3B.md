# Milestone 3B — Tyre thermal, wear and pressure

## 목표

시작 컴파운드와 차량의 고정 스텝 주행 상태를 타이어 온도·마모·공기압과 연결하고, 물리·전략·HUD가 동일한 읽기 전용 타이어 스냅샷을 사용하도록 한다.

## 구현 범위

- `TyreCondition` 순수 모델: soft·medium·hard별 initial_assumption 그립·온도·마모·압력 설정
- 네 휠의 온도(°C), 마모 비율(0..1), 압력(kPa) 고정 스텝 갱신
- `VehicleSimulation`의 노면 그립에 타이어 상태 그립 배율을 연결
- Race Weekend 시작 컴파운드와 피트 교체 전략 연결
- 주행 HUD와 Race Weekend HUD의 컴파운드·온도·마모·압력 표시

## 합격 기준

- 동일 입력·동일 초기 상태에서 타이어 상태가 결정적으로 재현된다.
- 열 스트레스가 온도·마모·압력을 증가시키고, 과열·마모가 그립 배율을 제한한다.
- 피트 컴파운드 교체가 새 세트 상태로 복원된다.
- AI와 플레이어가 같은 `VehicleSimulation`·`VehicleControlInput` 경계를 사용한다.

## 제외 범위

실차 타이어 데이터 보정, 열전달 해석, 타이어별 독립 접촉 패치와 생산 차량 검증은 포함하지 않는다. 모든 설정은 `initial_assumption`이며 `simulation_required`로 관리한다.

## 검증

`TyreCondition.test.ts`, `VehicleSimulation` 회귀 테스트, Race Weekend E2E와 전체 `npm run verify`로 검증한다.
