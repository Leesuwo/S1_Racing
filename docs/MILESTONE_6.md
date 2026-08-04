# Milestone 6 — Independent race replay manifest

## 완료 범위

- `s1-racing-replay-v2`에 트랙·차량 정의·규정·grid pose·AI 프로필/시드·타이어 계획·차량 셋업·연료 계획·최대 fixed-step을 담는 manifest를 추가했다.
- manifest digest와 JSON 검증으로 변조·호환성 불일치를 기록 전과 재생 전에 차단한다.
- `verifyRaceReplayIndependently`는 기존 RaceSession을 주입받지 않고 manifest만으로 새 세션을 재구성해 step별 digest를 대조한다.

## 경계

- 현재는 내장 `test-track-v1`, `s1-open-wheel-v1`, `s1-race-regulations-v1`만 재구성한다.
- digest는 회귀 식별자이며 보안 서명이나 온라인 부정행위 방지 수단이 아니다.

## 검증

- 타이어·연료·셋업·종료 step까지 포함한 manifest 독립 재생 단위 테스트
- manifest digest 변조를 거부하는 replay JSON 검증

