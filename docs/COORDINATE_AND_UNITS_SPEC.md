# Coordinate, Units, and Sign Spec

## World coordinate

| Axis | Meaning |
|---|---|
| +X | right |
| +Y | up |
| -Z | vehicle forward |
| +Z | vehicle rear |

Three.js와 동일한 월드 기준을 사용한다. 차량 로컬 전방도 -Z로 통일한다.

## Units

| Quantity | Unit |
|---|---|
| distance | meter |
| time | second |
| speed | meter/second |
| angle | radian internally |
| mass | kilogram |
| force | newton |
| torque | newton-meter |
| angular velocity | radian/second |

표시 계층에서만 km/h와 degree로 변환한다.

## Sign rules

- 오른쪽 조향은 양수, 왼쪽 조향은 음수로 시작한다.
- 차량 전방 속도는 차량 로컬 -Z 방향 성분으로 계산한다.
- 우회전 yaw는 프로젝트 기준에서 양수로 정의하기 전까지 수학 함수의 단일 규칙을 유지한다.
- 슬립 각과 슬립 비율의 최종 부호는 타이어 모델 구현 전에 테스트 벡터로 고정한다.

## Numerical safety

- `abs(longitudinalVelocity) < 0.1`이면 저속 분모를 최소값으로 대체한다.
- 유효하지 않은 입력은 clamp하고, NaN·Infinity는 즉시 오류 텔레메트리로 기록한다.
- 외부 설정값은 로딩 시 범위 검증한다.
