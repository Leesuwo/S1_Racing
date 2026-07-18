# Physics Validation Spec

## 목적

차량 수치를 감각만으로 튜닝하지 않고 자동 시뮬레이션과 텔레메트리로 비교한다.

## Test matrix

| Test | Primary output |
|---|---|
| Straight Line Acceleration | 0–100, 0–200 km/h, gear changes |
| Coast-Down | drag decay and terminal speed |
| Constant-Radius Skidpad | lateral acceleration and slip angle |
| Step-Steer | yaw response, overshoot, settling |
| Slalom | load transfer and recovery |
| Emergency Braking | stopping distance and wheel slip |
| Combined Braking and Turning | friction circle behavior |
| Curb Strike | suspension response and contact stability |
| High-Speed Stability | steering oscillation and aero balance |
| Surface Transition | grip change and recovery |

## Test record

```yaml
testId: step-steer-001
vehicleConfigVersion: initial
physicsVersion: 0.1.0
initialCondition: documented
input: deterministic
expectedRange: pending
telemetry: required
status: simulation_required
```

## Milestone 0 deliverable

이번 단계에서는 테스트 하네스의 실행 계약만 문서화한다. 실제 차량 값과 기대 범위는 차량 물리 구현 후 외부 참고 자료와 시뮬레이션 결과를 함께 사용해 확정한다.

## Milestone 1E deliverable

현재 자동 검증은 `src/game/physics/PhysicsValidation.ts`의 결정적 하네스와 Rapier 통합 테스트로 다음 게이트를 실행한다.

- 직선 가속: 4초 스로틀 후 속도와 상태 유한성
- 코스트다운: 클러치 입력 후 속도 감소
- 공력 스케일: 속도 2배에서 다운포스·드래그 약 4배
- Rapier 공력: 전후 다운포스·드래그 텔레메트리와 엔진 브레이크

실차 기반 랩타임·스키드패드·고속 안정성의 허용 범위는 차량 기준값이 확정되는 후속 마일스톤에서 `simulation_required`로 관리한다.
