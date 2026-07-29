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

전략은 RaceSession에 시작 컴파운드와 피트 랩·피트 컴파운드로 전달된다. M3B에서 타이어 열·마모·공기압을, M3D에서 최소 피트 서비스 시간·접촉 손상·플래그를 연결했고, M4B에서 실제 피트 레인 차선·속도 제한을, M4C에서 S1 규정 v1을 연결했다. 전체 대회 규정은 다음 제품 단계 범위다.

## 1차 완성 운영 스냅샷

RaceSession은 차량별 컴파운드·온도·마모·압력, racecraft 의도, 손상·피트 상태를 읽기 전용으로 제공한다. 접촉이 발생하면 황색기를 일정 시간 유지하고, 손상 임계치 퇴역은 적색기, 세션 종료는 체커 플래그로 표시한다. 모든 상태 전이는 120Hz fixed-step에서 수행한다.
트랙 밖·정지 상태가 지속되는 차량은 퇴역하며, 세션은 45초 시뮬레이션 상한 안에서 완주·퇴역 결과로 수렴한다. 이 상한은 결과 흐름을 보장하는 프로토타입 방어값이며 실제 경기 시간 규정이 아니다.

## 결정적 리플레이

M5부터 Race Weekend의 RaceSession fixed-step 입력과 각 입력 직후의 결정성 digest를 `s1-racing-replay-v1` JSON으로 기록한다. 저장 문서는 트랙 이름·랩 수·참가 차량 수·120Hz 계약·초기 digest·프레임별 입력·digest·최종 digest를 포함한다. digest에는 렌더링 성능 측정값을 넣지 않아 같은 입력의 물리·전략·운영 결과만 비교한다.

불러오기 경계에서는 schema, 수치 범위, 프레임 순서와 현재 Race Weekend의 트랙·랩·참가자 수를 검증한다. 실제 step별 재생 검증은 순수 `verifyRaceReplay`에 새 `RaceSession`을 주입하는 방식으로 수행하며, 첫 불일치 fixed-step에서 중단해 변조 또는 결정성 회귀 위치를 명확히 보고한다.
