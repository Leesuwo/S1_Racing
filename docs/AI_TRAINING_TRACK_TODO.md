# TODO — AI Training Circuit & Deterministic Evaluator

## 작업 정보

- 마일스톤: M2A-0
- 상태: 진행 중 — Northfield GP 트랙·저속 탈출 시나리오 구현 완료, 결과 파일 저장과 최종 게이트 남음
- 선행 조건: M1F 완료, M2A 작업 트리 검토 결과 확보
- 기본 실행 모드: `serial`
- 기본 담당: Gameplay 구현 담당 + Track 담당 + QA
- 완료 게이트: `npm run verify`

이 문서는 [AI 교육 트랙 PRD](./AI_TRAINING_TRACK_PRD.md)의 실행 큐다. 구현 에이전트는 소유 파일만 수정하고, Lead가 예약하지 않은 `src/app/**`, 공통 입력 경계, 물리 스냅샷, `package.json`, `docs/architecture/**`를 수정하지 않는다.

## Phase 0 — 계약 고정

- [x] `M2A-0-DOC`: PRD의 데이터·평가 지표·제외 범위를 `docs/AI_SPEC.md`와 `docs/TRACK_SPEC.md`에 반영한다.
  - 소유 파일: `docs/AI_SPEC.md`, `docs/TRACK_SPEC.md`
  - 합격 기준: AI 교육과 실제 레이스 통합의 경계가 문서에서 분리된다.
- [x] `M2A-0-DECISION`: 독창 트랙·결정적 튜닝·초기 ML 제외 결정을 `docs/DECISIONS.md`에 기록한다.
  - 소유 파일: `docs/DECISIONS.md`
  - 합격 기준: Silverstone 참고는 특성 분석에만 사용한다는 경계가 명시된다.

## Phase 1 — 독창 트레이닝 트랙

- [x] `M2A-0-TRACK-DATA`: 가칭 `Northfield GP` 트랙 데이터 스키마와 독창 레이아웃을 설계한다.
  - 소유 파일: `src/tracks/**`, `docs/AI_TRAINING_TRACK_PRD.md`
  - 필수 데이터: 중심선, 폭, 곡률, 표면, 섹터, 체크포인트, 시작 포즈, 레이싱 라인, 목표 속도, 제동점
  - 금지: 실제 Silverstone 좌표·코너 순서·코너명·시설·브랜딩 전사
  - 합격 기준: 현재 `TestTrackDefinition`과 물리 표면 샘플러가 공유할 수 있는 타입 경계가 유지된다.
- [x] `M2A-0-TRACK-VISUAL`: 외부 자산 없이 트레이닝 트랙의 디버그 월드 표시를 추가한다.
  - 소유 파일: `src/world/**`, `src/styles.css`는 Lead 예약 후 수정
  - 합격 기준: 레이싱 라인·브레이크 포인트·섹터·체크포인트가 시각적으로 구분된다.
- [x] `M2A-0-TRACK-TEST`: 트랙 순서·경계·표면·리셋·레이싱 라인 반복성을 검증한다.
  - 소유 파일: `src/tracks/*.test.ts`
  - 합격 기준: 같은 데이터에서 같은 샘플·체크포인트 순서·목표 속도 프로파일이 나온다.

## Phase 2 — 결정적 교육 실행기

- [x] `M2A-0-RUNNER`: 브라우저와 분리된 120Hz 고정 스텝 에피소드 실행기를 만든다.
  - 제안 파일: `src/gameplay/training/AITrainingRunner.ts`
  - 합격 기준: `VehicleSimulation`과 동일한 물리 경로를 사용하고 차량 위치를 직접 대입하지 않는다.
- [x] `M2A-0-METRICS`: 랩 시간, 이탈 횟수, 횡오차 RMS/P95, 목표 속도 오차, 제동 초과량, 입력 채터링, 결정성 해시를 수집한다.
  - 제안 파일: `src/gameplay/training/AITrainingMetrics.ts`
  - 합격 기준: 모든 수치가 유한하고 에피소드 종료 이유를 보존한다.
- [x] `M2A-0-EVALUATOR`: 직선·강제동·복합 코너·저속 탈출·전체 랩 커리큘럼을 평가한다.
  - 제안 파일: `src/gameplay/training/AITrainingEvaluator.ts`
  - 합격 기준: 시나리오별 결과와 전체 결과를 같은 입력으로 재현할 수 있다.
- [x] `M2A-0-TUNING`: AI lookahead·조향 이득·목표 속도·제동 미리보기 설정을 제한된 탐색으로 비교한다.
  - 수정 후보: `src/gameplay/ai/**`, `src/gameplay/training/**`
  - 합격 기준: 선택된 설정 스냅샷과 평가 결과가 UI에서 재현 가능하고, 적용 전후 결정성 해시를 비교할 수 있다.
  - 주의: 새 ML·최적화 production dependency를 추가하지 않는다.

## Phase 3 — 개발자 검증 화면

- [x] `M2A-0-HUD`: 개발 모드에서 현재 AI 목표점, 목표 속도, 제동 상태, 횡오차, 평가 상태를 표시한다.
  - 소유 파일: Lead가 예약한 `src/app/**` 및 `src/styles.css`
  - 합격 기준: HUD는 읽기 전용 스냅샷만 표시하고 물리 상태를 소유하지 않는다.
- [x] `M2A-0-E2E`: 교육 트랙 로딩, AI 주행, 제동점 통과, 리셋, 결정성에 대한 브라우저 시나리오를 추가한다.
  - 소유 파일: `tests/e2e/**`
  - 합격 기준: 사용자에게 보이는 트랙·HUD·흐름 변경이 자동 검증된다.

## Phase 4 — QA 및 인수

- [x] `M2A-0-ARCH`: 모듈 경계·데이터 흐름이 바뀌면 Archify JSON과 HTML을 함께 갱신한다.
  - 소유 파일: `docs/architecture/**`
  - 합격 기준: `npm run architecture:check` 통과
- [x] `M2A-0-VERIFY`: 타입 검사, 단위 테스트, 아키텍처 검사, 빌드, E2E를 실행한다.
  - 실행 명령: `npm run verify`
  - 합격 기준: 전체 명령 성공. 환경 오류로 E2E가 실행되지 않으면 완료로 표시하지 않는다.
- [x] `M2A-0-REPORT`: 변경 파일, 검증 결과, 남은 위험, 다음 단일 마일스톤을 `PROJECT_STATUS.md`와 결과 보고에 반영한다.

## 이후 순서

1. M2A-0 — AI 교육 트랙과 결정적 평가기
2. M2A — 단일 AI 상대 통합 및 주행감 튜닝
3. M2B — 다차량 레이스 세션

## 보류 항목

- [ ] 실제 Silverstone 라이선스 확보 전 레이아웃·브랜드·시설 복제
- [ ] 신경망·강화학습 도입
- [ ] 추월·방어·충돌 회피
- [ ] 퀄리파잉·레이스 전략
