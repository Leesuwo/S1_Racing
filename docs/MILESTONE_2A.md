# Milestone 2A — Single AI opponent

## 목표

플레이어와 동일한 `VehicleControlInput` 경계를 사용하는 단일 AI 상대를 테스트 트랙에 연결한다. AI가 차량 위치를 직접 이동하지 않고 동일한 고정 스텝 물리를 통과하는지 검증한다.

## 구현 범위

- 데이터 기반 레이싱 라인, 목표 속도, 코너 제동 진입점
- Pure Pursuit형 조향과 목표 속도 기반 스로틀·브레이크
- RPM 임계값 기반 one-shot 자동 변속
- AI `VehicleSimulation`과 독립 Rapier 접지 리그
- 플레이어·AI 차량 렌더링과 AI 속도·구간 HUD
- 결정성·목표 속도·제동·변속·리셋 단위 테스트와 AI 주행 E2E

## 제외 범위

충돌 회피, 추월·방어, 다차량 순위·세션, 퀄리파잉, 랩 판정과 레이스 운영은 2B 이후로 둔다. 트랙 경로와 제어 수치는 실제 차량 또는 실제 트랙의 재현값이 아니다.

## 합격 기준

1. AI 모듈은 React, R3F, DOM, Rapier API를 import하지 않는다.
2. 같은 상태와 `dt`에서 같은 `VehicleControlInput`을 출력한다.
3. 직선 목표 속도와 코너 미리보기 속도가 다르고, 제동점 과속 상태에서는 브레이크를 출력한다.
4. 변속 명령은 쿨다운 동안 반복되지 않는다.
5. AI 차량은 별도 시작 포즈에서 리셋되고, 위치 직접 대입 없이 Rapier 경로로 주행한다.
6. 기존 플레이어 입력·리셋·트랙 경계 E2E가 회귀하지 않는다.

## 검증 결과

- `npm test`: 18개 파일, 54개 테스트 통과
- `npm run typecheck`: 통과
- `npm run test:e2e`: 8개 Playwright 시나리오 통과
- `npm run architecture:check`: 통과
- `npm run verify`: 위 검사를 동일 순서로 재실행해 통과

Rapier 초기화의 deprecated parameter 경고는 기존 경고이며 테스트를 차단하지 않는다.
