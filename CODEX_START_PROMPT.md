현재 저장소의 `AGENTS.md`, `README.md`, `docs/` 아래 문서를 먼저 읽어라.

여러 에이전트를 사용하거나 작업을 위임할 때는 `docs/agent-orchestration/README.md`, `docs/agent-orchestration/TEAM.md`, 해당 역할 파일, `PROJECT_STATUS.md`, `TASKS.md`를 함께 읽어라. 작업 시작 전에 소유 파일과 합격 기준을 확정하고, 구현 에이전트와 QA 에이전트의 책임을 분리하라. 작업 패킷과 보고서에는 `TEAM.md`의 호출명과 역할을 함께 표기하라.

현재 저장소 문서상 **Milestone 1F — Input presets and test track**이 완료되었고, 다음 작업은 **Milestone 2A — Single AI opponent**다. 새 작업은 `PROJECT_STATUS.md`, `TASKS.md`, `docs/ROADMAP.md`, `docs/MILESTONE_1F.md`를 기준으로 범위를 정한다.

먼저 현재 파일 구조와 package scripts를 확인하고, 다음을 실행하라.

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

실패하면 원인을 수정하되 요청된 마일스톤의 범위를 넘어 다차량·퀄리파잉·레이스 기능으로 확장하지 마라.

완료 보고에는 다음을 포함하라.

1. 변경 파일
2. 실행 명령과 결과
3. 현재 마일스톤 완료 기준
4. 문서와 코드의 불일치
5. 남은 위험
6. 다음 단일 작업으로 권장하는 Milestone 2A
