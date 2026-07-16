# Product Spec

## 제품 방향

S1 Racing은 브라우저에서 실행되는 독자 브랜드 오픈휠 레이싱 게임이다. 그래픽보다 타이어·서스펜션·공력·입력의 주행감을 우선한다.

## Milestone 0 — Project Foundation

### 포함

- Vite + React + TypeScript 실행 기반
- WebGL2 지원 검사와 오류 화면
- 최소 R3F Canvas 셸
- Page Visibility 기반 일시정지 상태
- 물리·입력 계층의 인터페이스 경계
- 고정 스텝 계산 골격
- 자동 검증 명령과 브라우저 smoke test

### 제외

- 차량 물리와 Rapier World 연결
- 타이어, 엔진, 기어박스, 공력 계산
- 플레이어 입력 매핑
- AI 드라이버
- 퀄리파잉·레이스·피트·리더보드
- 실제 트랙과 외부 에셋

## 완료 기준

- `npm run typecheck` 통과
- `npm test` 통과
- `npm run build` 통과
- `npm run test:e2e` 통과
- 브라우저에서 S1 Racing 셸과 WebGL2 상태 표시
- 다음 Milestone 1A로 확장할 경계가 문서화됨
