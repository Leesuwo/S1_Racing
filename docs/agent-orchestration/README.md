# S1 Racing Agent Orchestration

## 목적

S1 Racing의 에이전트 작업을 역할, 파일 소유권, 검증 게이트로 조정한다. 이 문서는 Codex Desktop의 병렬 작업을 위한 저장소 계약이며, 별도의 런타임 오케스트레이터나 production dependency를 추가하지 않는다.

## 기준 문서

우선순위는 다음과 같다.

1. `AGENTS.md` — 모든 작업의 공통 규칙
2. `TEAM.md` — 역할별 호출명, 권한, 승인 경계
3. 이 문서와 `roles/*.md` — 역할별 책임과 금지 범위
4. `TASKS.md` — 현재 작업 큐와 배치 상태
5. `PROJECT_STATUS.md` — 완료 기준, 알려진 위험, 현재 상태
6. `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, 분야별 명세 — 설계 계약

Codex의 프로젝트 범위 custom agent 설정은 공식적으로 `.codex/agents/*.toml`에 둔다. 현재 실행 환경에서는 `.codex/`가 읽기 전용이므로 실제 설정 파일을 자동 생성하지 않고, 적용 가능한 템플릿을 [`templates/`](./templates/)에 둔다. `roles/*.md`는 사람이 검토하는 역할 계약이고, 자동으로 custom agent가 되지는 않는다.

게임 제작 도메인 지침은 [`.agents/skills/s1-racing-game-studio/SKILL.md`](../../.agents/skills/s1-racing-game-studio/SKILL.md)에 둔다. 이 프로젝트 로컬 스킬은 공식 `game-studio` 전문 스킬의 라우팅과 S1 Racing의 물리·렌더링·검증 가드를 제공하며, `.codex/agents/*.toml` 기반 custom agent 설정을 대체하지 않는다.

`AGENTS.md`에는 모든 작업에 필요한 짧은 규칙만 둔다. 역할별 상세 지침과 반복 절차는 이 디렉터리와 향후 Skill로 분리해 프로젝트 지침이 비대해지지 않도록 한다.

주석은 코드의 동작을 번역하는 장식이 아니라 유지보수 맥락을 보존하는 기록으로 취급한다. Lead는 비자명 로직의 의도·제약·단위·불변식 주석을 합격 기준에 포함하고, QA는 코드와 주석이 서로 다른 설명을 하지 않는지 확인한다.

## 공식 권고를 적용한 운영 원칙

OpenAI의 Codex·Agents 문서에서 확인한 원칙을 이 저장소에 다음처럼 적용한다.

| 원칙 | S1 Racing 적용 |
|---|---|
| 프로젝트 지침은 작고 지속적인 규칙 중심 | `AGENTS.md`에는 우선순위·검증·경계만 유지하고 역할 상세는 이 디렉터리에 둔다. |
| 병렬화는 독립적이고 bounded한 작업에 사용 | 탐색·테스트·로그 분석은 병렬화하고, 공유 파일을 쓰는 구현은 직렬 또는 격리한다. |
| 메인 컨텍스트는 요구사항·결정·최종 결과에 집중 | 전문 에이전트는 원시 로그 대신 파일·심볼·검증 결과가 포함된 요약만 반환한다. |
| manager와 handoff를 구분 | Lead가 최종 통합·판정을 유지하는 manager 패턴을 기본으로 한다. specialist가 사용자에게 직접 다음 응답을 소유해야 할 때만 handoff에 해당하는 위임을 사용한다. |
| 권한은 최소 범위로 상속·설정 | QA와 탐색은 read-only, 구현은 예약된 workspace 범위만 사용하며 `--yolo`/승인 우회는 금지한다. |
| 동시성·중첩 깊이를 제한 | 기본 템플릿은 `max_threads = 4`, `max_depth = 1`로 둔다. 추가 중첩은 근거가 있는 경우에만 Lead가 승인한다. |

근거 문서: [Codex customization](https://developers.openai.com/codex/concepts/customization), [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), [orchestration and handoffs](https://developers.openai.com/api/docs/guides/agents/orchestration), [Responses multi-agent](https://developers.openai.com/api/docs/guides/responses-multi-agent), [agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security).

## S1 Racing 모델 라우팅

| 호출명 | 역할 | 모델 | Reasoning | 사용 범위 |
|---|---|---|---|---|
| Pitwall | Lead | `gpt-5.6-terra` | `high` | 요구사항 분해, 통합, 충돌 해결, 최종 판정 |
| Mechanic | Worker | `gpt-5.6-luna` | `medium` | 문서, 테스트, 단순 UI, 명확히 bounded된 구현 |
| Scout | Explorer | `gpt-5.6-luna` | `medium` | 읽기 전용 탐색·요약·로그 분석 |
| Apex | Physics | `gpt-5.6-terra` | `high` | 타이어·구동계·고정 스텝·수치 경계 |
| Marshal | QA | `gpt-5.6-terra` | `high` | 회귀, 결정성, 경계, 검증 증거 리뷰 |

Writer가 물리·공통 입력·아키텍처 경계를 직접 설계해야 하는 경우 Lead가 Physics Worker로 승격해 Terra를 사용한다. Luna는 작업 범위를 줄이는 용도이지 QA 게이트를 생략하는 근거가 아니다.

## 운영 흐름

```text
사용자 요청
  ↓
Pitwall (Lead): 분해·소유권·합격 기준 확정
  ↓
전문 역할 Agent 1~3개
  ↓
Marshal (QA): 읽기 전용 검토와 재현 절차
  ↓
Pitwall (Lead): 피드백 반영·통합·전체 검증
  ↓
TASKS.md / PROJECT_STATUS.md / DECISIONS.md 갱신
```

구현 에이전트와 QA 에이전트는 같은 변경을 자기 승인하지 않는다. Lead Agent는 기능 구현보다 작업 분해, 충돌 방지, 검증 증거와 최종 통합에 우선순위를 둔다.

## 실행 모드 선택

작업을 배정할 때 Lead Agent는 먼저 아래 셋 중 하나를 기록한다.

### `serial`

앞 단계의 결과가 다음 단계의 입력이거나 여러 에이전트가 같은 파일·상태를 써야 할 때 사용한다. 물리 경계, 공통 입력 인터페이스, 아키텍처 JSON 변경은 기본적으로 이 모드다.

### `parallel-read`

코드 탐색, 테스트 갭 조사, 로그 분석, 문서 비교처럼 저장소를 읽기만 하는 독립 작업에 사용한다. 모든 작업이 끝난 뒤 Lead가 결과를 합쳐 다음 구현을 결정한다.

### `isolated-write`

서로 다른 파일 경계를 수정하는 구현 작업에만 사용한다. 각 작업은 소유 파일을 명시하고, 공유 파일 변경은 Lead의 통합 단계로 미룬다. 동일한 mutable resource를 두 에이전트가 수정해야 한다면 이 모드를 사용하지 않는다.

병렬화가 속도를 높이지 못하는 작은 작업, 순차 의존성이 강한 작업, 토큰·조정 비용이 큰 작업은 단일 에이전트로 처리한다.

## 역할과 기본 소유권

| 역할 | 기본 소유 파일 | 기본 책임 |
|---|---|---|
| Lead | `TASKS.md`, `PROJECT_STATUS.md`, 작업 계약 문서 | 분해·배정·통합·완료 판정 |
| Physics | `src/game/physics/**` | 결정적 차량 물리와 물리 테스트 |
| Gameplay | `src/gameplay/**`, `src/race/**`, `src/rules/**` | 세션·랩·레이스 규칙 |
| Track | `src/tracks/**`, `src/world/**`, 트랙 데이터 | 반복 가능한 트랙·경계·표면 |
| UI/UX | `src/ui/**`, `src/styles.css` | HUD·메뉴·입력 피드백 |
| Rendering/Performance | `src/rendering/**`, `src/performance/**`, `src/workers/**` | 표시 계층과 프레임 예산 |
| QA | 없음 — 읽기 전용 | 회귀·테스트·경계·라이선스 검토 |

`src/app/**`, `package.json`, `docs/architecture/**`, `AGENTS.md`, `README.md`는 공유·통합 파일이다. Lead Agent가 작업 패킷에서 명시적으로 예약하지 않으면 병렬 에이전트가 수정하지 않는다.

## 병렬 실행 규칙

- 작은 버그: 구현 1 + QA 1
- 단일 기능: 구현 1~2 + QA 1
- 독립적인 중간 작업: 구현 최대 3 + QA 1
- 파일 소유권이 하나라도 겹치면 병렬 구현하지 않는다.
- 같은 모듈 경계를 바꾸는 작업은 먼저 분석을 직렬로 끝내고 구현한다.
- `package.json`, 공통 입력 경계, 물리 스냅샷, 아키텍처 JSON은 한 배치에서 한 에이전트만 수정한다.
- 사용자에게 보이는 동작을 바꾸면 해당 E2E를 같은 작업 배치에 포함한다.
- `npm run verify`가 통과하기 전 다음 기능 마일스톤을 시작하지 않는다.

## 작업 패킷

Lead Agent는 각 에이전트에 아래 형식으로 전달한다.

```md
Task:
Owned files:
Read-only files:
Do not modify:
Dependencies:
Acceptance criteria:
Required validation:
Assumptions and risks:
Execution mode: serial | parallel-read | isolated-write
Context handoff: files, symbols, decisions, and concise evidence only
Retry budget: 0 | 1
Expected report:
```

소유 파일은 가능한 한 구체적인 파일 목록으로 제한한다. 디렉터리 전체 소유권은 해당 경계의 내부 변경이 독립적일 때만 사용한다.

## 결과 보고 형식

구현 에이전트:

```md
Status: complete | blocked
Changed files:
Behavior:
Tests run:
Validation result:
Assumptions:
Risks or follow-up:
```

QA Agent:

```md
Severity: blocker | high | medium | low
Affected files:
Reproduction:
Expected behavior:
Actual behavior:
Root cause:
Recommended fix:
Validation required:
```

문제가 없을 때도 `findings: none`과 실행한 검증 명령을 남긴다.

## 실패·재시도·충돌 처리

1. 에이전트가 실패하면 Lead는 먼저 실패한 명령, 마지막 변경 파일, 재현 조건을 기록한다.
2. 같은 작업을 무조건 반복하지 않고, 원인을 줄인 하나의 재시도만 허용한다.
3. 재시도 후에도 실패하면 `blocked`로 보고하고, 사용자의 선택 또는 외부 환경 변경 없이는 다음 단계로 진행하지 않는다.
4. 병렬 에이전트의 결과가 충돌하면 승자 없이 양쪽 근거를 보존하고 Lead가 직렬 검증으로 결론을 낸다.
5. 승인·샌드박스·네트워크 요청은 작업 목적과 대상 경로를 확인한 뒤 최소 권한으로 처리한다. 비밀값 탐색, 영구 보안 약화, 파괴적 명령은 자동화하지 않는다.

## 비용과 품질 측정

각 배치가 끝나면 다음을 기록한다.

- 병렬화한 작업 수와 실제 독립성
- 소요 시간 대비 단일 에이전트 예상 시간
- 재시도 횟수와 충돌 수
- QA finding 수와 `npm run verify` 결과
- 병렬화로 줄어든 작업과 늘어난 조정 비용

두 배치 연속으로 병렬화 이득이 없으면 다음 작업은 단일 Lead/Worker 흐름으로 되돌린다.

## 현재 배치

M1F는 완료되었고, 현재 저장소는 `TASKS.md`의 M2A를 다음 기능 후보로 둔다. M2A에서는 Gameplay Agent가 `VehicleControlInput`을 통해 단일 AI 상대를 연결하고, AI가 물리를 우회하지 않는지 QA가 검증한다. 다차량·레이스 역할은 M2A 합격 이후에만 활성화한다.
