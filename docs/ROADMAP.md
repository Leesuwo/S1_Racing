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

`RaceWeekendSession`과 `Race Weekend` UI로 Practice→Qualifying→Race→Results 흐름, 시작 타이어, 다른 컴파운드로 1회 정지하는 최소 전략 경계를 추가했다. 타이어 열·마모, 실제 피트 물리, 충돌·손상은 다음 설계로 남긴다. 상세 범위와 검증 결과는 [M2D 상세 문서](./MILESTONE_2D.md)에 기록했다.

## Milestone 3A — Track limits and contact model (완료)

TestTrackDefinition의 정적 벽·연석을 렌더링·Rapier가 공유하고, 순수 트랙 리밋 규칙과 RaceSession 차량 접촉 응답을 추가했다. 랩 무효화·패널티·벽 접촉 telemetry·Race Weekend 표시를 포함한다. 상세 범위와 검증 결과는 M3A 상세 문서에 기록한다.

## Milestone 3B — Tyre thermal, wear and pressure (예정)

타이어 힘 모델에 온도·마모·공기압 상태를 연결하고, 열화가 그립·제동·구동·장거리 랩 안정성에 미치는 영향을 120Hz 고정 스텝으로 검증한다.

## Milestone 3C — Overtake, defence and collision avoidance (예정)

트랙 구간·상대 차량·블루 플래그 경계를 읽는 추월·방어·충돌 회피 상태 머신을 추가하되, AI는 계속 VehicleControlInput만 생성하게 한다.

## Milestone 3D — Damage, flags and pit physics (예정)

접촉 응답을 손상·플래그·실제 피트 레인·피트 시간 상태와 연결한다. 대회 규정과 차량별 손상 모델은 별도 근거와 검증 기준을 먼저 확정한다.
