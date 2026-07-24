# S1 Racing Development Instructions

## Product priority

1. 주행감
2. 결정적이고 검증 가능한 차량 물리
3. 입력 반응성
4. AI 레이싱 품질
5. 성능
6. 그래픽

그래픽 품질을 위해 물리 안정성이나 입력 반응성을 희생하지 않는다.

## Current implementation stage

Milestone 1F — Input presets and test track을 완료했고, 현재는 `Milestone 2A-0 — AI Training Circuit & Evaluator`를 진행 중이다. `Milestone 2A — Single AI opponent`는 M2A-0 인수 이후에 시작한다.

현재 프로토타입에는 다음이 포함된다:

- 순수 TypeScript 2D 평면 차량 물리
- 120Hz 고정 스텝 실행과 렌더링 보간
- 가속·제동·조향·8단 기어·RPM
- 아스팔트·잔디 표면 그립 차이
- 테스트 트랙·추적 카메라·텔레메트리 HUD
- 키보드·Pointer Lock 마우스·게임패드·휠 입력 프리셋
- 데이터 기반 테스트 트랙 구간·노면·브레이크 마커·체크포인트·경계 판정

이 프로토타입의 수치는 `initial_assumption`이며 실제 특정 차량을 재현하는 값으로 표현하지 않는다.

## Milestone 0 scope (completed baseline)

Milestone 0은 Project Foundation이다. 이번 단계에는 차량 물리, AI, 퀄리파잉, 레이스, 실제 트랙 콘텐츠를 구현하지 않는다.

포함 범위:

- Vite + React + TypeScript 실행 기반
- strict TypeScript 설정
- WebGL2 지원 검사
- 최소 Three.js/R3F 캔버스 셸
- Page Visibility 기반 일시정지 상태
- `VehicleControlInput` 경계 인터페이스
- 고정 스텝 계산 골격
- 단위 테스트, 프로덕션 빌드, 브라우저 smoke test
- 구현 명세와 검증 계획 문서

## Milestone 1F scope (completed)

Milestone 1F에서는 공통 `VehicleControlInput` 경계를 유지하면서 입력 프리셋과 반복 가능한 테스트 트랙 콘텐츠를 추가했다. AI·다차량·퀄리파잉·레이스 운영은 다음 기능 단계의 범위다.

## Architecture

- 물리 계층은 React, React Three Fiber, Zustand에 의존하지 않는다.
- 렌더링은 물리 상태를 직접 소유하지 않고 읽기 전용 스냅샷을 표시한다.
- 차량 물리는 고정 120Hz를 목표로 한다.
- AI는 플레이어와 동일한 `VehicleControlInput` 경계를 사용한다.
- AI가 차량을 순간이동하거나 숨겨진 그립·출력 보너스를 받게 하지 않는다.
- 튜닝 가능한 값은 타입이 있는 설정 파일에 둔다.
- 트랙별 예외를 범용 AI 컨트롤러에 하드코딩하지 않는다.

## Commenting policy

- 모든 소스 파일에는 파일의 목적과 모듈 경계를 설명하는 주석을 둔다.
- 모든 코드 요소와 블록(상수·변수·필드, 타입·인터페이스, 함수·클래스, 조건·반복, 예외 처리, 외부 호출)에는 목적·역할·이유를 설명하는 주석을 작성한다.
- 모든 `export` 타입·함수·클래스에는 TSDoc 또는 동등한 설명을 작성한다.
- 변수·상태 필드에는 역할, 단위, 수명, 소유권 또는 유효 범위를 설명하는 주석을 작성한다.
- 물리 공식, 좌표계 변환, 상태 전이, 방어 로직에는 결과가 아니라 설계 이유를 주석에 작성한다.
- 튜닝 수치는 단위와 함께 기록하고, 검증되지 않은 값은 `initial_assumption` 또는 `simulation_required`와 근거를 주석에 남긴다.
- 테스트 코드에도 검증하는 사용자 동작·물리 불변식·경계 조건과 주요 픽스처 변수의 목적을 주석으로 설명한다.
- 단순 코드도 주석을 생략하지 않는다. 단, 같은 설명을 여러 줄에 반복하지 말고 가장 좁은 공통 선언·블록에 한 번 작성한다.
- 코드 동작이나 수치가 변경되면 관련 주석도 함께 갱신한다.

## Project-local Codex skill

- 프로젝트 전용 게임 스킬은 `.agents/skills/s1-racing-game-studio/SKILL.md`에 둔다.
- React/R3F/Three.js/WebGL, HUD, 카메라, 자산 로딩, 브라우저 플레이테스트, 게임 라이브러리 의사결정에는 이 스킬을 사용한다.
- 이 스킬은 공식 `game-studio` 전문 스킬을 라우팅하지만, S1 Racing의 직접 Rapier 브리지와 `npm run verify` 완료 게이트를 우선한다.
- `.agents/`에는 프로젝트 지침만 두며 글로벌 인증 정보, 영구 훅, 개인별 설정을 복사하지 않는다.

## Code comments and documentation

- 로직·함수·변수에는 주석을 적극적으로 활용한다. 단, 목표는 주석 줄 수가 아니라 미래의 유지보수자가 코드만 보고는 알기 어려운 의도와 제약을 빠르게 이해하는 것이다.
- export된 함수·타입·설정값과 외부에서 호출되는 경계에는 목적, 입력·출력 계약, 부작용, 단위·좌표계, 실패 조건을 TSDoc으로 기록한다. 이름만 반복하는 설명은 생략한다.
- 복잡한 로직은 블록 단위로 주석을 붙인다. 특히 차량 물리 공식, 수치 안정화, 고정 스텝 순서, 보간·스냅샷, 입력 이벤트 순서, Pointer Lock·포커스·정리, 브라우저 우회 처리는 “무엇”보다 “왜 이 방식이어야 하는가”와 불변식을 설명한다.
- 비자명 변수·상수에는 단위, 생명주기, 출처, 매직 넘버의 의미를 주석으로 남긴다. 자명한 반복문·대입·조건문을 한 줄씩 해설하지 않는다.
- 주석은 미래의 동료에게 말하듯 구체적이고 담백하게 쓴다. 한국어를 기본으로 하되 API·라이브러리·수학 용어와 식별자는 원문을 유지하고, `이 함수는 ~한다`, `변수를 선언한다` 같은 기계적인 문장과 홍보성 표현은 피한다.
- 주석을 붙이기 전에 이름 변경·함수 분리로 코드를 더 읽기 쉽게 만들 수 있는지 확인한다. 그래도 남는 설계 의도·제약·실험 결과·거부한 대안을 주석으로 보존한다.
- 코드가 바뀌면 해당 주석도 함께 검토·갱신한다. 근거 없는 추측을 주석으로 확정하지 말고, 값이 가정이면 `initial_assumption` 또는 `simulation_required`로 표시하며 결정은 `docs/DECISIONS.md`를 참조한다.
- AI 에이전트는 로직·함수·비자명 변수 변경 시 관련 주석을 추가하거나 갱신하고, 완료 보고에 주석을 추가한 이유와 검토 범위를 적는다. 줄마다 주석을 생성하거나 오래 남을 `TODO`를 작업 큐 대신 사용하지 않는다.

## Workflow

- 작은 검토 가능한 마일스톤으로 작업한다.
- 여러 에이전트를 사용할 때는 `docs/agent-orchestration/README.md`와 `docs/agent-orchestration/roles/*.md`의 작업 패킷, 파일 소유권, QA 보고 형식을 따른다. 프로젝트 custom agent 설정은 `.codex/agents/*.toml`을 목표 위치로 하며, 현재 실행 환경에서는 템플릿만 검토한다. 게임 관련 작업은 `.agents/skills/s1-racing-game-studio/SKILL.md`의 스택·검증 규칙도 적용한다.
- 기본 병렬 배치는 구현 에이전트 1개와 읽기 전용 QA 1개다. 파일 소유권이 겹치지 않는 독립 작업만 최대 3개까지 병렬 실행한다.
- `src/app/**`, `package.json`, 공통 입력 경계, 물리 스냅샷, `docs/architecture/**`는 Lead가 명시적으로 예약하지 않으면 병렬 수정하지 않는다.
- 모든 코드·문서 변경 후 `npm run verify`를 실행한다. 이 명령은 타입 검사, 단위 테스트, 아키텍처 검증, 프로덕션 빌드, 브라우저 E2E를 순서대로 실행한다.
- `npm run test:e2e`는 선택 검사가 아니다. 사용자에게 보이는 기능·입력·HUD·흐름을 변경하면 해당 동작을 검증하는 E2E 시나리오를 추가하거나 갱신한 뒤 실행한다.
- E2E가 환경 문제로 실행되지 않으면 완료로 표시하지 않고, 실패 원인과 사용자가 확인해야 할 항목을 명시한다.
- GitHub Actions의 `Required verification` 워크플로와 로컬 `npm run verify`는 같은 완료 기준을 사용한다.
- 마일스톤의 완료 조건을 통과하면 변경 사항을 하나의 의도적인 커밋으로 남기고, 현재 작업 브랜치를 `origin`에 푸시한다. 푸시 실패는 완료가 아니라 배포·동기화 보류 상태로 보고한다.
- 모듈 경계나 데이터 흐름을 변경하면 `docs/architecture/`의 Archify JSON과 HTML을 함께 갱신하고 `npm run architecture:check`를 실행한다.
- 테스트가 통과하기 전 다음 기능 단계로 넘어가지 않는다.
- 주요 설계 결정은 `docs/DECISIONS.md`에 기록한다.
- 현재 동작을 보존하고, 요청 범위를 넘어서는 의존성·기술 스택 변경을 하지 않는다.
- 새 production dependency가 필요하면 기존 의존성으로 해결할 수 있는지 먼저 확인하고 이유를 기록한다.

## Physics conventions

- +X는 오른쪽, +Y는 위, -Z는 차량 전방이다.
- 내부 각도는 radian, 거리 m, 시간 s, 질량 kg, 힘 N, 토크 N·m을 사용한다.
- 저속 0 나눗셈, NaN, Infinity를 방어한다.
- 실제 차량 값으로 확인되지 않은 수치는 `initial_assumption` 또는 `simulation_required`로 표시한다.

## Safety and licensing

- API 키와 비밀값을 커밋하지 않는다.
- 공식 F1 로고, 팀 정체성, 드라이버 이름, 리버리, 복제 트랙 자산을 사용하지 않는다.
- 외부 자산은 `docs/ASSET_LICENSE_REGISTER.md`에 출처와 라이선스를 기록한다.

## Completion reporting

작업 완료 보고에는 변경 파일, 실행 명령과 결과, 완료 기준, 남은 위험, 다음 단일 마일스톤을 포함한다.

## Architecture diagrams

- 시스템 구조·의존성·데이터 흐름은 `docs/architecture/*.architecture.json`을 원본으로 관리한다.
- 생성된 HTML은 검토·공유용 산출물이며 JSON과 함께 커밋한다.
- Archify 렌더러가 계산하는 배치와 검증 오류를 우선 사용하고, 생성된 SVG를 수동으로 수정하지 않는다.
- 구조 변경이 없는 기능 작업에서는 다이어그램을 불필요하게 갱신하지 않는다.
