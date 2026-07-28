# Milestone 3C — Overtake, defence and collision avoidance

## 목표

상대 차량과 트랙 진행 상태를 읽어 추종·추월·방어·회피 의도를 결정하고, AI가 공통 `VehicleControlInput`만 생성하는 경계를 유지한다.

## 구현 범위

- `RacecraftStateMachine`의 `follow`·`attack`·`defend`·`avoid` 상태
- 전방 간격·closing speed·차량 간 평면 거리·황색기 우선순위 판단
- 조향 편향·스로틀/브레이크 배율·`overtakeMode`를 AI 입력에 연결
- RaceSession에서 각 AI가 가장 가까운 활성 상대의 이전 fixed-step 스냅샷을 읽도록 연결
- UI와 결정성 digest에 현재 racecraft 상태 반영

## 합격 기준

- 공격·방어·회피·추종 상태가 경계 조건에서 결정적으로 전이된다.
- 회피 상태가 추월보다 우선한다.
- AI가 차량 위치·속도·그립을 직접 변경하지 않는다.
- 동일 입력 리플레이에서 racecraft 상태와 결과 digest가 일치한다.

## 제외 범위

다중 차선 최적화, 공방 게임이론, 실제 규정 기반 블루 플래그 운영의 완전한 구현은 후속 범위다. 현재 상대 선택은 가장 가까운 활성 차량 기준이다.

## 검증

`Racecraft.test.ts`, `RaceSession.test.ts`, AI 입력 회귀 테스트, Race Weekend E2E와 전체 `npm run verify`로 검증한다.
