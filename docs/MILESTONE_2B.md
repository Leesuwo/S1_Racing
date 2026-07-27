# Milestone 2B — Multi-car race session

## 상태

완료 — 2026-07-27

## 목표

여러 차량을 동일한 120Hz `VehicleSimulation` 경계에 연결하고, 그리드 스폰·랩 진행·기본 순위·세션 리셋을 결정적으로 제공한다.

## 구현 범위

- `RaceSession`이 차량별 물리 인스턴스와 AI 입력을 소유한다.
- `createRaceGrid`가 2~20대의 고유한 종·횡 방향 그리드 포즈를 생성한다.
- 각 차량의 레이싱 라인 투영 거리와 누적 랩 진행으로 기본 순위를 계산한다.
- 완료 시간, 이탈 상태, fixed-step 실행 시간과 최대 step 시간을 읽기 전용 스냅샷으로 제공한다.
- `RaceWeekendScene`에서 20대 그리드 차량을 공유 렌더 스냅샷으로 표시한다.

## 제외 범위

다차량 충돌·추월·방어·접촉 손상, 트랙 리밋, 실제 피트 물리는 M3A 이후 범위다. M2B의 `retired`는 비정상 수치 방어를 위한 세션 상태이며 충돌 판정이 아니다.

## 변경 파일

- `src/gameplay/race/RaceSession.ts`
- `src/gameplay/race/RaceSession.test.ts`
- `src/app/RaceWeekendScene.tsx`
- `src/app/App.tsx`

## 합격 기준과 검증

- 고유 그리드 포즈와 차량 수: `RaceSession.test.ts`
- 동일 입력의 순위·거리 결정성: `RaceSession.test.ts`
- 리셋 뒤 모든 차량·시계 복원: `RaceSession.test.ts`
- 브라우저에서 20대 그리드와 순위 행 표시: `tests/e2e/smoke.spec.ts`
- 전체 완료 게이트: `npm run verify`

## 다음 단계

M2C에서 동일한 세션 경계와 분리된 퀄리파잉 랩타임·유효 랩·Q1/Q2/Q3 컷을 추가한다.
