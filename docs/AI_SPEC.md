# AI Spec

AI는 플레이어와 같은 차량 물리를 사용하고 `VehicleControlInput`만 출력한다. 차량 위치를 직접 이동시키거나 숨겨진 그립 보너스를 사용하지 않는다.

## Milestone 2A-0 — AI Training Circuit & Evaluator

- 단일 AI를 레이스 세션에 연결하기 전에 결정적 교육·평가 실행기를 둔다.
- 교육은 초기에는 머신러닝이 아니라 120Hz 에피소드 실행, 제한된 파라미터 탐색, 회귀 평가를 뜻한다.
- 교육 트랙은 실제 서킷의 주행 특성만 참고한 독창 레이아웃이며, 실제 트랙 좌표·코너명·시설·브랜딩을 복제하지 않는다.
- 평가기는 React, R3F, DOM, Rapier API를 직접 소유하지 않고 `VehicleSimulation` 경계에 입력을 공급받는다.
- 모든 결과는 설정 스냅샷과 결정성 해시를 함께 보존한다.
- 현재 교육 트랙 원본은 `NORTHFIELD_GP_DATA`이며 중심선·폭·곡률·섹터·체크포인트·레이싱 라인을 공유한다.

### 교육 지표

- 랩 시간과 에피소드 종료 이유
- 트랙 이탈 횟수
- 레이싱 라인 횡오차 RMS/P95
- 목표 속도 오차 RMS/P95
- 제동 초과량과 입력 채터링
- 동일 상태·`dt`·시드에 대한 텔레메트리 해시

모든 교육 트랙 수치와 AI 튜닝값은 실제 차량 재현값이 아닌 `initial_assumption`이며, 주행감은 `simulation_required` 검증 대상이다.

## Milestone 2A — Single AI opponent

- M2A-0에서 자동 적용된 `SingleOpponentAIConfig`를 주행 모드에 전달한다.
- AI는 `VehicleControlInput`만 생성하고 플레이어와 동일한 `VehicleSimulation`·Rapier 힘 적용 경계를 사용한다.
- 주행 모드의 AI는 플레이어와 별도 물리 객체를 소유하지만 동일한 120Hz fixed-step 순서로 업데이트한다.
- AI 텔레메트리는 읽기 전용 HUD로 표시하며, 그리드 순위·충돌·추월·방어는 이 단계에서 다루지 않는다.

## Milestone 2B — Multi-car race session

- `RaceSession`은 차량별 `VehicleSimulation`을 소유하고 AI에는 `VehicleControlInput`만 공급한다.
- 2~20대의 그리드·랩 진행·기본 순위·리셋을 결정적으로 계산한다.
- 다차량 충돌·추월·방어는 M3A 이후 범위이며 AI에 숨은 속도·그립·위치 보정을 주지 않는다.

## Milestone 2C — Qualifying

- `QualifyingSession`은 AI 물리 세션과 분리된 랩타임 규칙 실행기다.
- `s1-racing-qualifying-v1`의 Q1 20→15, Q2 15→10, Q3 10 순서를 사용한다.
- 무효 랩은 최고 기록과 그리드 순위에 반영하지 않으며, 결과는 레이스 그리드 입력으로만 전달한다.

## Milestone 2D — Race weekend and strategy

- `RaceWeekendSession`은 Practice→Qualifying→Race→Results 상태 전이를 조정한다.
- Race Weekend UI는 단계·순위·타이어 선택·최소 피트 전략을 읽기 전용 스냅샷과 명령 콜백으로 연결한다.
- 타이어 열·마모·공기압·실제 피트 물리와 접촉 손상은 후속 모델이며 AI의 물리 우회 수단으로 사용하지 않는다.

## Milestone 3A — Track limits and contact

AI 차량도 플레이어와 동일한 VehicleSimulation, TrackLimitsMonitor, VehicleContact 경계를 통과한다. AI 컨트롤러는 계속 레이싱 라인·목표 속도에서 VehicleControlInput만 생성하며, 트랙 이탈을 무시하거나 접촉 후 위치를 직접 보정하는 특례를 갖지 않는다. RaceSession이 fixed step 뒤 접촉 응답과 트랙 리밋 상태를 공통으로 계산한다.

현재 접촉은 RaceSession의 2D 원형 근사이며 AI 회피·추월·방어 의사결정은 아직 추가하지 않는다. 정적 트랙 벽·연석은 테스트 트랙 데이터에서 생성되는 Rapier collider를 플레이어·단일 AI 주행 장면이 공유한다.

## 예정 계층

1. 교육 트랙과 결정적 평가기 — M2A-0
2. Racing line과 목표 속도 프로파일 — M2A
3. Pure Pursuit 조향 — M2A
4. PID 기반 가감속 정밀 튜닝 — 후속 작업
5. 타이어 열·마모·공기압과 레이스 전략 — M3B
6. 다차량 추월·방어·충돌 회피 — M3C
7. 손상·플래그·실제 피트 물리 — M3D
8. 온라인 멀티플레이 동기화 — 후속 검토

## Milestone 0

AI 구현과 트랙 데이터는 제외한다. 테스트 트랙과 입력 프리셋을 고정하는 Milestone 1F 이후, M2A-0에서 교육 트랙과 결정적 평가를 시작하고 M2A에서 단일 AI를 통합한다.
