# Roadmap

## Milestone 0 — Project Foundation (완료)

실행 셸, 문서, 타입 경계, 고정 스텝 골격, 검증 명령을 고정한다.

## Physics Prototype v0.1 (완료)

고정 스텝과 단순 차량 물리의 첫 번째 주행 가능한 세로 절단을 구현했다. 테스트 트랙, 입력, 카메라, HUD, 단위 테스트와 E2E throttle 검증을 포함한다.

## Milestone 1A — Chassis and suspension

현재 프로토타입의 평면 모델을 차체 상태와 4개 휠 레이캐스트 서스펜션으로 확장하고, 정적 차체 안정성을 검증한다.

## Milestone 1B — Wheel kinematics

휠 속도·조향·접지 좌표를 구현한다.

## Milestone 1C — Tire forces

슬립 비율, 슬립 각, 결합 그립, 하중 민감도를 추가한다.

## Milestone 1D — Drivetrain

토크 커브, 8단 변속, 후륜구동, 엔진 브레이크를 추가한다.

## Milestone 1E — Aero and validation

전후 다운포스·드래그를 추가하고 자동 물리 검증을 통과시킨다.

## 이후

입력 프리셋 → 테스트 트랙 → AI 1대 → 다차량 AI → 단일 퀄리파잉 → Q1/Q2/Q3 → 레이스 전략 순서로 확장한다.
