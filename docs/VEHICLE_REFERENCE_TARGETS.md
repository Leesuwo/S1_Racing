# Vehicle Reference Targets

## Evidence status

이 문서의 프로토타입 값은 실제 특정 팀·차량을 재현하는 공식 데이터가 아니다. 규정에서 확인되는 범위와 S1의 초기 가정을 분리한다.

## Initial assumption — v0.1

```yaml
widthM: 1.88
wheelbaseM: 3.30
totalMassKg: 780
frontStaticWeightRatio: 0.45
rearStaticWeightRatio: 0.55
drivetrain: rear_wheel_drive
forwardGears: 8
```

## Simulation required

- 무게중심 높이
- yaw/pitch/roll 관성 모멘트
- 스프링·댐퍼·안티롤 값
- 타이어 슬립 곡선과 하중 민감도
- 다운포스·드래그 계수와 공력 중심
- 엔진 토크 곡선
- 브레이크 온도·마모

## Acceptance policy

각 값은 `initial_assumption → simulated → playtested → accepted/rejected` 상태로 관리한다. 출처가 없는 값을 실제 차량 데이터처럼 표시하거나 고정하지 않는다.
