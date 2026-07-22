# AI Spec

AI는 플레이어와 같은 차량 물리를 사용하고 `VehicleControlInput`만 출력한다. 차량 위치를 직접 이동시키거나 숨겨진 그립 보너스를 사용하지 않는다.

## Milestone 2A 구현 범위

- `src/gameplay/ai/SingleOpponentAI.ts`가 순수 TypeScript로 AI 입력을 생성한다.
- `TEST_TRACK_DATA.racingLine`이 위치(m), 방향(rad), 목표 속도(m/s), 제동 진입점을 소유한다.
- 조향은 레이싱 라인 목표점에 대한 Pure Pursuit형 헤딩·횡오차 제어를 사용한다.
- 가감속은 현재 목표 속도와 제동 미리보기 속도의 오차로 결정하며, 브레이크 중 스로틀을 0으로 제한한다.
- 변속은 RPM 임계값과 0.25 s 초기 가정 쿨다운으로 한 fixed step 명령을 생성한다.
- AI 차량도 `VehicleSimulation`과 Rapier 리그를 거치며, 플레이어와 동일한 120Hz 물리 순서를 사용한다.

모든 AI 튜닝값은 실제 차량 재현값이 아닌 `initial_assumption`이며, 주행감과 코너별 제동은 `simulation_required` 검증 대상이다.

## 제외 범위

충돌 회피, 추월·방어 상태 머신, 다차량 순위, 퀄리파잉·레이스 전략은 2B 이후로 둔다. M2A의 AI는 트랙별 예외를 코드에 하드코딩하지 않고 트랙 데이터만 읽는다.

## 예정 계층

1. Racing line과 목표 속도 프로파일 — M2A 완료
2. Pure Pursuit 조향 — M2A 완료
3. PID 기반 가감속 — 후속 정밀 튜닝
4. 충돌 회피
5. 추월·방어 상태 머신
6. 퀄리파잉·레이스 전략
