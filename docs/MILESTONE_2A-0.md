# Milestone 2A-0 — AI Training Circuit & Evaluator

## 상태

완료 — 2026-07-27

## 목표

단일 AI를 레이스 세션에 연결하기 전에 독창 교육 트랙에서 동일한 `VehicleSimulation`과 `VehicleControlInput` 경계를 사용하는 120Hz 결정적 에피소드 평가와 제한된 설정 탐색을 제공한다.

## 구현 범위

- Northfield GP 중심선·도로 폭·곡률·노면·섹터·체크포인트·레이싱 라인·목표 속도·제동점
- 직선 가속·강제동·고속 복합·저속 탈출·전체 랩 교육 시나리오
- 횡오차·목표 속도 오차·제동 초과·트랙 이탈·입력 채터링·차체 슬립·결정성 해시 지표
- 14개 이하의 고정 후보 설정 탐색과 개선 후보의 다음 에피소드 자동 적용
- Training Lab 추적 카메라·레이싱 라인·BRAKE/APEX/target 마커·읽기 전용 HUD
- `s1-racing.ai-training-result` schema v1 JSON 저장

## 저장 문서 계약

결과 파일은 완료 에피소드의 스냅샷과 기준·최고·후보 평가를 함께 보존한다. 평가 설정과 지표는 수치 단위·트랙명·시나리오·결정성 서명을 포함하며, 맵 이탈 실패 시 실패 위치·속도·횡오차·입력도 포함한다. `savedAtUtc`는 파일 생성 시각일 뿐 평가 결과의 결정성 입력이 아니다.

## 제외 범위

신경망·강화학습, 실제 트랙 레이아웃 복제, 추월·방어·충돌 회피, 다차량 순위, 퀄리파잉과 레이스 운영은 다음 마일스톤으로 미룬다.

## 검증

- `npm run typecheck`
- `npm test -- --run src/gameplay/training/AITrainingResult.test.ts src/gameplay/training/AITrainingEvaluator.test.ts`
- `npm run verify`의 타입 검사·68개 단위 테스트·아키텍처 검사·프로덕션 빌드
- 브라우저 E2E에서 교육 완료 후 결과 JSON 다운로드와 파일명 확인

모든 수치와 주행감은 실차 재현값이 아닌 `initial_assumption`/`simulation_required` 기준을 따른다. E2E가 환경 권한으로 실행되지 않는 경우에는 완료로 표시하지 않는다.

## 다음 마일스톤

M2A — Single AI opponent: 저장된 AI 설정을 사용해 플레이어와 AI 한 대를 동일한 주행 세션에 통합하고, AI가 물리 상태를 우회하지 않는지 검증한다.
