---
name: s1-racing-game-studio
description: Use for S1 Racing browser-game work involving React Three Fiber, Three.js, WebGL scenes, HUDs, camera and asset pipelines, browser playtests, or runtime library decisions.
---

# S1 Racing Game Studio

이 스킬은 S1 Racing의 게임 제작 작업을 공식 `game-studio` 전문 스킬과 연결하고, 저장소의 물리·렌더링·검증 경계를 보존한다. `AGENTS.md`의 공통 규칙을 대체하지 않으며, 게임 관련 변경의 작업 순서와 완료 기준을 구체화한다.

## Stack decisions

- 현재 스택은 React + React Three Fiber + Three.js + `@dimforge/rapier3d-compat`이다. 기존 스택을 우선 사용한다.
- R3F는 장면 조합과 렌더링 경계에 사용하고, 텍스트 중심 HUD·메뉴·설정은 DOM으로 유지한다.
- `@react-three/drei`는 GLTF 로더, 카메라, 환경, 반복 보조 코드가 실제로 줄어드는 경우에만 사용한다.
- Phaser, PixiJS, Babylon.js, PlayCanvas로의 엔진 전환은 별도 마일스톤과 결정 로그 없이 수행하지 않는다.
- `@react-three/rapier`로 교체하지 않는다. 현재 물리 브리지는 `@dimforge/rapier3d-compat`이며, 교체는 물리 검증 계획을 포함한 별도 설계 작업이다.
- 오디오에는 Howler, 멀티플레이에는 Colyseus를 각각 해당 기능 마일스톤에서만 검토한다.

## Architecture guardrails

- 물리 계층은 React, R3F, Zustand에 의존하지 않는다. 렌더러는 물리 상태를 소유하지 않고 읽기 전용 스냅샷을 표시한다.
- 차량 물리는 고정 120Hz를 목표로 하며, 고주파 시뮬레이션이 광범위한 React 상태 갱신을 유발하지 않게 한다.
- 플레이어와 AI는 동일한 `VehicleControlInput` 경계를 사용한다. AI에 순간이동·숨은 그립·출력 보너스를 추가하지 않는다.
- 좌표계는 +X 오른쪽, +Y 위, -Z 전방이며 내부 단위는 radian, m, s, kg, N, N·m이다.
- 저속 0 나눗셈, NaN, Infinity를 방어하고, 확인되지 않은 수치는 `initial_assumption` 또는 `simulation_required`로 표시한다.

## Workflow and validation

1. `AGENTS.md`, 관련 `docs/DECISIONS.md`, 아키텍처 문서, `package.json`을 먼저 읽는다.
2. production dependency를 추가하기 전에 기존 의존성으로 해결 가능한지 확인하고, 필요성·버전·라이선스·영향을 `docs/DECISIONS.md`에 기록한다.
3. `package.json`, 공통 입력 경계, 물리 스냅샷, `AGENTS.md`, 아키텍처 산출물은 Lead가 소유권을 예약한 경우에만 수정한다.
4. HUD·입력·카메라·자산 로딩처럼 사용자에게 보이는 동작을 변경하면 Playwright E2E와 필요한 스크린샷·시각 증거를 갱신한다.
5. 모듈 경계나 데이터 흐름을 변경하면 `docs/architecture/`의 JSON·HTML을 갱신하고 `npm run architecture:check`를 실행한다.
6. 모든 변경의 완료 게이트는 `npm run verify`다. 실패한 상태를 완료로 보고하지 않는다.

## Official game-studio routing

- `react-three-fiber-game`: R3F 장면 구성, Canvas/DOM 경계, 렌더링 성능 판단.
- `game-playtest`: 브라우저 입력, HUD, 카메라, WebGL 장면, 자산 로딩, 플레이테스트 QA.
- `game-ui-frontend`: 플레이필드를 가리지 않는 저크롬 HUD와 메뉴 UI.
- `web-game-foundations`: 스택·자산·시뮬레이션 경계를 바꾸는 기반 설계 작업.

현재 레포의 Rapier 구현은 공식 `game-studio`의 일반적인 `@react-three/rapier` 권고보다 우선한다.

## Commenting standard

- 게임 로직·함수·비자명 변수에는 주석을 적극적으로 추가한다. 주석은 코드의 `what`을 반복하지 말고, 물리 공식·단위·불변식·입력 이벤트 순서·브라우저 우회·성능 선택의 `why`를 설명한다.
- export 경계에는 목적·입출력·부작용·실패 조건을 TSDoc으로 남기고, 비자명 상수에는 단위·출처·가정과 수치의 의미를 적는다.
- 주석은 미래 동료에게 말하듯 구체적이고 담백하게 쓴다. 한국어를 기본으로 하되 식별자와 표준 기술 용어는 원문을 유지한다. `이 함수는 ~한다` 같은 기계적 문장, 한 줄마다 반복하는 해설, 근거 없는 추측은 금지한다.
- 코드 변경 시 주석의 정확성을 함께 검토한다. 이유를 모르면 만들어내지 말고 `initial_assumption`·`simulation_required` 또는 결정 로그를 사용한다.

## Completion report

완료 보고에는 변경 파일, 추가한 의존성과 선택 이유, 실행한 검증 명령과 결과, 주석을 추가·갱신한 의도, 남은 위험, 다음 단일 마일스톤을 포함한다.
