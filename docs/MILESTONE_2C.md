# Milestone 2C — Qualifying

## 상태

완료 — 2026-07-27

## 목표

퀄리파잉 기록을 레이스 물리에서 분리하고, 유효한 최고 랩타임으로 결정적인 Q1/Q2/Q3 컷과 최종 그리드 순서를 만든다.

## 구현 범위

- `QualifyingSession`이 20대 참가자와 현재 단계 기록을 관리한다.
- 양의 유한 시간과 `valid: true`인 랩만 최고 기록에 반영한다.
- `s1-racing-qualifying-v1` 규칙으로 Q1 20→15, Q2 15→10, Q3 10 최종 순위를 적용한다.
- 단계별 순위·탈락자·유효/무효 랩 카운트를 스냅샷으로 보존한다.
- 최종 Q3 순위와 Q2/Q1 탈락 순서를 RaceSession의 레이스 그리드 순서로 전달한다.
- UI에서 퀄리파잉 실행과 유효 랩 규칙을 표시한다.

## 제외 범위

실제 차량이 랩을 완주하며 트랙 리밋을 판정하는 주행 타이밍, 섹터 델타, 레드 플래그, 실제 규정 자동 업데이트는 후속 범위다. 현재 UI의 자동 기록은 규칙·상태 전이를 검증하기 위한 결정적 프로토타입 시나리오다.

## 변경 파일

- `src/gameplay/race/QualifyingSession.ts`
- `src/gameplay/race/QualifyingSession.test.ts`
- `src/gameplay/race/RaceWeekendSession.ts`
- `src/app/RaceWeekendPanel.tsx`
- `src/app/App.tsx`

## 합격 기준과 검증

- 유효 랩만 최고 기록이 되는지 검증: `QualifyingSession.test.ts`
- Q1/Q2/Q3 컷과 최종 그리드 결정성 검증: `QualifyingSession.test.ts`
- Practice 이후 퀄리파잉 결과·단계 전환 검증: `RaceWeekendSession.test.ts`
- 브라우저에서 세 컷과 유효 랩 설명 표시: `tests/e2e/smoke.spec.ts`
- 전체 완료 게이트: `npm run verify`

## 다음 단계

M2D에서 Practice→Qualifying→Race→Results 흐름과 타이어 선택·최소 피트 전략 경계를 묶는다.
