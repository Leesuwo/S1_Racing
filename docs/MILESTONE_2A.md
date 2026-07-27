# Milestone 2A — Single AI opponent

## 상태

완료 — 2026-07-27

## 목표

M2A-0에서 평가·적용한 단일 AI 설정을 플레이어 주행 모드에 연결하고, AI가 플레이어와 같은 입력·물리 경계를 통과하는지 검증한다.

## 구현 범위

- `TrainingRunner`의 현재 AI 설정을 주행 모드의 `SingleOpponentAI` 생성자에 전달
- AI와 플레이어가 동일한 `VehicleControlInput` 입력 구조와 120Hz `FixedTimestepAccumulator`를 사용
- 두 차량이 각각 `VehicleSimulation`과 Rapier 접지 리그를 소유하되 동일한 `stepSimulationWithRig` 순서를 사용
- AI 차량 렌더 스냅샷과 텔레메트리를 플레이어 HUD와 분리해 표시
- 목표 속도·레이싱 라인·브레이크 지점·변속·차체 슬립 복구를 단위 테스트로 보존

## 제외 범위

그리드 스폰, 여러 차량의 순위·충돌, 추월·방어, 퀄리파잉, 레이스 운영은 M2B 이후 범위다. AI는 위치·속도·그립을 직접 변경하지 않는다.

## 검증

- `npm run verify`
- 단위 테스트 70개: AI 입력 결정성, 목표 속도·브레이크 미리보기, 물리 경계와 유한 상태
- 브라우저 E2E 10개: Training Lab·단일 AI 주행 모드·AI 텔레메트리·플레이어 입력 반응

모든 차량·AI 튜닝 수치는 실차 재현값이 아닌 `initial_assumption`이며 주행감은 `simulation_required` 기준이다.

## 다음 마일스톤

M2B — Multi-car race session: 여러 차량의 스폰·그리드·기본 순위·세션 리셋을 고정 스텝 비용과 함께 추가한다.
