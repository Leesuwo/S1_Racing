# S1 Racing

브라우저에서 실행되는 오픈휠 레이싱 게임 프로젝트입니다. 그래픽보다 주행감과 검증 가능한 차량 물리를 우선합니다.

## 현재 단계

**Physics Prototype v0.1**

Milestone 0 기반 위에 120Hz 고정 스텝 차량 물리, 테스트 트랙, 키보드·마우스 입력, 추적 카메라, 텔레메트리 HUD를 구현했습니다. 타이어 열화·Rapier 충돌·AI·레이스 운영은 아직 구현하지 않습니다.

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

## 검증 명령

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Playwright 브라우저가 설치되지 않은 경우 최초 1회 다음을 실행합니다.

```bash
npx playwright install chromium
```

## 문서

- `AGENTS.md`: Codex 작업 규칙
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
- `docs/DECISIONS.md`: 결정 이력
- `docs/architecture/`: Archify 아키텍처 원본 JSON과 생성 HTML

## 다음 마일스톤

Milestone 1A — 고정 스텝 차량 물리의 자동 검증과 차체·서스펜션 모델 고도화입니다. 이후 타이어 열화와 Rapier 충돌을 한 번에 추가하지 않고 검증 가능한 단위로 확장합니다.

## 아키텍처 다이어그램

```bash
npm run architecture:check
```

원본은 [S1 Racing Foundation Architecture](./docs/architecture/s1-racing-foundation.architecture.json), 검토용 산출물은 [HTML 다이어그램](./docs/architecture/s1-racing-foundation.html)입니다.
