# Milestone 2D — Race weekend and strategy

## 상태

완료 — 2026-07-27

## 목표

다차량 레이스 세션과 퀄리파잉을 하나의 레이스 주말 상태 기계와 브라우저 흐름으로 묶고, 이후 타이어 모델이 사용할 최소 전략 계약을 고정한다.

## 구현 범위

- `RaceWeekendSession`이 Practice, Qualifying, Race, Results 단계를 관리한다.
- 퀄리파잉 최종 순서를 레이스 시작 그리드에 반영한다.
- 시작 타이어와 다른 컴파운드로 1회 정지하는 최소 피트 전략을 검증한다.
- 타이어 선택·피트 랩·피트 컴파운드 입력을 레이스 시작 전에만 변경한다.
- `Race Weekend` UI에서 다차량 순위, Q 컷, 전략과 리셋을 확인한다.

## 제외 범위

타이어 열·마모·공기압·노면 진화, 실제 피트 레인·피트 시간·차량 물리, 트랙 리밋·충돌·손상, 온라인 멀티플레이는 후속 설계 대상이다. 현재 전략은 규칙 경계만 결정하며 성능 보너스를 차량 물리에 적용하지 않는다.

## 변경 파일

- `src/gameplay/race/RaceWeekendSession.ts`
- `src/gameplay/race/RaceWeekendSession.test.ts`
- `src/app/RaceWeekendScene.tsx`
- `src/app/RaceWeekendPanel.tsx`
- `src/app/App.tsx`
- `src/styles.css`
- `tests/e2e/smoke.spec.ts`

## 합격 기준과 검증

- Practice→Qualifying→Race 단계 전환: `RaceWeekendSession.test.ts`
- 시작 컴파운드와 다른 피트 컴파운드·유효 랩 검증: `RaceWeekendSession.test.ts`
- 주말 리셋으로 Q1과 레이스 그리드 복원: `RaceWeekendSession.test.ts`
- 실제 브라우저에서 퀄리파잉 실행, 레이스 시작, 20대 순위, 주말 리셋: `tests/e2e/smoke.spec.ts`
- 전체 완료 게이트: `npm run verify`

## 다음 단일 마일스톤

M3A — Track limits and contact model: 실제 트랙 리밋·벽·차량 접촉을 추가하되, 이번 단계의 순수 세션·공통 입력 경계를 보존한다.
