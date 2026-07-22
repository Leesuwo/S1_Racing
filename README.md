# S1 Racing

브라우저에서 실행되는 오픈휠 레이싱 게임 프로젝트입니다. 그래픽보다 주행감과 검증 가능한 차량 물리를 우선합니다.

## 현재 단계

**Milestone 1F — Input presets and test track**

Milestone 0 기반 위에 120Hz 고정 스텝 차량 물리, 데이터 기반 테스트 트랙, 키보드·마우스·게임패드·휠 입력 프리셋, 추적 카메라, 텔레메트리 HUD를 구현했습니다. Rapier 4륜 접지 리그에 구동계 토크·엔진 브레이크·전후 다운포스·드래그와 휠별 타이어 종·횡력을 적용합니다. AI·레이스 운영은 아직 구현하지 않습니다.

## 기술 스택

- TypeScript
- Vite
- React
- Three.js
- React Three Fiber
- Rapier 호환 패키지
- Zustand
- Vitest
- Playwright

## 시작

```bash
npm install
npm run dev
```

브라우저에서 Vite가 출력한 주소를 엽니다.

## 필수 검증

모든 변경을 완료하기 전에는 반드시 다음 명령을 실행합니다.

```bash
npm run verify
```

이 명령은 타입 검사, 단위 테스트, 아키텍처 다이어그램 검증, 프로덕션 빌드, Chromium E2E를 순서대로 수행합니다. GitHub Actions의 `Required verification`도 동일한 명령을 실행합니다.

개별 검증 명령은 다음과 같습니다.

```bash
npm run typecheck
npm test
npm run physics:validate
npm run build
npm run test:e2e
```

Playwright 브라우저가 설치되지 않은 경우 최초 1회 다음을 실행합니다.

```bash
npx playwright install chromium
```

## 문서

- `AGENTS.md`: Codex 작업 규칙
- `PROJECT_STATUS.md`, `TASKS.md`: 현재 상태와 오케스트레이션 작업 큐
- `docs/agent-orchestration/`: Lead·전문 에이전트·QA 운영 계약과 Codex 설정 템플릿
- `CODEX_START_PROMPT.md`: 다음 Codex 세션용 시작 프롬프트
- `docs/PRODUCT_SPEC.md`: 제품과 Milestone 0 범위
- `docs/PHYSICS_SPEC.md`: 차량 물리 방향
- `docs/PHYSICS_PROTOTYPE_SPEC.md`: 현재 프로토타입 구현 범위와 한계
- `docs/PHYSICS_VALIDATION_SPEC.md`: 자동 검증 계획
- `docs/VEHICLE_REFERENCE_TARGETS.md`: 기준 차량 초기 가정
- `docs/COORDINATE_AND_UNITS_SPEC.md`: 좌표계·단위·부호 규칙
- `docs/BROWSER_SUPPORT_MATRIX.md`: 브라우저·기기 지원 범위
- `docs/ARCHITECTURE.md`: 코드 경계
- `docs/ROADMAP.md`: 마일스톤 순서
- `docs/MILESTONE_1D.md`, `docs/MILESTONE_1E.md`, `docs/MILESTONE_1F.md`: 완료된 마일스톤 계약과 검증 결과
- `docs/DECISIONS.md`: 결정 이력
- `docs/architecture/`: Archify 아키텍처 원본 JSON과 생성 HTML

## 다음 마일스톤

Milestone 2A — 플레이어와 동일한 `VehicleControlInput` 경계를 사용하는 단일 AI 상대를 추가합니다. 상세 순서는 [로드맵](./docs/ROADMAP.md)을 따릅니다.

## 아키텍처 다이어그램

```bash
npm run architecture:check
```

원본은 [S1 Racing Foundation Architecture](./docs/architecture/s1-racing-foundation.architecture.json), 검토용 산출물은 [HTML 다이어그램](./docs/architecture/s1-racing-foundation.html)입니다.
