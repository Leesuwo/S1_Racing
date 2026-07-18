# S1 Racing Architecture Diagrams

Archify 다이어그램은 구조 변경을 추적하기 위한 문서 산출물입니다.

## 원본과 산출물

- 원본: `*.architecture.json`
- 검토용 결과: 같은 이름의 `.html`
- 현재 다이어그램: `s1-racing-foundation.architecture.json`

## 갱신 규칙

1. 모듈 경계·데이터 흐름·테스트 경계를 변경할 때 원본 JSON을 수정한다.
2. 생성된 HTML을 수동 편집하지 않는다.
3. 다음 명령으로 schema, layout, HTML 산출물을 모두 검증한다.

```bash
npm run architecture:check
```

4. JSON과 HTML을 함께 커밋한다.

## 마일스톤 종료 체크리스트

각 마일스톤이 끝날 때마다 다음 순서로 설계 문서를 닫는다.

1. `docs/MILESTONE_<ID>.md`에 목표, 구현 범위, 제외 범위, 합격 기준과 검증 결과를 기록한다.
2. `docs/ROADMAP.md`에서 해당 항목의 상태와 상세 문서 링크를 갱신한다.
3. 중요한 구조·물리 결정은 `docs/DECISIONS.md`에 결정·이유·검증을 기록한다.
4. 모듈 경계나 데이터 흐름이 바뀌면 이 디렉터리의 JSON 원본과 HTML 산출물을 함께 갱신한다.
5. `npm run architecture:check`를 포함한 `npm run verify`를 실행하고, 환경 차단이 있으면 원인과 통과한 단계만 문서에 남긴다.

Archify는 JSON IR을 읽어 self-contained HTML/SVG를 생성하며, 다이어그램 출력은 실행 코드가 아니라 현재 설계 계약을 설명하는 문서다.
