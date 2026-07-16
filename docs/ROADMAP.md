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

## Milestone 1D — Drivetrain

토크 커브, 8단 변속, 후륜구동, 엔진 브레이크를 추가한다.

## Milestone 1E — Aero and validation

전후 다운포스·드래그를 추가하고 자동 물리 검증을 통과시킨다.

## 이후

입력 프리셋 → 테스트 트랙 → AI 1대 → 다차량 AI → 단일 퀄리파잉 → Q1/Q2/Q3 → 레이스 전략 순서로 확장한다.
