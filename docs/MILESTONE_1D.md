# Milestone 1D — Drivetrain

상태: 완료. 차체 회전 관성 수정과 구동계 명령의 Rapier 휠 회전 이관을 구현하고 회귀 검증했다.

## 목표

현재 Milestone 1C는 휠별 타이어 힘을 Rapier 차체의 실제 접지점에 적용한다. Milestone 1D에서는 엔진 출력과 후륜 휠 회전을 하나의 검증 가능한 구동계 경계로 연결한다.

완료 후 차량은 기어비와 RPM에 따라 가속감이 달라지고, 후륜 접지 상태가 구동력에 반영되며, 스로틀을 놓았을 때 엔진 브레이크로 감속한다.

## 현재 선행 수정

Rapier 차체 collider가 `setDensity(0)`으로 생성되어 차체 질량은 780kg이지만 주 관성 모멘트가 0으로 계산되는 문제가 있었다. 그 결과 접지점에 횡방향 타이어 힘이 발생해도 Y축 yaw가 변하지 않았다.

현재 기준 구현은 차체 collider의 체적에 맞춰 `config.massKg / colliderVolume` 밀도를 적용한다. 이를 통해 차체 질량은 780kg으로 유지하면서 유효한 회전 관성이 생성된다.

구동계는 순수 [`Drivetrain`](../src/game/physics/Drivetrain.ts) 명령으로 분리했다. 후륜 구동 토크와 엔진 브레이크 토크를 Rapier에 전달하고, Rapier가 반환한 후륜 각속도를 다음 고정 스텝의 RPM 피드백으로 사용한다.

회귀 기준:

- 정지 상태에서 조향만 입력하면 차량은 회전하지 않는다.
- 주행 중 우회전 조향과 후륜 구동을 함께 적용하면 Rapier quaternion과 Y축 angular velocity가 우회전 방향으로 변한다.
- `physicsYawToThreeYaw` 변환이 물리 yaw를 Three.js 차량 모델의 회전으로 전달한다.
- 같은 휠 속도에서 1단과 8단의 RPM·구동 토크가 기어비에 따라 달라진다.
- 스로틀을 놓은 주행 상태에서는 엔진 브레이크 토크가 발생하고 정지 상태에서는 발생하지 않는다.

## 구현 범위

### 토크와 RPM

- 기존 8단 기어와 기어비를 토크 커브 계산에 연결한다.
- 엔진 RPM은 차량 속도 추정값만 사용하지 않고 구동 휠 회전 속도 피드백을 반영한다.
- 엔진 토크, 최종 감속비, 구동계 효율, 휠 반지름으로 후륜 구동 토크를 계산한다.
- RPM·토크 계산은 기존 120Hz 고정 스텝 경계 안에서 결정적으로 수행한다.

### 후륜구동과 휠 회전

- `VehicleSimulation`은 현재 기어·스로틀·RPM을 바탕으로 구동계 명령을 만든다.
- `RapierChassisSuspension`은 후륜별 휠 각속도, 슬립, 접지점 종력을 적분한다.
- 구동 토크는 후륜 두 바퀴에 분배하고, 타이어 종력이 접지점에서 차체에 전달되도록 한다.
- 휠 회전 방향과 차량 전진 방향이 어긋나지 않도록 `-Z` 전방 좌표계와 부호 규칙을 유지한다.

### 엔진 브레이크와 변속

- 스로틀을 놓고 구동 휠이 회전 중일 때 엔진 브레이크 토크를 적용한다.
- 정지 상태에서는 엔진 브레이크가 차량을 임의로 움직이지 않도록 한다.
- 현재 수동 변속 입력(`E/Q`, 좌·우 클릭)은 유지하고, 변속 시 RPM과 휠 토크가 연속적으로 바뀌도록 한다.
- 저속 분모 보호, 토크 포화, NaN·Infinity 방어를 유지한다.

## 데이터 흐름과 경계

```text
BrowserVehicleInput
  → VehicleControlInput
  → VehicleSimulation: 기어·RPM·엔진 토크 명령
  → RapierChassisSuspension: 후륜 휠 토크·엔진 브레이크·타이어 힘
  → Rapier 차체 pose / 휠 각속도
  → VehicleSimulation 렌더 스냅샷·텔레메트리
```

물리 계층은 React, React Three Fiber, Zustand, DOM을 import하지 않는다. Rapier가 차체의 X/Z 위치·속도·yaw를 소유하고, React는 읽기 전용 스냅샷과 텔레메트리만 표시한다.

아키텍처 원본과 검토용 산출물은 [`docs/architecture/s1-racing-foundation.architecture.json`](./architecture/s1-racing-foundation.architecture.json)과 [`s1-racing-foundation.html`](./architecture/s1-racing-foundation.html)에서 함께 관리한다.

## 합격 기준

- 토크 커브가 RPM 구간별로 유한하고 단조롭게 보간된다.
- 기어가 바뀌면 같은 차량 속도에서 엔진 RPM과 휠 토크가 기어비에 맞게 달라진다.
- 스로틀 입력으로 후륜 휠 각속도와 차량 전진 속도가 함께 증가한다.
- 후륜 종방향 타이어 힘이 실제 접지점에 적용되고 슬립 제한을 넘지 않는다.
- 스로틀 해제 후 엔진 브레이크로 속도가 감소한다.
- 우회전 주행에서 Rapier yaw와 화면 차량 회전이 같은 방향으로 변한다.
- 정지 상태 조향, 짧은 조향 후 안정화, 브레이크 감속, 표면별 그립 차이 기존 기준을 보존한다.
- 모든 단위 테스트, 프로덕션 빌드, 브라우저 E2E가 통과한다.

## 제외 범위

- 실차 Magic Formula 계수와 실제 차량 데이터 보정
- 타이어 온도·마모·공기압·노면 진화
- 디퍼렌셜과 좌우 토크 벡터링
- 실제 트랙 높이·연석·충돌·차량 손상
- 공력 세부 모델과 AI·퀄리파잉·레이스 운영

## 검증 명령

```bash
npm run typecheck
npm test
npm run architecture:check
npm run build
npm run test:e2e
npm run verify
```

`architecture:check`에 필요한 Archify가 설치되지 않은 환경에서는 해당 단계의 원인을 별도로 기록하고, 나머지 검증 결과와 함께 보고한다.

## 현재 회귀 검증 결과 (2026-07-19)

`ARCHIFY_HOME=/private/tmp/s1-archify/archify npm run verify` 기준으로 다음 단계가 모두 통과했다.

| 단계 | 결과 |
| --- | --- |
| 타입 검사 | 통과 |
| 단위 테스트 | 14개 파일, 36개 테스트 통과 |
| 아키텍처 원본 검증·HTML 렌더링 | 통과 |
| 프로덕션 빌드 | 통과 (기존 번들 크기 경고 유지) |
| 브라우저 E2E | 4개 통과 |

기본 환경에는 Archify가 전역 설치되어 있지 않아 `ARCHIFY_HOME` 지정 없이 실행하면 아키텍처 단계에서 중단된다. 테스트 중 Rapier 초기화 deprecation 경고는 기존 경고이며 실패 원인이 아니다.

## 마일스톤 종료 시 문서 갱신

이 마일스톤을 닫을 때는 다음 산출물을 한 번에 갱신한다.

- 이 문서에 실제 구현 범위와 검증 결과를 추가한다.
- `docs/ROADMAP.md`의 1D 상태와 링크를 갱신한다.
- 구조·물리 결정은 `docs/DECISIONS.md`에 기록한다.
- 모듈 경계나 데이터 흐름이 바뀌면 `docs/architecture/s1-racing-foundation.architecture.json`과 생성된 HTML을 함께 갱신한다.
- `npm run verify`를 실행하고, Archify 등 환경 의존성으로 막힌 단계는 원인과 나머지 결과를 남긴다.
