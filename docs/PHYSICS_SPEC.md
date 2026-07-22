# Physics Spec

## 역할 분리

Rapier는 현재 차체 강체·4개 휠 레이캐스트·접지점 타이어 힘·구동계 토크·공력 힘을 적분한다. 순수 TypeScript 계층의 `Drivetrain`, `AeroModel`, `TireModel`, `WheelKinematics`가 명령과 힘을 계산하고, React/R3F는 읽기 전용 스냅샷만 표시한다. 실제 트랙 충돌과 벽 충돌은 후속 마일스톤이다.

## 목표 신호 흐름

```text
VehicleControlInput
→ powertrain
→ wheel kinematics
→ suspension load
→ tire forces
→ aero forces
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

현재 프로토타입은 실제 특정 차량을 재현하지 않으며, 검증 가능한 주행 감각을 확보하기 위한 `initial_assumption`이다. 실제 트랙 충돌·연석·벽 접촉은 후속 단계에서 추가한다.

검증 우선순위는 고정 스텝 → 차체 안정성 → 휠 운동학 → 서스펜션 → 타이어 힘 → 구동계 → 공력 순서다.

## Milestone 1D/1E/1F 검증 게이트

- 1단·8단 기어비가 동일 휠 속도의 RPM·토크를 다르게 만든다.
- 주행 중 스로틀 해제는 엔진 브레이크를 만들고 정지 상태에서는 만들지 않는다.
- 속도 2배에서 전후 다운포스·드래그가 약 4배가 된다.
- 자동 직선 가속·코스트다운·공력 스케일·유한 상태 검증이 통과한다.
- 입력 프리셋의 공통 입력 변환, 데이터 기반 시작 포즈·구간·경계 판정, 리셋 E2E가 통과한다.

## 다음 확장

1. 입력 프리셋과 반복 가능한 테스트 트랙 콘텐츠
2. 공유 입력 경계를 사용하는 단일 AI
3. 다차량 세션·퀄리파잉·레이스 전략
4. 실제 노면 높이·연석·벽 충돌과 트랙 리밋
5. 타이어 온도·마모·노면 진화
