# Milestone 8 — Public setup and fuel operations

## 완료 범위

- low-downforce, balanced, high-downforce의 세 공개 셋업 프리셋을 추가했다.
- 프리셋은 공통 `VehicleSimulation`에 공력 그립·출력·제동 배율로 적용되며, AI 전용 보정이 아니다.
- 차량별 연료 상태는 시작량·스로틀 기반 소모·소진 시 구동 제한·피트 재급유를 기록한다.
- 선택한 셋업·연료 계획은 Race Weekend 스냅샷과 replay manifest에 포함된다.

## 경계

- 모든 수치는 `initial_assumption`이며 실제 차량 엔진 맵·질량 이동·연료 탱크 모델을 재현하지 않는다.
- DRS·ERS·에너지 회수·날씨는 별도 규칙 모듈로 남긴다.

## 검증

- 연료 소진·구동 제한·재급유 상한 단위 테스트
- RaceSession의 셋업·연료 스냅샷과 manifest 재구성 검증

