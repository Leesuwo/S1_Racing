# Milestone 3D — Damage, flags and pit physics

## 목표

M3A 접촉 이벤트를 차량 운영 상태에 연결하고, 손상에 따른 성능 저하·플래그·피트 서비스 시간을 RaceSession의 120Hz 상태 전이에 포함한다.

## 구현 범위

- `RaceOperations` 순수 상태 모듈
- 접촉 속도·침투량 기반 차체·에어로·서스펜션 손상 누적
- 손상 성능 배율과 임계치 퇴역 상태
- green·yellow·blue·red·checkered 플래그 스냅샷
- 전략 랩에서 피트 서비스 상태·남은 시간·완료 횟수 관리
- 서비스 중인 차량의 주행 입력 보류와 타이어 교체 적용
- 트랙 이탈·정지 상태가 지속될 때 퇴역 처리해 레이스 결과로 수렴하는 방어 경계
- Race Weekend HUD의 플래그·손상·피트 상태 표시

## 합격 기준

- 동일 접촉 입력의 손상·성능 배율·퇴역 결과가 결정적으로 재현된다.
- 피트 서비스 중 차량은 이동하지 않고 fixed-step 시간만 진행한다.
- 접촉 시 황색기, 퇴역 시 적색기, 종료 시 체커 플래그가 스냅샷에 표시된다.
- 손상 성능 배율은 `VehicleSimulation`의 물리 그립에만 반영되며 위치를 직접 보정하지 않는다.

## 제외 범위

Rapier world 안의 차량별 차체 형상·회전 충돌, 실제 피트 레인 메시·속도 제한, FIA 규정 전체와 시각적 파괴 모델은 1차 완성 이후 범위다. 손상량과 피트 2.5초는 `initial_assumption`이다.

## 검증

`RaceOperations.test.ts`, `RaceSession.test.ts`, Race Weekend HUD E2E와 전체 `npm run verify`로 검증한다.
