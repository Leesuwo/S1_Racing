# Track Spec

## 데이터 우선 구조

트랙은 시각 자산과 주행 데이터를 분리한다.

```text
track_visual.glb
track_collision.glb
track_data.json
```

`track_data.json`에는 중심선, 폭, 고도, 뱅킹, 표면, 곡률, 섹터, 체크포인트, 피트라인, AI 레이싱 라인을 둔다. 현재 프로토타입에서는 이 경계를 `TEST_TRACK_DATA.racingLine`이 구현한다.

## 제작 원칙

- 실제 서킷은 주행 특성만 참고하고 레이아웃·이름·시설·브랜딩을 독립적으로 재설계한다.
- 화면 메시와 충돌 메시를 분리한다.
- AI 경로와 랩 판정은 GLB를 런타임에 추정하지 않고 데이터로 제공한다. 레이싱 라인 점은 위치(m), 방향(rad), 목표 속도(m/s), 선택적 제동 진입점을 포함한다.
- 중심선 샘플링은 일반 2~5m, 급격한 곡률 변화 구간 0.5~2m를 시작값으로 한다.

## Milestone 0

트랙 자산과 지오메트리는 제외한다. 트랙 데이터 인터페이스는 실제 물리 계층이 필요해지는 시점에 추가한다.

## Milestone 1F — 반복 가능한 테스트 트랙

현재 프로토타입은 외부 자산 없이 `src/tracks/TestTrack.ts`의 `TEST_TRACK_DATA`를 트랙 원본으로 사용한다. 물리 표면 샘플러와 `src/world/TestTrackVisual.tsx`는 이 정의를 공유한다.

데이터에는 다음 항목이 포함된다.

- 외곽 경계와 인필드 잔디 경계
- 스타트 직선·우측 코너·백 스트레이트·좌측 코너
- 스타트/피니시, 100m·50m 브레이크 마커
- 순서가 고정된 네 개 체크포인트
- 시작 위치와 yaw

`sampleTestTrackLocation()`은 `asphalt`, `grass`, `off-track` 상태를 결정한다. 인필드 잔디와 외곽 경계 바깥은 주행 표면 이탈로 판정하며, 외곽 경계 바깥은 `off-track`으로 구분한다. `distanceToBoundaryM`은 경계 안에서는 가장 가까운 외곽 경계까지의 양수 거리, 바깥에서는 이탈 거리의 음수 값이다.

현재 사각 루프의 좌표와 수치는 콘텐츠 검증을 위한 `initial_assumption`이며 실제 특정 서킷을 복제하지 않는다.
