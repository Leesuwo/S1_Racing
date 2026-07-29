# Milestone 4 — 다차량 물리·피트 레인·레이스 규정

## 목적

1차 완성에서 의도적으로 제외했던 세 가지 운영 경계를 하나의 120Hz fixed-step 흐름에 연결한다.

- M4A: 다차량 차체 형상·회전 충돌
- M4B: 실제 피트 레인 차선·서비스 박스·속도 제한
- M4C: S1 Racing 오프라인 레이스 규정 v1

실제 FIA 전체 규정을 재현하거나 특정 서킷을 복제하지 않는다. 모든 트랙 좌표·속도·시간·손상 수치는 `initial_assumption`이며, 주행감과 안정성은 `simulation_required`로 남긴다.

## M4A — 공유 Rapier 차체 충돌

`RaceCollisionWorld`가 RaceSession과 물리 구현 사이의 경계를 제공한다. `RapierMultiCarCollision`은 참가자별 cuboid 차체를 하나의 Rapier World에 생성하고 다음을 해결한다.

- 질량 기반 충돌 응답
- 차체 형상 기반 침투와 접촉
- X/Z 평면 이동 제한과 Y축 yaw 회전
- 충돌 후 위치·선속도·yaw·yaw rate 반환

RaceSession은 입력·AI·기어·RPM·타이어 상태를 계속 `VehicleSimulation`에 전달한다. Rapier는 렌더러나 AI가 직접 읽지 않고, fixed-step 후 포즈와 접촉 이벤트만 세션에 전달한다. Rapier WASM이 아직 준비되지 않은 순수 테스트에서는 M3A 결정적 접촉 해결기를 사용한다.

## M4B — 실제 피트 레인

`TestTrackDefinition.pitLane`이 피트 레인의 단일 원본이다.

- 중심선과 차선 폭
- 진입·탈출 게이트
- 서비스 박스와 박스 반경
- 피트 레인 제한 속도

전략 랩에 도달하면 즉시 타이어를 교체하지 않고 `PitLaneMonitor.request()`로 진입을 예약한다. 차량은 공통 `VehicleControlInput`으로 진입 게이트와 중심선을 추종하고, 박스에 들어온 뒤 `RaceOperations` 서비스가 시작된다. 서비스 종료 후 탈출 게이트를 통과하면 피트 상태가 완료된다.

속도 제한 초과는 fixed-step에서 한 번의 이벤트로 기록하고 M4C의 고정 시간 패널티로 전달한다. 본선 스타트 좌표와 피트 진입 좌표가 겹치는 게이트는 본선 우선으로 샘플링해 기존 트랙·텔레메트리 회귀를 보존한다.

## M4C — S1 Racing 규정 v1

`RaceRegulations`는 규정 상태를 순수 상태기계로 유지한다.

- 일반 접촉: 황색기
- 큰 충돌: 세이프티카와 제한 시간
- 피트 속도 위반: 위반 횟수와 5초 initial_assumption 패널티
- 레드 플래그: `RaceSession.triggerRedFlag()`로 일시정지
- 재시작: `RaceSession.restartFromRedFlag()`로 동일 상태에서 재개
- 완주: 체커드 플래그와 결과 단계 전환
- 기존 청색기: 리더와 한 랩 이상 차이 난 차량에 참가자별 표시

규정 스냅샷은 접촉·세이프티카·레드 플래그·시간 패널티 누적값을 포함하며 레이스 결정성 digest에도 들어간다.

## 완료 기준

- [x] Rapier 공유 차체 두 대의 실제 cuboid 접촉 단위 테스트
- [x] RaceSession에 공유 충돌 세계를 주입하는 통합 테스트
- [x] 피트 레인 샘플러·시작 게이트·박스·속도 위반 단위 테스트
- [x] 실제 전략 랩의 피트 서비스 회귀 테스트
- [x] 황색기·세이프티카·레드 플래그·시간 패널티 단위 테스트
- [x] Race Weekend 화면에 M4A/M4B/M4C 상태 표시
- [x] 최종 통합 게이트: `npm run verify`, 브라우저 E2E, Codex 앱 실제 플레이 확인

## 다음 마일스톤

M4 이후의 단일 다음 마일스톤은 **M5 — 레이스 리플레이·온라인 동기화 전 단계의 결정적 기록/재생**으로 잡는다. 연료·DRS·KERS·날씨·전체 대회 규정은 M5의 기록 계약을 확정한 뒤 독립 범위로 추가한다.
