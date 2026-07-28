# Task Queue

이 문서는 Lead Agent가 관리하는 작업 큐다. 한 번에 `진행 중`인 기능 작업은 하나를 기본값으로 하며, 파일 소유권이 겹치지 않는 분석·검증 작업만 병렬 실행한다.

## 진행 중

### 1차 완성 — M3B → M3C → M3D → M3E

- 상태: 구현·통합 검증·문서화 완료 (2026-07-28)
- 완료된 범위: 타이어 상태, racecraft, 손상·플래그·피트 서비스, 결정성 digest, HUD·E2E·문서
- 문서: docs/MILESTONE_3B.md, docs/MILESTONE_3C.md, docs/MILESTONE_3D.md, docs/FIRST_COMPLETE.md
- 합격 기준: `npm run verify` 전체 통과 — 타입 검사·단위 테스트 30개 파일/97개 테스트·아키텍처·빌드·E2E 17건.
- 실행 모드: serial

### M3A — 트랙 리밋과 접촉 모델

- 상태: 완료 (2026-07-27)
- 완료된 범위: 공유 벽·연석 데이터, 트랙 리밋·랩 무효화·패널티, 순수 차량 접촉 응답, Rapier 정적 collider·접촉 telemetry, HUD·Race Weekend 표시
- 문서: `docs/MILESTONE_3A.md`
- 검증: `npm run verify` 통과

## 완료

### M1F — 입력 프리셋과 반복 가능한 테스트 트랙

- 상태: 완료 (2026-07-22)
- 결과: 네 입력 프리셋, 데이터 기반 테스트 트랙, 리셋·경계 HUD와 단위·E2E 검증 구현
- 검증: `npm run verify` 통과

## 완료 후 후보

1. M4 — 다차량 Rapier 차체 형상·회전 충돌
2. M4 — 실제 피트 레인 차선·속도 제한
3. M4 — 규정 기반 플래그·레이스 운영 확장

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
