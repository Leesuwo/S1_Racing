# Physics Spec

## 역할 분리

Rapier는 현재 차체 강체·4개 휠 레이캐스트·접지점 타이어 힘·구동계 토크·공력 힘과 TestTrackDefinition의 정적 벽·연석을 적분한다. 순수 TypeScript 계층의 Drivetrain, AeroModel, TireModel, TyreCondition, WheelKinematics가 명령과 힘을 계산하고, TrackLimitsMonitor·VehicleContact·RaceOperations가 레이스 규칙·다차량 접촉·운영 상태의 결정적 응답을 계산한다. React/R3F는 읽기 전용 스냅샷만 표시한다.

## 목표 신호 흐름

```text
VehicleControlInput
→ powertrain
→ wheel kinematics
→ suspension load
→ tire forces + tyre condition
→ aero forces
→ track boundary/contact response
→ chassis integration
→ Rapier step
→ render snapshot
```

## 시간 규칙

- 목표 물리 주기: 120Hz
- 렌더링 주기: 브라우저 주사율
- 렌더링은 이전·현재 물리 상태를 보간
- 프레임 델타는 최대 0.1초로 제한
- 한 프레임 최대 보정 스텝은 4회

## 현재 상태

`Physics Prototype v0.1`의 평면 기준 모델과 Milestone 1F의 Rapier 강체 경로를 함께 구현했다. `Drivetrain`과 `AeroModel`은 순수 TypeScript로 토크·RPM·엔진 브레이크·전후 다운포스·드래그를 계산하고, `RapierChassisSuspension`이 접지점과 차체에 적용한다. 트랙 노면과 경계는 `TEST_TRACK_DATA`에서 샘플링한다.

현재 프로토타입은 실제 특정 차량을 재현하지 않으며, 검증 가능한 주행 감각을 확보하기 위한 initial_assumption이다. M3A의 정적 벽·연석 치수와 트랙 리밋 패널티, RaceSession의 원형 차량 접촉 반경, M3B 타이어 열화와 M3D 손상·피트 시간도 같은 검증용 초기 가정이다.

## F1 2012 동역학 기준선

2026-07-29 조사에서 2012 FIA 기술 규정과 공식 2012 온보드 자료를 바탕으로, 공통 차량 모델의 주행 기준선을 다음처럼 조정했다. 이는 특정 팀 차량의 재현값이 아니라 2012 F1다운 반응을 만들기 위한 `initial_assumption`이다.

- 차체 질량 640 kg, 휠베이스 3.30 m, 트랙 폭 1.60 m, 건조 완성 휠 직경 상한 660 mm를 기준으로 둔다.
- 2.4 L naturally aspirated V8의 18,000 rpm 한계와 7단 전진 기어 문법을 파워트레인 기준으로 사용한다.
- 150 km/h에서 차량 무게와 비슷한 다운포스가 생기는 설명을 환산해 `4.4 N/(m/s)^2`를 공력 계수의 시작값으로 둔다. 300 km/h에서 약 4배 중량 수준이 되며, 실제 팀별 공력 효율을 확정한 값은 아니다.
- 고속 제동에서는 공력 하중이 타이어의 사용 가능한 힘을 키우고, 저속에서는 기계적 그립이 한계를 결정하도록 브레이크 토크와 combined tire force를 분리한다.
- 앞·뒤 횡강성을 과도하게 분리하지 않고 작은 슬립각에서 균형 있게 회전하도록 조정한다. 2012 F1 차량의 타이어 곡선은 공개 실차 데이터가 아니므로 `simulation_required`로 남긴다.

상세 출처와 코드 적용표는 [F1 2012 동역학·온보드 조사 자료](./F1_2012_DYNAMICS_REFERENCE.md)에 기록한다.

검증 우선순위는 고정 스텝 → 차체 안정성 → 휠 운동학 → 서스펜션 → 타이어 힘 → 구동계 → 공력 순서다.

## Milestone 1D/1E/1F 검증 게이트

- 1단·7단 F1 기준 기어비가 동일 휠 속도의 RPM·토크를 다르게 만든다.
- 주행 중 스로틀 해제는 엔진 브레이크를 만들고 정지 상태에서는 만들지 않는다.
- 속도 2배에서 전후 다운포스·드래그가 약 4배가 된다.
- 자동 직선 가속·코스트다운·공력 스케일·유한 상태 검증이 통과한다.
- 입력 프리셋의 공통 입력 변환, 데이터 기반 시작 포즈·구간·경계 판정, 리셋 E2E가 통과한다.
- 벽·연석 collider는 선택적 트랙 데이터로 생성되고, 차체 접촉 telemetry가 매 Rapier step 뒤 갱신된다.
- RaceSession의 차량 접촉 응답은 위치 침투를 분리하고 접근 속도에 반발을 적용하며, AI 입력 경계를 변경하지 않는다.
- TyreCondition은 열 스트레스·노면·속도로 네 휠 온도·마모·압력을 갱신하고 결과 그립을 VehicleSimulation에 전달한다.
- RaceOperations는 접촉 손상 성능 배율을 VehicleSimulation에 전달하지만 차량 위치를 직접 바꾸지 않는다.
- 피트 서비스 중에는 RaceSession 시간만 진행하고 차량 물리 입력을 보류한다.

## 다음 확장

1. 입력 프리셋과 반복 가능한 테스트 트랙 콘텐츠
2. 공유 입력 경계를 사용하는 단일 AI
3. 다차량 세션·퀄리파잉·레이스 전략
4. 타이어 온도·마모·공기압·노면 진화 (M3B 완료)
5. Rapier world 내 다차량 차체 형상·회전 접촉과 손상 (후속)
