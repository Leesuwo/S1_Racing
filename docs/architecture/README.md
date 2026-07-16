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

Archify는 JSON IR을 읽어 self-contained HTML/SVG를 생성하며, 다이어그램 출력은 실행 코드가 아니라 현재 설계 계약을 설명하는 문서다.
