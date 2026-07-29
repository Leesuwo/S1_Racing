# design-taste-frontend HUD 리디자인 기준

## 목적과 범위

2026-07-29 기준으로 S1 Racing의 게임 HUD와 모드 전환 셸에 `design-taste-frontend` 기준을 적용한다. 이 작업은 마케팅 랜딩 페이지가 아니라 주행 중 정보를 빠르게 읽어야 하는 게임 인터페이스를 대상으로 한다.

- 대상: 상단 모드 전환, 상태 칩, 시뮬레이션 패널, 주행 텔레메트리, Training Lab 패널, Race Weekend 패널
- 보존: 차량 물리, 120Hz fixed-step, `VehicleControlInput`, AI 입력 경계, Race Weekend 상태 전이
- 제외: 외부 UI 라이브러리 도입, 실제 팀 로고·스폰서·드라이버 자산, 캔버스 렌더링 구조 변경
- 구현 방식: 기존 React와 CSS를 사용한 프로젝트 내 토큰·컴포넌트 스타일 정리

## Design Read

### 사용자와 사용 맥락

사용자는 주행 중 속도·기어·RPM·랩·차량 상태를 즉시 읽고, Training Lab과 Race Weekend의 상태를 짧은 시간 안에 판단해야 한다. 따라서 화면은 장식보다 판독성과 상태 구분을 우선한다.

### 시각 방향

`Pit Wall / Telemetry`를 기준으로 삼는다. 거의 검은 배경, 얇은 경계선, 모노스페이스 수치, 단일 민트 액센트, 제한된 경고색을 사용해 실제 레이스 엔지니어링 화면처럼 정보 계층을 만든다.

### 조정값

| 항목 | 값 | 적용 의도 |
| --- | ---: | --- |
| `DESIGN_VARIANCE` | 7 | 비대칭 좌측 규칙선과 제한된 각진 패널로 기본 대시보드와 구분 |
| `MOTION_INTENSITY` | 6 | 상태 전환과 진행 표시의 피드백은 유지하되 주행 시야를 방해하지 않도록 제한 |
| `VISUAL_DENSITY` | 7 | 텔레메트리와 운영 상태를 한 화면에 유지하되 색상 수를 줄여 우선순위를 명확히 함 |

## 사전 감사 결과

기존 화면은 이미 어두운 기술형 HUD와 충분한 상태 정보를 갖추고 있었다. 다만 모드별 카드 색상, 둥근 모서리, 상태 칩, 버튼 규칙이 분산되어 같은 제품 안에서 시각 언어가 흔들렸다. 이번 기준선은 기능을 추가하지 않고 다음 문제를 정리한다.

1. 화면 전체에 공통으로 사용할 배경·표면·경계·문자·상태 토큰이 없었다.
2. Training, Driving, Race Weekend가 청록·황색·보라색으로 각각 강조되어 기본 상태와 경고 상태가 같은 강도로 보였다.
3. 수치 정보와 설명 문장의 타이포그래피 대비가 약해 주행 중 숫자 판독 우선순위가 낮았다.
4. 버튼·탭·선택 상자의 활성·포커스·비활성 상태가 일관되지 않았다.
5. 작은 화면과 `prefers-reduced-motion` 환경에 대한 최종 스타일 기준이 뒤쪽 덮어쓰기 규칙에 흩어져 있었다.

## 디자인 토큰

토큰은 `/Users/airsupply/Documents/S1_Racing/src/styles.css`의 `--ui-*` 변수로 관리한다.

- 배경: `--ui-bg`, `--ui-bg-raised`
- 표면: `--ui-surface`, `--ui-surface-strong`
- 경계: `--ui-line`, `--ui-line-soft`
- 문자: `--ui-text`, `--ui-text-muted`, `--ui-text-dim`
- 기본 액센트: `--ui-accent`, `--ui-accent-deep`
- 의미 상태: `--ui-warn`, `--ui-danger`
- 형태: `--ui-radius-small: 4px`, `--ui-radius: 6px`

기본 액센트는 민트 하나로 제한한다. 황색은 저장·주의·최고 기록처럼 의미가 있는 상태에만 사용하고, 적색은 위험·실패 상태에만 사용한다. 모드마다 별도의 브랜드 색을 유지하지 않는다.

## 구현 내용

### 공통 셸

- 상단 바에 민트 좌측 규칙선을 두어 화면 시작점을 고정했다.
- 모드 탭은 각진 사각형과 명확한 활성 상태를 사용한다.
- 상태 칩은 기본·경고·오류의 의미를 구분하고 불필요한 pill 형태를 줄였다.
- 시뮬레이션 패널은 얇은 상단 액센트와 어두운 표면으로 캔버스와 HUD를 묶는다.

### 텔레메트리와 운영 패널

- 속도·기어·RPM·랩 등 수치는 `ui-monospace`와 tabular number로 정렬한다.
- HUD 카드와 운영 카드는 작은 반경, 얇은 경계선, 좌측 액센트로 통일한다.
- 진행 바·RPM 바·Training 지표·Race Weekend 요약 카드가 동일한 표면과 경계 토큰을 사용한다.
- 상태 설명은 muted text로 낮추고 실제 결과 수치만 높은 대비로 남긴다.

### 상호작용과 접근성

- `:focus-visible`에 민트 외곽선을 제공한다.
- `:active`는 짧은 눌림 피드백만 제공하고 레이아웃을 움직이지 않는다.
- 비활성 버튼과 선택 상자는 대비를 낮추되 상태를 식별할 수 있게 유지한다.
- `@media (prefers-reduced-motion: reduce)`에서 애니메이션·전환 시간을 사실상 제거한다.
- 기존 버튼 텍스트, ARIA 라벨, 테스트용 역할과 이름은 변경하지 않는다.

## 기술 선택과 경계

현재 `package.json`에는 Tailwind, Motion, Phosphor, Hugeicons가 없고, 이 작업은 R3F 캔버스 위에 표시되는 기존 HUD의 시각 정리다. 따라서 새 의존성을 추가하지 않고 CSS 토큰과 기존 React 구조를 사용했다. 이 선택은 번들 크기와 상태 경계를 늘리지 않는 대신, 복잡한 모션 프리셋과 아이콘 세트는 후속 작업에서 별도 검토해야 한다.

## 출처와 자산

이번 HUD 리디자인은 외부 이미지나 런타임 자산을 사용하지 않는다. 기준은 프로젝트에 설치된 기존 구조와 `design-taste-frontend` 스킬의 사전 디자인 감사·토큰·접근성 원칙을 적용해 작성했다. F1 2012 차량 이미지·기술 자료의 출처는 별도로 `docs/F1_2012_DESIGN_REFERENCE.md`와 연결된 Notion 조사 페이지에서 관리한다.

## 변경 이력

| 날짜 | 버전 | 내용 |
| --- | --- | --- |
| 2026-07-29 | 1.0 | Pit Wall / Telemetry 기준선, 공통 토큰, HUD·운영 패널, 포커스·reduced motion 규칙을 추가 |

## 검증 기록

2026-07-29 실행 결과:

- `git diff --check`: 통과
- `npm run typecheck`: 통과
- `npm test -- --run`: 30개 파일, 97개 테스트 통과
- `npm run architecture:check`: 통과
- `npm run build`: 통과. 기존 500kB 초과 청크 경고만 유지
- `npm run verify`: 타입·단위·아키텍처·빌드 통과, 브라우저 E2E 17개 중 16개 통과

남은 E2E 1건은 `completes the visible race weekend through the results stage`다. 30초 안에 `레이스 진행 중`에서 `레이스 결과`로 전환되지 않는 기존 Race Weekend 타이밍 이슈로 기록하며, 이번 HUD 스타일 변경의 완료 기준과 분리한다.
