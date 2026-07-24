# Task Queue

이 문서는 Lead Agent가 관리하는 작업 큐다. 한 번에 `진행 중`인 기능 작업은 하나를 기본값으로 하며, 파일 소유권이 겹치지 않는 분석·검증 작업만 병렬 실행한다.

## 진행 중

### M2A-0 — AI 교육 트랙과 결정적 평가기 프로토타입

- 상태: Northfield GP 대형 레이아웃·AI 추적 카메라·교육 시나리오 구현·검증 완료, 튜닝 결과 파일 저장 진행 예정 (2026-07-24)
- 완료된 범위: `AITrainingRunner`, 중심선·폭·곡률·섹터·체크포인트 데이터, AI 목표점·레이싱 라인 시각화, AI 추적 카메라, 저속 탈출 시나리오, 결정성 단위 테스트·브라우저 E2E
- 남은 범위: 튜닝 결과 파일 저장 및 M2A 인수 기준 확정
- 검증: `npm run verify` 통과

## 완료

### M1F — 입력 프리셋과 반복 가능한 테스트 트랙

- 상태: 완료 (2026-07-22)
- 결과: 네 입력 프리셋, 데이터 기반 테스트 트랙, 리셋·경계 HUD와 단위·E2E 검증 구현
- 검증: `npm run verify` 통과

## 다음 작업

### M2A-0 — AI 교육 트랙과 결정적 평가기

- 상태: 진행 중 (Northfield GP와 교육 시나리오 검증 완료)
- 담당 기본 역할: Track 구현 담당 + Gameplay 구현 담당 + QA
- 선행 조건: M1F 검증 게이트 통과
- 범위: Silverstone의 주행 특성만 참고한 독창 교육 트랙, 120Hz 결정적 에피소드 실행기, AI 튜닝·평가 지표
- 제외: 실제 Silverstone 레이아웃·좌표·코너명·시설·브랜딩 복제, 신경망·강화학습, 다차량 세션
- 문서: `docs/AI_TRAINING_TRACK_PRD.md`, `docs/AI_TRAINING_TRACK_TODO.md`
- 구현 원본: `src/tracks/NorthfieldGP.ts`, `NORTHFIELD_GP_DATA`
- 필수 검증: 트랙 데이터·결정성 해시·목표 속도·제동·횡오차·트랙 이탈 단위·시나리오 테스트, `npm run verify`

### M2A — 단일 AI 상대

- 상태: 대기
- 담당 기본 역할: Gameplay 구현 담당 + QA
- 선행 조건: M2A-0 검증 게이트 통과
- 범위: 교육 결과를 적용한 플레이어와 동일한 `VehicleControlInput` 단일 AI 상대
- 제외: AI 물리 우회, 다차량 세션, 퀄리파잉, 실제 트랙 복제 자산
- 필수 검증: 목표 속도·레이싱 라인·브레이크 지점 단위·시나리오 테스트, `npm run verify`

## 예정

1. M2A-0 — AI 교육 트랙과 결정적 평가기
2. M2A — 동일한 `VehicleControlInput` 경계를 사용하는 단일 AI 상대
3. M2B — 다차량 레이스 세션
4. M2C — 퀄리파잉
5. M2D — 레이스 주말과 전략
6. M3A — 트랙 제한과 접촉 모델

## 작업 등록 규칙

새 작업은 다음 항목을 채운 뒤 Lead Agent가 등록한다.

```md
ID:
목표:
담당 역할:
소유 파일:
읽기 전용 파일:
수정 금지 경로:
선행 작업:
합격 기준:
필수 검증:
실행 모드: serial | parallel-read | isolated-write
컨텍스트 전달: 파일·심볼·결정·간결한 증거
재시도 예산: 0 | 1
```

`Execution mode`는 `serial`, `parallel-read`, `isolated-write` 중 하나로 명시한다. `Context handoff`에는 원시 로그 전체를 붙이지 말고 관련 파일·심볼·결정·실패 증거만 남긴다. `Retry budget`는 기본 `1`이며, 재시도 후에도 실패하면 작업을 `blocked`로 전환한다.

작업이 시작되면 `진행 중`, QA에 넘기면 `검토 중`, 모든 검증이 끝나면 `완료`로 바꾼다. 실패나 차단은 원인과 재개 조건을 함께 기록한다.
