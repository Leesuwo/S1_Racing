# Project Status

## 기준선

- 제품: S1 Racing
- 작업 기준일: 2026-07-19
- 저장소 문서상 완료 상태: Milestone 1E — Aero and validation
- 다음 기능 마일스톤: Milestone 1F — Input presets and test track
- 현재 오케스트레이션 상태: 대기 중인 기능 작업 없음

## 완료된 기반

- 120Hz 고정 스텝 차량 물리와 렌더링 보간
- `VehicleControlInput` 입력 경계
- Rapier 4륜 접지, 휠별 타이어 힘, 구동계, 공력
- 키보드·Pointer Lock 입력, 추적 카메라, 텔레메트리 HUD
- 단위 테스트, 결정적 물리 검증, 아키텍처 검증, 프로덕션 빌드, 브라우저 E2E

## 현재 제한

- 입력 프리셋과 반복 가능한 트랙 콘텐츠는 다음 마일스톤의 범위다.
- AI, 다차량 세션, 퀄리파잉, 레이스 운영은 아직 구현하지 않는다.
- 실제 차량 재현을 주장하지 않는 `initial_assumption` 물리 수치를 사용한다.
- 실제 트랙 복제, 공식 브랜드·팀·드라이버·리버리 자산을 사용하지 않는다.

## 알려진 문서 정합성 위험

`README.md`와 `docs/ROADMAP.md`는 Milestone 1E 완료를 현재 상태로 기록하지만, `AGENTS.md`와 `CODEX_START_PROMPT.md`에는 Milestone 0 기준 문구가 남아 있다. 오케스트레이터는 작업 범위를 정할 때 `AGENTS.md`의 제한을 우선 적용하고, 마일스톤 전환 시 이 문서들을 한 번에 정합화한다.

## 검증 기준

```bash
npm run verify
```

기능·입력·HUD·사용자 흐름을 변경한 작업은 관련 E2E를 추가하거나 갱신해야 한다. E2E가 환경 문제로 실행되지 않으면 완료로 표시하지 않는다.

## 업데이트 책임

Lead Agent가 작업 배치가 끝날 때마다 현재 상태, 통과한 검증, 남은 위험을 갱신한다. 구현 에이전트는 이 파일을 직접 수정하지 않고 결과 보고에 상태 변경안을 제안한다.
