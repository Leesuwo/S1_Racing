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
