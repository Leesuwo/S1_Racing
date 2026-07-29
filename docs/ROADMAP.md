# Roadmap

## Milestone 0 — Project Foundation (완료)

실행 셸, 문서, 타입 경계, 고정 스텝 골격, 검증 명령을 고정한다.

## Physics Prototype v0.1 (완료)

고정 스텝과 단순 차량 물리의 첫 번째 주행 가능한 세로 절단을 구현했다. 테스트 트랙, 입력, 카메라, HUD, 단위 테스트와 E2E throttle 검증을 포함한다.

## Milestone 1A — Chassis and suspension (완료)

Rapier 동적 차체, 정적 지면, 4개 휠 레이캐스트, 스프링·댐퍼 접지, 120Hz 정적 안정성 검증과 HUD를 추가했다. 평면 구동력과 yaw는 다음 단계까지 기존 TypeScript 모델이 소유한다.

## Milestone 1B — Wheel kinematics (완료)

전륜 조향, 4개 휠 장착점·접지점·접지점 속도, Rapier 차체와 평면 물리의 pose 동기화, 조향 HUD와 단위·E2E 검증을 추가했다.

## Milestone 1C — Tire forces (완료)

휠별 슬립 비율·슬립 각·하중 민감도·결합 그립을 순수 타이어 모델로 분리하고, Rapier 차체의 실제 접지점에 종·횡방향 힘을 적용했다. Rapier가 X/Z·yaw를 소유하고 기존 시뮬레이션은 입력·기어·RPM·렌더링 상태를 동기화한다.

## Milestone 1D — Drivetrain (완료)

토크 커브, 8단 변속, 후륜구동, 엔진 브레이크를 추가했다. 차체 회전 관성 수정과 합격 기준은 [Milestone 1D 상세 문서](./MILESTONE_1D.md)에 기록했다.

## Milestone 1E — Aero and validation (완료)

전후 다운포스·드래그를 Rapier에 연결하고 직선 가속·코스트다운·공력 스케일·유한 상태 자동 검증을 통과했다. 상세 범위와 결과는 [Milestone 1E 상세 문서](./MILESTONE_1E.md)에 기록했다.

## Milestone 1F — Input presets and test track (완료)

키보드·마우스·게임패드·휠 입력 프리셋을 공통 `VehicleControlInput`으로 정규화하고, 반복 가능한 테스트 트랙 구간·노면 전환·브레이크 마커를 데이터로 분리한다. 입력 지연, 리셋, 트랙 경계 E2E를 추가한다.

상세 범위와 검증 결과는 [Milestone 1F 상세 문서](./MILESTONE_1F.md)에 기록했다.

## Milestone 2A-0 — AI Training Circuit & Evaluator (완료)

단일 AI를 레이스 세션에 연결하기 전에 Silverstone의 주행 특성만 참고한 독창 교육 트랙과 120Hz 결정적 에피소드 평가기를 추가했다. Training Lab은 중심선·도로 폭·곡률·섹터·체크포인트·레이싱 라인·저속 탈출 시나리오, 14개 후보의 결정적 설정 탐색, 실제 레이싱 라인 누적 거리 기반 전체 랩 HUD를 제공한다. 자동 튜닝 결과는 `s1-racing.ai-training-result` schema v1 JSON으로 저장할 수 있다. 신경망·강화학습은 이 단계에 포함하지 않는다.

상세 범위와 검증 결과는 [M2A-0 상세 문서](./MILESTONE_2A-0.md)에 기록했다.

상세 실행 항목은 [AI Training Circuit TODO](./AI_TRAINING_TRACK_TODO.md)를 따른다.

## Milestone 2A — Single AI opponent (완료)

M2A-0에서 검증한 AI 설정을 단일 AI 주행 세션에 전달하고, 플레이어와 동일한 `VehicleControlInput`·`VehicleSimulation`·Rapier 힘 적용 순서를 사용한다. AI는 별도 물리 보너스나 위치 직접 대입 없이 트랙의 목표 속도·레이싱 라인·브레이크 지점만 입력으로 변환한다. 관련 목표·검증 결과는 [M2A 상세 문서](./MILESTONE_2A.md)에 기록했다.

## Milestone 2B — Multi-car race session (완료)

`RaceSession`이 차량별 `VehicleSimulation`과 AI 입력을 소유하고, 2~20대의 고유 그리드·랩 진행·기본 순위·리셋·fixed-step 비용 스냅샷을 제공한다. 상세 범위와 검증 결과는 [M2B 상세 문서](./MILESTONE_2B.md)에 기록했다.

## Milestone 2C — Qualifying (완료)

`QualifyingSession`이 유효 랩 최고 기록과 `s1-racing-qualifying-v1`의 Q1 20→15, Q2 15→10, Q3 10 최종 순위를 관리하며 RaceSession 그리드 순서로 전달한다. 상세 범위와 검증 결과는 [M2C 상세 문서](./MILESTONE_2C.md)에 기록했다.

## Milestone 2D — Race weekend and strategy (완료)

`RaceWeekendSession`과 `Race Weekend` UI로 Practice→Qualifying→Race→Results 흐름, 시작 타이어, 다른 컴파운드로 1회 정지하는 최소 전략 경계를 추가했다. 상세 범위와 검증 결과는 [M2D 상세 문서](./MILESTONE_2D.md)에 기록했다.

## Milestone 3A — Track limits and contact model (완료)

TestTrackDefinition의 정적 벽·연석을 렌더링·Rapier가 공유하고, 순수 트랙 리밋 규칙과 RaceSession 차량 접촉 응답을 추가했다. 랩 무효화·패널티·벽 접촉 telemetry·Race Weekend 표시를 포함한다. 상세 범위와 검증 결과는 M3A 상세 문서에 기록한다.

## Milestone 3B — Tyre thermal, wear and pressure (완료)

타이어 힘 모델에 온도·마모·공기압 상태를 연결하고, 컴파운드 전략과 HUD가 같은 상태를 읽도록 했다. 상세 범위는 [M3B 상세 문서](./MILESTONE_3B.md)에 기록한다.

## Milestone 3C — Overtake, defence and collision avoidance (완료)

상대 차량 간격·closing speed·황색기 우선순위를 읽는 racecraft 상태 머신을 추가했다. AI는 계속 `VehicleControlInput`만 생성한다. 상세 범위는 [M3C 상세 문서](./MILESTONE_3C.md)에 기록한다.

## Milestone 3D — Damage, flags and pit physics (완료)

접촉 응답을 손상·성능 저하·플래그·피트 서비스 시간과 연결했다. 실제 피트 레인 차선과 전체 대회 규정은 제외 범위로 고정한다. 상세 범위는 [M3D 상세 문서](./MILESTONE_3D.md)에 기록한다.

## Milestone 3E — First completion hardening (완료)

결정성 digest, 결과 단계 수렴, 통합 HUD·E2E, 아키텍처 문서와 전체 `npm run verify`를 기준으로 오프라인 단일 트랙 1차 완성 게이트를 닫았다. 포함·제외 범위는 [1차 완성 기준](./FIRST_COMPLETE.md)에 기록한다.

## Milestone 4A — Shared Rapier multi-car collision (완료)

`RaceSession`에 선택 가능한 공유 `RaceCollisionWorld` 경계를 추가하고, `RapierMultiCarCollision`이 참가자별 cuboid 차체를 하나의 Rapier World에서 실제 형상·질량·yaw 회전으로 해결한다. 입력·AI·엔진 상태는 기존 `VehicleSimulation`이 소유하고, 충돌 후 포즈와 접촉 이벤트만 세션에 전달한다. WASM 초기화 전 순수 테스트는 기존 결정적 접촉 해결기로 대체한다.

## Milestone 4B — Physical pit lane and speed limit (완료)

`TestTrackDefinition.pitLane`에 피트 중심선·폭·진입·탈출 게이트·서비스 박스·속도 제한을 추가했다. `PitLaneMonitor`는 전략 요청을 실제 차선 입력으로 변환하고, 차선 속도 위반과 박스 진입을 fixed-step으로 기록한다. 화면·노면 샘플러·레이스 세션은 동일한 피트 레인 원본을 사용한다.

## Milestone 4C — S1 race regulations (완료)

`RaceRegulations`가 접촉 강도에 따른 황색기·세이프티카, 레드 플래그 중단·재시작, 피트 속도 시간 패널티와 체커드 전이를 관리한다. 이는 전체 FIA 규정의 복제가 아니라 현재 오프라인 프로토타입에서 검증 가능한 S1 규정 v1이며, 규정 스냅샷은 Race Weekend UI와 결정성 digest에 포함된다.

상세 범위와 검증 결과는 [Milestone 4 상세 문서](./MILESTONE_4.md)에 기록한다.

## Milestone 5 — Deterministic race replay (진행 중)

RaceSession의 120Hz 입력과 물리·전략·운영 digest를 기록하고, 동일한 초기 grid에서 step별 결정성을 검증한다. Race Weekend는 완료된 리플레이를 `s1-racing-replay-v1` JSON으로 저장·불러오며, 현재 트랙·랩·참가자 수와 파일 호환성을 확인한다. 온라인 동기화와 연료·DRS·KERS·날씨는 이 기록 계약을 기반으로 하는 후속 범위다.

상세 범위와 검증 결과는 [M5 상세 문서](./MILESTONE_5.md)에 기록한다.
