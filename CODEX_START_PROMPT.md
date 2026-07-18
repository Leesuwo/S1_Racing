현재 저장소의 `AGENTS.md`, `README.md`, `docs/` 아래 문서를 먼저 읽어라.

여러 에이전트를 사용하거나 작업을 위임할 때는 `docs/agent-orchestration/README.md`, 해당 역할 파일, `PROJECT_STATUS.md`, `TASKS.md`를 함께 읽어라. 작업 시작 전에 소유 파일과 합격 기준을 확정하고, 구현 에이전트와 QA 에이전트의 책임을 분리하라.

이번 작업 범위는 **Milestone 0 — Project Foundation**으로 제한한다.

먼저 현재 파일 구조와 package scripts를 확인하고, 다음을 실행하라.

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

실패하면 원인을 수정하되 차량 물리·AI·레이스 기능으로 범위를 확장하지 마라.

완료 보고에는 다음을 포함하라.

1. 변경 파일
2. 실행 명령과 결과
3. Milestone 0 완료 기준
4. 문서와 코드의 불일치
5. 남은 위험
6. 다음 단일 작업으로 권장하는 Milestone 1A
