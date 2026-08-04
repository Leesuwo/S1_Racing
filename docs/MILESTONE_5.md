# Milestone 5 — 결정적 레이스 리플레이 코어

## 목적

M4에서 고정한 RaceSession의 물리·전략·운영 상태를 동일한 120Hz 입력으로 다시 실행하고, 상태 digest가 일치하는지 파일 단위로 검증한다. 이 마일스톤은 온라인 동기화의 전 단계이며 네트워크·연료·DRS·KERS·날씨를 포함하지 않는다.

## 범위

- M5A: `s1-racing-replay-v1` schema, 트랙·랩·차량 수·fixed-step·초기 digest 계약
- M5B: Race Weekend의 fixed-step 입력과 직후 상태 digest 기록
- M5C: 동일 grid에서 step별·최종 digest를 비교하고 첫 불일치를 보고
- M5D: JSON 직렬화·파싱·schema·입력 범위·프레임 순서·트랙 호환성 검증
- M5F: Race Weekend에서 완료 replay JSON 저장·불러오기 상태 표시

리플레이 모듈은 React·R3F·Rapier 장면을 참조하지 않는다. 브라우저 세션은 완료된 recording만 저장할 수 있고, 불러온 파일은 현재 트랙·랩·참가자 수와 먼저 대조한다. 실제 재생 검증은 순수 `RaceSession`을 주입하는 `verifyRaceReplay` 경계에서 수행한다.

## 완료 기준

- [x] 120Hz 입력·digest recording 계약 구현
- [x] step별 결정성 검증과 첫 mismatch 반환
- [x] JSON round-trip과 변조 입력 검출 단위 테스트
- [x] Race Weekend 완료 후 READY 상태와 frame count·final digest 표시
- [x] 브라우저 JSON 저장·불러오기와 파일명 회귀 E2E
- [x] 아키텍처 JSON·HTML 및 결정 로그 갱신
- [x] `npm run verify` 및 Codex 앱 브라우저 실제 플레이 최종 통과

## 남은 위험

이 제한은 후속 M6에서 해소했다. `s1-racing-replay-v2`는 차량 정의·AI 프로필/시드·grid·타이어·셋업·연료·종료 fixed-step을 manifest로 보존하며, `verifyRaceReplayIndependently`가 새 RaceSession을 독립 생성해 재생한다. 온라인 동기화는 여전히 별도 권한·서명 설계가 필요한 후속 범위다.

## 다음 마일스톤

M6 — 리플레이 manifest와 독립 재생 도구를 먼저 확정한 뒤, 연료·DRS·KERS 중 하나를 선택해 운영 상태를 확장한다.
