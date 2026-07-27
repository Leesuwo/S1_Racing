# Physics Spec

## 역할 분리

Rapier는 현재 차체 강체·4개 휠 레이캐스트·접지점 타이어 힘·구동계 토크·공력 힘과 TestTrackDefinition의 정적 벽·연석을 적분한다. 순수 TypeScript 계층의 Drivetrain, AeroModel, TireModel, WheelKinematics가 명령과 힘을 계산하고, TrackLimitsMonitor와 VehicleContact가 레이스 규칙·다차량 접촉의 결정적 응답을 계산한다. React/R3F는 읽기 전용 스냅샷만 표시한다.

## 목표 신호 흐름

```text
VehicleControlInput
→ powertrain
→ wheel kinematics
→ suspension load
→ tire forces
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

현재 프로토타입은 실제 특정 차량을 재현하지 않으며, 검증 가능한 주행 감각을 확보하기 위한 initial_assumption이다. M3A의 정적 벽·연석 치수, 트랙 리밋 패널티, RaceSession의 원형 차량 접촉 반경도 같은 검증용 초기 가정이다.

검증 우선순위는 고정 스텝 → 차체 안정성 → 휠 운동학 → 서스펜션 → 타이어 힘 → 구동계 → 공력 순서다.

## Milestone 1D/1E/1F 검증 게이트

- 1단·8단 기어비가 동일 휠 속도의 RPM·토크를 다르게 만든다.
- 주행 중 스로틀 해제는 엔진 브레이크를 만들고 정지 상태에서는 만들지 않는다.
- 속도 2배에서 전후 다운포스·드래그가 약 4배가 된다.
- 자동 직선 가속·코스트다운·공력 스케일·유한 상태 검증이 통과한다.
- 입력 프리셋의 공통 입력 변환, 데이터 기반 시작 포즈·구간·경계 판정, 리셋 E2E가 통과한다.
- 벽·연석 collider는 선택적 트랙 데이터로 생성되고, 차체 접촉 telemetry가 매 Rapier step 뒤 갱신된다.
- RaceSession의 차량 접촉 응답은 위치 침투를 분리하고 접근 속도에 반발을 적용하며, AI 입력 경계를 변경하지 않는다.

## 다음 확장

1. 입력 프리셋과 반복 가능한 테스트 트랙 콘텐츠
2. 공유 입력 경계를 사용하는 단일 AI
3. 다차량 세션·퀄리파잉·레이스 전략
4. 타이어 온도·마모·공기압·노면 진화
5. Rapier world 내 다차량 차체 형상·회전 접촉과 손상
