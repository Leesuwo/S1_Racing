# Race Weekend Spec

## 목표 흐름

```text
트랙 선택 → 차량 선택 → 퀄리파잉 → 스타팅 그리드 → 레이스 → 결과
```

## 퀄리파잉 규칙

S1은 20대 기준 Q1 20대·하위 5대 탈락, Q2 15대·하위 5대 탈락, Q3 10대의 독립 규칙을 사용한다. 실제 규정과 구분되는 게임 설계이며 `s1-racing-qualifying-v1` `rulesetVersion`으로 관리한다. 유효한 양의 유한 랩타임만 최고 기록에 반영한다.

## 레이스 주말 상태

`RaceWeekendSession`은 다음 순서를 고정한다.

```text
practice → qualifying(Q1 → Q2 → Q3) → race → results
```

퀄리파잉 최종 순서는 `RaceSession`의 그리드 순서로 전달된다. Race는 기본 20대와 3랩 initial assumption으로 시작하며, 모든 차량은 `VehicleControlInput`과 `VehicleSimulation`을 공유한다.

## 전략 경계

레이스 시작 전에 시작 컴파운드와 다른 컴파운드로 최소 한 번 정지하는 `RaceStrategy`를 선택한다. 피트 랩은 1랩부터 마지막 전 랩 사이여야 한다.

이번 단계에서는 전략의 유효성만 확인한다. 타이어 열·마모·공기압, 실제 피트 레인·피트 시간, 충돌·손상은 별도 마일스톤에서 구현한다.
