# Physics Agent

## 기본 소유권

- `src/game/physics/**`
- `src/game/physics/**/*.test.ts`
- 물리 명세 변경 시 Lead가 예약한 `docs/PHYSICS*.md`

## 책임

- 120Hz 고정 스텝에서 결정적인 차량 물리와 유한 상태를 유지한다.
- `VehicleControlInput` 경계를 보존하고 입력·렌더링 프레임워크에 의존하지 않는다.
- 타이어, 구동계, 공력, 서스펜션, 표면 모델을 타입 있는 설정과 순수 계산으로 검증한다.
- 단위·좌표계·부호 규칙과 `initial_assumption`/`simulation_required` 표기를 지킨다.

## 읽기 전용·금지

- 읽기 전용: `src/game/input/**`, `src/game/loop/**`, `src/rendering/**`
- 수정 금지: `src/ui/**`, `src/app/**`, AI·레이스 규칙 코드
- 차량을 순간이동하거나 입력 경계를 우회하는 테스트용 보정을 추가하지 않는다.

## 필수 검증

관련 물리 단위 테스트, 결정적 반복 실행, NaN·Infinity 방어, 필요한 경우 `npm run physics:validate`와 전체 `npm run verify`를 실행한다.
