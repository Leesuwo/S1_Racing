# M6 — 성능 안정화 및 코드·최적화 리뷰 하네스 기획

## 목적

1차 완성 이후의 다음 마일스톤으로, 차량 물리의 120Hz 결정성과 입력 반응성을 훼손하지 않고 Training·Driving·Race Weekend의 프레임 안정성을 확보한다. 이후 모든 코드 변경은 기존 검증에 더해 코드 경계와 성능 회귀를 자동 검토할 수 있어야 한다.

## 문제 정의

- Race Weekend는 최대 20대의 Rapier 차체·AI·리플레이 기록·렌더링을 동시에 처리한다.
- 렌더 프레임 수와 fixed-step 실행 수가 직접 결합되면 저프레임 상황에서 catch-up 작업이 한 프레임을 점유할 수 있다.
- 다수 AI 차량의 그림자와 세부 mesh는 폴리곤 수보다 draw call·shadow map 비용을 크게 만든다.
- 리플레이 digest와 전체 순위 스냅샷은 120Hz 경로에서 불필요한 할당을 만들 수 있다.
- 현재 `npm run verify`는 기능 정확성을 검증하지만, 성능 계약과 코드 리뷰 결과를 필수 게이트로 다루지 않는다.

## 범위

### M6A — 측정 기준과 fixed-step 안정화

- Training·Driving·Race Weekend에 공통 120Hz 누적 시간 계약을 적용한다.
- 프레임 stall, fixed-step 수, fixed-step 처리 시간, HUD 갱신 빈도를 관찰 가능한 값으로 정리한다.
- 탭 복귀·WebGL context 변화·저프레임에서 spiral of death를 막는 상한과 잔여 시간 처리 규칙을 문서화한다.
- 물리·AI·리플레이는 계속 `VehicleControlInput`과 `VehicleSimulation` 경계만 사용한다.

### M6B — Race Weekend CPU 최적화

- 20대 참가자 기준으로 Rapier body 관리, 접촉 쌍 조회, 차량별 렌더 스냅샷 생성 경로를 프로파일링한다.
- collider handle → participant id 직접 조회와 재사용 가능한 버퍼를 우선 적용한다.
- CCD·수면 정책은 120Hz 이동 거리, 차량 접촉 회귀 테스트, 결정성 digest를 근거로 단계적으로 조정한다.
- 리플레이는 입력 120Hz 기록과 재생 검증 계약을 보존하며, digest·순위 직렬화의 임시 객체 생성을 줄인다.

### M6C — GPU·렌더링 최적화

- 플레이어 hero 차량과 AI grid 차량의 shadow·mesh·재질 예산을 분리한다.
- AI grid는 거리·카메라 역할에 맞는 shadowless LOD를 사용하고, 플레이어 차량의 자세 판독성은 유지한다.
- Canvas DPR, antialias, shadow type은 저사양 통합 GPU와 고밀도 화면에서 측정 후 기본값을 결정한다.
- geometry·material은 장면 수명에 맞춰 생성·공유·해제하며 렌더 프레임마다 새로 만들지 않는다.

### M6D — 초기 로딩과 모드 전환

- Training·Driving·Race Weekend·Design Review의 모듈 분할을 검토한다.
- 첫 화면에 필요하지 않은 Rapier·R3F 장면·검토 도구의 파싱을 늦추되, Canvas scene 전환 뒤 render loop가 멈추지 않는지 E2E로 확인한다.
- 번들 예산은 raw/gzip 크기, 초기 진입 chunk, lazy chunk를 분리해 관리한다.

### M6E — 코드·최적화 리뷰 하네스

`npm run verify`와 GitHub Actions Verify에 다음 게이트를 추가한다.

1. 코드 리뷰
   - `git diff --check`
   - 순수 도메인(`src/game/**`, `src/gameplay/**`, `src/tracks/**`)의 React·R3F·Three·Zustand 직접 의존성 금지
   - production `console` 출력 검사
   - 공개 경계의 TSDoc·주석 갱신 여부 검토

2. 최적화 리뷰
   - 시간 기반 fixed-step 사용 여부
   - Canvas DPR·shadow·AI LOD 성능 계약
   - Rapier 접촉 탐색의 선형 반복·프레임별 할당 감시
   - 프로덕션 build의 초기·lazy JavaScript 예산

3. 검증 증적
   - 단위 테스트: 물리 결정성, collision 경계, snapshot·digest 회귀
   - E2E: 모드 전환, Training 수동 fixed-step, Race Weekend 시작·리플레이 기록
   - 실제 플레이: Training·Driving·20대 Race Weekend의 프레임·입력·콘솔 상태

## 완료 기준

- 60Hz 목표 장치에서 Training·Driving·Race Weekend가 입력 지연이나 고정 step 폭주 없이 동작한다.
- Race Weekend 20대 기준 P95 fixed-step 처리 시간, 최대 처리 시간, draw call·shadow 비용을 QA 보고서에 기록한다.
- 동일 입력의 replay digest와 RaceSession 결과가 최적화 전후에 일치한다.
- `npm run verify`가 타입 검사, 단위 테스트, 아키텍처, 빌드, 코드 리뷰, 최적화 리뷰, E2E를 모두 통과한다.
- 모든 성능 임계값은 측정 장치·브라우저·측정 방법·변경 전후 수치와 함께 `docs/DECISIONS.md`에 기록한다.

## 제외 범위

- 엔진 교체, 물리 120Hz 하향, AI의 숨은 그립·출력 보너스, 차량 위치 직접 수정
- 외부 상용 3D 자산, 실제 F1 팀·리버리·트랙 복제
- 온라인 동기화, 연료·DRS·KERS·날씨 기능 확장

## 작업 순서

1. M6A 측정 기준과 fixed-step 회귀 테스트를 먼저 확정한다.
2. M6B CPU 병목을 프로파일·수정하고 결정성 리플레이를 재검증한다.
3. M6C GPU 예산과 LOD를 적용한 뒤 저사양 브라우저 실제 플레이를 수행한다.
4. M6D 모드 분할과 초기 로딩 예산을 검증한다.
5. M6E 하네스를 `verify`·CI에 넣고, 모든 게이트가 통과한 결과를 QA 보고서로 남긴다.

## 위험과 대응

| 위험 | 대응 |
| --- | --- |
| 성능 개선이 물리 결과를 바꿈 | fixed-step·digest·RaceSession 반복 테스트를 먼저 실행한다. |
| LOD가 플레이어 판독성을 떨어뜨림 | 플레이어 hero와 AI grid의 예산을 분리하고 E2E·실제 플레이로 확인한다. |
| CI 장비 차이로 FPS 기준이 흔들림 | FPS 절대값 대신 처리 시간·번들·구조 계약을 자동 게이트로 두고 실제 장치 수치를 별도 보고한다. |
| lazy loading이 장면 진행을 멈춤 | 모드 전환 뒤 Canvas render loop·Training step·Race replay 기록을 E2E로 검증한다. |
