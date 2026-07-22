# S1 Racing Studio Team

## 목적

S1 Racing의 에이전트를 하나의 소규모 게임 스튜디오처럼 운영하기 위한 역할·호출명 계약이다. 닉네임은 사람이나 모델의 정체성을 뜻하지 않으며, 작업 패킷·오케스트레이션 메시지·QA 보고서에서 책임 범위를 빠르게 식별하기 위한 안정적인 별칭이다.

Product Owner는 사용자다. 마일스톤 범위, 우선순위, 남은 위험의 수용 여부는 사용자가 최종 결정한다.

## 역할 명단

| 호출명 | 역할 | 설정 ID | 책임 요약 |
|---|---|---|---|
| **Pitwall** | Studio Lead | `pitwall` | 요구사항 분해, 파일 소유권, 통합, 검증, 완료 판정, 커밋·푸시 |
| **Apex** | Physics | `apex` | 120Hz 차량 물리, 타이어·구동계·수치 안정성 |
| **Grid** | Gameplay | `grid` | AI·세션·랩·레이스 규칙과 상태 전이 |
| **Circuit** | Track and World | `circuit` | 트랙 데이터, 표면, 체크포인트, 경계와 월드 |
| **Dash** | UI/UX | `dash` | HUD·메뉴·입력 피드백·가독성 |
| **Vector** | Rendering and Performance | `vector` | 읽기 전용 스냅샷 표시, 프레임·메모리·렌더링 성능 |
| **Marshal** | QA and Review | `marshal` | 읽기 전용 코드 리뷰, 회귀·경계·E2E 검증 |
| **Scout** | Explorer | `scout` | 읽기 전용 탐색, 영향 범위·테스트 갭·로그 분석 |
| **Mechanic** | Bounded Worker | `mechanic` | Lead가 지정한 파일만 수정하는 제한된 구현 작업 |

Release와 Documentation은 별도 병렬 에이전트로 만들지 않고 **Pitwall**이 담당한다. 이 영역은 결정 로그, 아키텍처 산출물, 상태 문서, 검증 결과, 커밋·푸시를 포함한다.

## 권한과 승인 경계

| 주체 | 할 수 있는 일 | 할 수 없는 일 |
|---|---|---|
| 사용자 | 범위·우선순위·위험 수용 결정 | 에이전트의 소유 파일 경계를 암묵적으로 변경하지 않음 |
| Pitwall | 작업 배정, 공유 파일 예약, 수정 통합, 최종 검증·Git 작업 | QA 증거 없이 완료 판정 |
| 전문 역할 | 할당된 소유 파일의 구현·분석 | 다른 역할의 경계 침범, 공유 파일 임의 수정 |
| Marshal | 변경사항 읽기, 재현, finding 보고 | 구현 코드 직접 수정, 자기 승인 |
| Scout | 저장소·문서·로그 읽기와 근거 요약 | 파일 수정, 검증 통과를 임의로 선언 |

Blocker 또는 High finding이 있으면 Pitwall은 수정과 재검증이 끝날 때까지 커밋·푸시를 진행하지 않는다. 모든 변경은 `npm run verify`가 최종 게이트다.

## 호출 규칙

작업 패킷과 메시지는 닉네임을 먼저 쓰고 역할을 괄호로 병기한다.

```text
수신: Apex (Physics)
목표: M2A AI 입력 경계에서 사용할 차량 상태 스냅샷 검토
소유 파일: src/game/physics/**
```

보고서도 같은 호출명을 사용한다.

```text
발신: Marshal (QA and Review)
결과: findings: none
검토 범위: M2A 변경 파일과 관련 테스트
검증: npm run verify
```

닉네임은 고정하되, 모델·reasoning·실행 모드는 작업 난도와 독립성에 따라 `README.md`의 라우팅 규칙으로 결정한다. 닉네임을 바꿀 때는 이 파일과 관련 TOML 템플릿을 함께 갱신한다.

## 현재 마일스톤 배치

Milestone 2A에서는 **Grid (Gameplay)** 1개 구현 담당과 **Marshal (QA and Review)** 1개 읽기 전용 리뷰 담당을 기본 배치로 한다. **Apex (Physics)**는 공통 `VehicleControlInput` 또는 차량 물리 경계를 실제로 수정해야 할 때만 Pitwall이 별도 예약한다.
