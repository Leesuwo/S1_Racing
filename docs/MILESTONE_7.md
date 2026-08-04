# Milestone 7 — Weekend format and sprint flow

## 완료 범위

- `grand-prix`와 `sprint` 주말 포맷을 Race Weekend UI와 순수 상태 머신에 추가했다.
- sprint 포맷은 `practice → qualifying → sprint → race → results` 순서로 실행한다.
- sprint 결과 순위가 메인 레이스의 grid 정의가 되며, sprint가 진행 중인 동안 타이어·전략 변경을 잠근다.

## 경계

- 점수·챔피언십·실제 FIA 세부 규칙은 포함하지 않는다.
- sprint와 메인 레이스 모두 기존 `RaceSession`·120Hz·공유 물리 경계를 사용한다.

## 검증

- 스프린트 완료 뒤 메인 레이스 대기 상태로 전이하는 단위 테스트
- 브라우저에서 sprint 포맷 선택과 시작 후 설정 잠금 E2E

