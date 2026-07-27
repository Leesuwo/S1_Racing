# Milestone 3A — Track limits and contact model

## 상태

완료 기준: 2026-07-27
검증 상태: npm run verify 통과 — 타입 검사, 단위 테스트 85건, 아키텍처 검증, 프로덕션 빌드, 브라우저 E2E 15건.

## 목표

M2B~M2D의 다차량 레이스 흐름에 트랙 이탈·랩 유효성·패널티와 차량 접촉의 최소 물리 경계를 추가한다. 플레이어와 AI의 위치를 세션이나 렌더러가 직접 덮어쓰지 않고, 기존 VehicleControlInput·VehicleSimulation·120Hz fixed-step 계약을 유지한다.

## 구현 범위

- TestTrackDefinition에 화면과 Rapier가 공유하는 정적 벽·연석 선분을 추가했다.
- TrackLimitsMonitor가 동일한 sampleTestTrackLocation()을 읽어 도로 이탈, 랩 무효화, 이벤트 1회 패널티, 누적 이탈 시간과 경계 거리를 계산한다.
- 트랙 리밋 패널티는 완주 시각에 더해 완주 차량의 최종 분류 순서에 반영한다.
- VehicleContact가 두 차량의 원형 평면 근사로 침투 분리와 반발 임펄스를 계산한다. 이 계산기는 AI 제어와 분리되어 있다.
- RaceSession이 차량별 트랙 리밋 상태와 차량 접촉 횟수를 스냅샷으로 제공하고, 랩 전환 시 랩별 상태를 새로 시작한다.
- RapierChassisSuspension이 선택적으로 트랙 벽·연석 고정 collider를 만들고 마지막 step의 접촉 수를 텔레메트리로 노출한다.
- 주행 HUD와 Race Weekend 패널에 트랙 리밋·벽·연석·차량 접촉 상태를 표시한다.

## 설계 경계

정적 벽·연석은 TestTrackDefinition에 있을 때만 Rapier에 생성되며, 기존의 일반 평면 Rapier 단위 테스트는 트랙 없이 생성해 회귀 기준을 보존한다. Race Weekend의 다차량 접촉은 현재 2D 원형 근사이며 Rapier world 안에서 모든 차량을 함께 적분하는 모델이 아니다. 차체 형상·회전 관성·손상·추월·방어·충돌 회피는 M3A의 완료 조건에 포함하지 않는다.

패널티 수치와 벽·연석 치수는 실차 규정값이 아닌 initial_assumption이다. 실제 차량과 대회 규정의 재현으로 표현하지 않으며, 수치 조정은 결정 문서와 시뮬레이션 검증을 함께 갱신해야 한다.

## 검증

- TrackLimits.test.ts: 경계 이탈, 랩 무효화, 동일 이탈 이벤트의 중복 방지, 다음 랩 초기화, 리셋을 검증한다.
- VehicleContact.test.ts: 겹침 분리, 접근 속도 반전, 입력 순서와 비접촉 보존을 검증한다.
- RapierChassisSuspension.test.ts: 트랙 벽 접촉과 wall telemetry를 검증하고, 기존 지면·서스펜션·타이어 회귀를 유지한다.
- RaceSession.test.ts: 트랙 리밋 스냅샷과 접촉 카운터가 기존 결정성·순위·리셋 경계에 함께 존재하는지 검증한다.
- tests/e2e/smoke.spec.ts: 주행 모드 HUD와 Race Weekend M3A 상태 표시를 검증한다.

## 다음 단일 마일스톤

M3B — 타이어 열·마모·공기압 모델. M3A의 접촉·트랙 리밋 상태와 독립적으로, 타이어 힘 모델에 열·마모·압력 상태를 연결하고 동일한 120Hz 검증 게이트를 유지한다.
