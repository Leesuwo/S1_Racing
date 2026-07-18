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

## Milestone 1F — Input presets and test track (다음)

키보드·마우스·게임패드·휠 입력 프리셋을 공통 `VehicleControlInput`으로 정규화하고, 반복 가능한 테스트 트랙 구간·노면 전환·브레이크 마커를 데이터로 분리한다. 입력 지연, 리셋, 트랙 경계 E2E를 추가한다.

## Milestone 2A — Single AI opponent (예정)

플레이어와 동일한 입력 경계를 사용하는 AI 한 대를 추가한다. AI가 물리를 우회하지 않는지, 결정적 목표 속도·레이싱 라인·브레이크 지점을 단위·시나리오 테스트로 검증한다.

## Milestone 2B — Multi-car race session (예정)

여러 차량의 스폰·그리드·충돌 없는 기본 순위·세션 리셋을 추가한다. 차량 수 증가에 따른 고정 스텝 시간과 텔레메트리 수집 비용을 측정한다.

## Milestone 2C — Qualifying (예정)

단일 퀄리파잉 세션에서 랩 타이밍, 유효 랩, Q1/Q2/Q3 컷을 구현한다. 타이밍 판정과 세션 전환을 결정적 시나리오로 검증한다.

## Milestone 2D — Race weekend and strategy (예정)

연습·퀄리파잉·레이스 흐름, 타이어 선택과 피트 전략의 최소 경계를 추가한다. 타이어 열·마모와 실제 충돌·손상은 별도 설계 결정 후 진행한다.

## Milestone 3A — Track limits and contact model (예정)

실제 높이·연석·벽·차량 접촉을 Rapier에 추가하고, 트랙 리밋·충돌 안정성·고속 공력 검증을 확장한다.
