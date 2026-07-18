# Milestone 1E — Aero and validation

상태: 완료. 전후 공력 하중과 속도 반대 방향 항력을 Rapier 고정 스텝에 연결하고, 결정적 물리 검증 게이트를 추가했다.

## 목표

Milestone 1D의 구동계·타이어 힘 위에 공력 경계를 추가한다. 공력 계산은 React나 Rapier API에 의존하지 않는 [`AeroModel`](../src/game/physics/AeroModel.ts)로 유지하고, Rapier는 그 결과를 차체에 힘으로 적용한다.

## 구현 내용

### 공력 모델

- 다운포스와 드래그는 `speedMps²`에 비례한다.
- `aeroBalanceFront`로 전륜·후륜 다운포스를 분배한다.
- 드래그는 차체 X/Z 선속도의 반대 방향으로 차체 중심에 적용한다.
- 전후 다운포스는 각각 전·후 차축 위치에 적용해 서스펜션 하중과 피치 응답에 반영한다.
- 노면의 `dragMultiplier`는 아스팔트·잔디 표면 전환에 함께 적용한다.

### 자동 검증

- `AeroModel.test.ts`: 정지 시 0, 전후 하중 합, 속도 제곱 스케일, 잔디 드래그 배율을 검증한다.
- `PhysicsValidation.ts`: 직선 가속, 클러치 입력 코스트다운, 공력 속도 스케일, 유한 상태를 하나의 결정적 보고서로 검사한다.
- `RapierChassisSuspension.test.ts`: 후륜 구동 토크, 엔진 브레이크, 다운포스·드래그 텔레메트리를 함께 검증한다.

## 데이터 흐름

```text
VehicleControlInput
  → Drivetrain: 기어·RPM·후륜 토크·엔진 브레이크
  → AeroModel: 전후 다운포스·드래그
  → RapierChassisSuspension: 접지점 타이어 힘 + 공력 힘
  → Rapier pose / 휠 각속도
  → VehicleSimulation 스냅샷·텔레메트리
```

물리 입력과 계산은 120Hz 고정 스텝에서만 수행한다. 렌더링은 Rapier 결과를 `VehicleSimulation`의 읽기 전용 스냅샷으로 받아 보간한다.

## 합격 기준

- 전후 다운포스 합이 전체 다운포스와 같고, 0속도에서 공력은 0이다.
- 속도를 2배로 올리면 다운포스·드래그가 약 4배가 된다.
- Rapier 주행 중 공력 텔레메트리가 양수이며, 엔진 브레이크 코스트다운에서 속도가 감소한다.
- 직선 가속·코스트다운·공력 스케일·유한 상태 검증이 모두 통과한다.
- 기존 조향, 제동, 표면 그립, 회전 관성 회귀와 브라우저 E2E를 보존한다.

## 제외 범위

- 실제 차량별 CFD 계수 보정과 DRS/액티브 에어로
- 실제 트랙 높이·연석·충돌·차량 손상
- 타이어 열·마모·압력, 디퍼렌셜, AI·퀄리파잉·레이스 운영

## 검증 결과 (2026-07-19)

`ARCHIFY_HOME=/private/tmp/s1-archify/archify npm run verify` 기준 타입 검사, 14개 테스트 파일의 36개 단위 테스트, 아키텍처 JSON/HTML, 프로덕션 빌드, 브라우저 E2E 4개가 통과했다. 기존 Rapier 초기화 deprecation 및 번들 크기 경고는 남아 있지만 실패 원인은 아니다.

## 종료 산출물

- [Roadmap](./ROADMAP.md)에서 1D·1E를 완료로 표시한다.
- [Decisions](./DECISIONS.md)에 구동계·공력 경계를 기록한다.
- [아키텍처 원본](./architecture/s1-racing-foundation.architecture.json)과 [HTML](./architecture/s1-racing-foundation.html)을 함께 갱신한다.
- 다음 단계는 1F 입력 프리셋·트랙 콘텐츠이며, 이후 AI·레이스 운영으로 확장한다.
