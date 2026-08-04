# PS2 감성 시각 기준선 — 2026-08-04

## 목적

`PS2 nostalgia` 방향의 변경 전후를 비교할 수 있도록 S1 Racing 네 화면을 같은 브라우저 조건에서 캡처했다. 이 문서의 캡처는 외부 게임 자산이 아니라 현재 프로젝트의 자체 렌더링 결과다.

## 캡처 조건

| 항목 | 기준 |
| --- | --- |
| 브라우저 | Playwright Chromium, headless, SwiftShader |
| 캡처 viewport | `960×540`, `1440×900` |
| device pixel ratio | `1` |
| 장면 안정화 | 모드 전환 후 3초 대기 |
| Canvas DPR | `[1, 1.25]` |
| antialias | `false` |
| shadows | `basic` |
| WebGL power preference | `high-performance` |
| 물리·입력 | 실행하지 않고 초기 화면만 캡처 |

## 현재 렌더 설정

### Canvas 카메라

| 화면 | App 기본 카메라 | 장면 추적 카메라 |
| --- | --- | --- |
| Training | `[0, 30, 25]`, `45°` | AI 차량 기준 `거리 11m`, `높이 7.5m`, `look-ahead 6m` |
| Driving | `[4, 4, 6]`, `55°` | Chase `거리 7m`, `높이 4.2m`, `look-ahead 4m`; Cockpit `68°` |
| Race Weekend | `[0, 8, 16]`, `55°` | 플레이어 기준 `거리 8.5m`, `높이 6.5m`, `look-ahead 3.5m` |
| Design Studio | `[5.4, 2.9, 6.4]`, `38°` | 디자인 스튜디오 전용 고정 검토 시점 |

### 공통 팔레트와 조명

- 하늘·안개: 먼지 낀 노을 계열 `#b96d6e`
- 도로: 짙은 갈색 회색 `#292d2c`
- 잔디: 어두운 올리브 `#3c5939`
- 연석: 적색 `#d25f58`
- 외곽·내측 벽: 모래색·황색 `#b7a68d`, `#c99d51`
- HUD: 불투명한 흑청색, cyan·amber 상태색
- 장면 조명: 따뜻한 ambient/sun과 제한된 hemisphere light, Training에만 국소 fill light

## 화면별 기준선

### Training

- 차량·도로·레이싱 라인의 방향은 첫 화면에서 읽힌다.
- 올리브 잔디, 갈색 도로, 분홍빛 노을의 색 블록이 이미 PS2 nostalgia 방향과 맞는다.
- 왼쪽 교육 오버레이는 정보를 잘 전달하지만 `backdrop-filter`와 큰 그림자가 현대적인 유리 패널 인상을 만든다.

### Driving

- 3초 안정화 후에는 낮은 chase 시점, 큰 차량 실루엣, 짙은 도로와 밝은 연석이 분명하다.
- 초기 캡처에서는 App Canvas 기본 카메라가 먼저 노출되어 트랙이 작게 보이는 전환 지연이 확인됐다. 물리·입력과 무관한 렌더링 문제로 분류한다.
- 좌상단 텔레메트리는 판독성이 높지만, 큰 불투명 패널 하나에 정보가 과밀하게 들어가 있어 추후 `HUD` 단계에서 재구성한다.

### Race Weekend

- 그리드·도로·내측 잔디·연석·피트 레인이 명도와 높이 차로 구분된다.
- 다차량 장면에서 색으로 차량 구분은 가능하지만, 기본 시점은 하단 차량을 크게 잘라 보여주므로 리플레이·검수 카메라는 후속 단계에서 A/B가 필요하다.

### Design Studio

- 차량의 노즈·윙·휠·콕핏 실루엣과 접점이 가장 명확하게 보인다.
- 격자 바닥과 차체 하이라이트가 외관 검수에는 유리하지만, 현재는 다른 장면보다 깨끗하고 현대적인 쇼케이스 인상이 강하다.

## 문제 분류와 첫 수정 대상

| 분류 | 확인 결과 | 우선순위 |
| --- | --- | ---: |
| 트랙 | 색·연석·벽의 계층은 읽히며, 배경의 단순한 노을색은 의도된 PS2 방향이다. 다음 단계에서 높이·거리 대비를 A/B한다. | 2 |
| 차량 | 50% 축소에서도 플레이어·AI 색과 방향이 구분된다. 재질·실루엣 접점은 다음 단계에서 검수한다. | 3 |
| 카메라 | Driving 모드 전환 직후 기본 카메라가 잠시 노출된다. 첫 화면의 트랙 판독성을 즉시 확보해야 한다. | **1** |
| HUD | 불투명 패널은 유지되지만 blur·큰 그림자·현대식 민트 탭이 남아 있다. `P4`에서 각진 패널과 큰 숫자로 재구성한다. | 4 |
| 피드백 | 레이싱 라인·체크포인트·브레이크 마커는 명확하지만, 속도·연석·충돌의 짧은 화면 피드백은 아직 없다. | 5 |

## 이번 실행에서 적용한 최소 변경

Driving 장면이 마운트되거나 Chase/Cockpit 시점을 전환할 때, 현재 물리 시작 스냅샷으로 카메라를 즉시 배치하도록 렌더 전용 초기화 경계를 추가했다. 차량 포즈·속도·타이어 힘·AI 입력·fixed timestep은 변경하지 않는다.

이 변경은 `PS2-P0`의 첫 A/B 대상으로 기록한다. 다음 단일 마일스톤은 `PS2-P1 — 트랙 색·높이·가독성`이며, 카메라 기준선이 안정된 상태에서 도로·잔디·연석·벽의 명도와 높이 계층을 조정한다.

## 기준 캡처

### 960×540

| 화면 | 캡처 |
| --- | --- |
| Training | ![Training 960x540](visual-baseline/2026-08-04/960x540/training.png) |
| Driving | ![Driving 960x540](visual-baseline/2026-08-04/960x540/driving.png) |
| Race Weekend | ![Race Weekend 960x540](visual-baseline/2026-08-04/960x540/weekend.png) |
| Design Studio | ![Design Studio 960x540](visual-baseline/2026-08-04/960x540/design.png) |

### 1440×900

| 화면 | 캡처 |
| --- | --- |
| Training | ![Training 1440x900](visual-baseline/2026-08-04/1440x900/training.png) |
| Driving | ![Driving 1440x900](visual-baseline/2026-08-04/1440x900/driving.png) |
| Race Weekend | ![Race Weekend 1440x900](visual-baseline/2026-08-04/1440x900/weekend.png) |
| Design Studio | ![Design Studio 1440x900](visual-baseline/2026-08-04/1440x900/design.png) |

## PS2-P1 결과

`TestTrackVisual`에 물리 경계와 분리된 렌더 전용 높이 계층을 추가했다.

- Northfield 중심선 트랙: 어깨 띠를 노면보다 낮게 배치하고, 양쪽에 따뜻한 경계 색 띠를 추가했다.
- 사각 테스트 루프: 외곽·인필드 양쪽으로 낮은 어깨 링을 확장했다.
- 정적 벽: 충돌 geometry는 그대로 두고 상단 캡만 추가해 수직 경계를 분리했다.
- 바깥 잔디: 인필드보다 한 단계 어두운 `grassShadow`로 트랙 면적을 분리했다.

모든 변경은 `TestTrackDefinition`의 폭·경계·콜라이더를 변경하지 않는 렌더 전용 변경이다. P1 캡처에서 주행 가능 영역, 경계선, 다음 코너가 첫 화면에서 즉시 구분되는 것을 확인했다.

### P1 캡처

| 화면 | 960×540 | 1440×900 |
| --- | --- | --- |
| Training | ![P1 Training 960x540](visual-baseline/2026-08-04/p1/960x540/training.png) | ![P1 Training 1440x900](visual-baseline/2026-08-04/p1/1440x900/training.png) |
| Driving | ![P1 Driving 960x540](visual-baseline/2026-08-04/p1/960x540/driving.png) | ![P1 Driving 1440x900](visual-baseline/2026-08-04/p1/1440x900/driving.png) |
| Race Weekend | ![P1 Race Weekend 960x540](visual-baseline/2026-08-04/p1/960x540/weekend.png) | ![P1 Race Weekend 1440x900](visual-baseline/2026-08-04/p1/1440x900/weekend.png) |

## PS2-P2 결과

`LowPolyCar`의 큰 차체 면과 보조 차체 패널을 렌더 전용 저폴리·무광 기준으로 통일했다.

- 차체 재질의 금속성을 낮추고 거칠기를 높여 환경 반사보다 면 분할과 그림자가 먼저 읽히게 했다.
- 노즈·사이드포드·콕핏·에어박스·배기 주변·윙 지지부의 차체색 패널에 `flatShading`을 적용했다.
- 플레이어와 AI 차량의 색 계약, hero/grid 공통 `LowPolyCar` 외관 계약, 차량 포즈·물리 스냅샷은 변경하지 않았다.
- 960×540 캡처를 480×270으로 정확히 축소해 차량의 방향·색·주요 파츠 접점이 유지되는지 확인했다.

시각 검수 결과, Design Studio에서는 노즈·전륜·콕핏·리어 윙이 낮은 폴리곤 면으로 분리되어 읽혔고, Training·Driving에서는 플레이어와 AI 차량이 배경 및 서로 다른 차체색에서 분리되었다. 50% 축소에서도 차체 방향과 색 구분은 유지되지만, 작은 윙 지지부와 타이어 내부 디테일은 의도적으로 단순화된다.

### P2 캡처

| 화면 | 480×270 축소 | 960×540 | 1440×900 |
| --- | --- | --- | --- |
| Training | ![P2 Training 480x270](visual-baseline/2026-08-04/p2/480x270/training.png) | ![P2 Training 960x540](visual-baseline/2026-08-04/p2/960x540/training.png) | ![P2 Training 1440x900](visual-baseline/2026-08-04/p2/1440x900/training.png) |
| Driving | ![P2 Driving 480x270](visual-baseline/2026-08-04/p2/480x270/driving.png) | ![P2 Driving 960x540](visual-baseline/2026-08-04/p2/960x540/driving.png) | ![P2 Driving 1440x900](visual-baseline/2026-08-04/p2/1440x900/driving.png) |
| Race Weekend | ![P2 Race Weekend 480x270](visual-baseline/2026-08-04/p2/480x270/weekend.png) | ![P2 Race Weekend 960x540](visual-baseline/2026-08-04/p2/960x540/weekend.png) | ![P2 Race Weekend 1440x900](visual-baseline/2026-08-04/p2/1440x900/weekend.png) |
| Design Studio | ![P2 Design Studio 480x270](visual-baseline/2026-08-04/p2/480x270/design.png) | ![P2 Design Studio 960x540](visual-baseline/2026-08-04/p2/960x540/design.png) | ![P2 Design Studio 1440x900](visual-baseline/2026-08-04/p2/1440x900/design.png) |

## PS2-P3 결과

주행 카메라에 속도·접촉 피드백을 추가했다. 모두 렌더 스냅샷과 Rapier 텔레메트리를 읽어 계산하며, `VehicleSimulation`의 위치·속도·타이어 힘·입력에는 쓰지 않는다.

- 차량 속도에 따라 FOV를 최대 3°까지 넓혀 직선 가속의 속도감을 추가했다. 30m/s에서 최대치에 도달하고 저속에서는 기본 FOV를 유지한다.
- 연석·벽 접촉 수의 상승분만 이벤트로 감지해 짧은 상향 이동·후방 이동·roll을 적용했다. 지속 접촉을 매 프레임 누적하지 않으며 지수 감쇠로 빠르게 복귀한다.
- 콕핏 시점은 차체 외피에 가려지지 않도록 로컬 전방 오프셋 `-0.45m`, 높이 `1.18m`로 보정했다. 노즈·주행 방향·차체 가장자리를 함께 남긴다.
- 가속 입력 후 추적/콕핏 전환을 검증하는 E2E 시나리오를 추가했다.

최종 캡처에서 추적 시점은 차량·AI 상대·다음 경계를 계속 판독할 수 있었고, 콕핏 시점은 차체가 화면 하단에 남으면서 전방 도로와 연석을 확인할 수 있었다. 카메라 impulse는 물리 포즈를 변경하지 않는 렌더 전용 상태로 제한했다.

### P3 캡처

| 화면 | 960×540 | 1440×900 |
| --- | --- | --- |
| Driving / 추적 시점 · 가속 후 | ![P3 Driving speed 960x540](visual-baseline/2026-08-04/p3/960x540/driving-speed.png) | ![P3 Driving speed 1440x900](visual-baseline/2026-08-04/p3/1440x900/driving-speed.png) |
| Driving / 콕핏 시점 · 가속 후 | ![P3 Cockpit speed 960x540](visual-baseline/2026-08-04/p3/960x540/cockpit-speed.png) | ![P3 Cockpit speed 1440x900](visual-baseline/2026-08-04/p3/1440x900/cockpit-speed.png) |

## PS2-P4 결과

주행 HUD와 모드 메뉴를 현대적인 glassmorphism보다 2000년대 콘솔 계기판에 가까운 불투명 정보판으로 재구성했다.

- 주행 HUD를 속도·기어·RPM의 핵심 계기판과 노면·트랙·타이어·접지의 저밀도 진단 영역으로 분리했다.
- 핵심 숫자는 큰 monospace 수치로 유지하고, 진단 텍스트는 2열 정보 블록으로 낮춰 다음 코너와 차량을 덜 가리게 했다.
- Canvas 위 HUD·Training 디버그 오버레이·입력 툴바에서 `backdrop-filter`를 제거하고 사각 모서리·하드 선택 상태·amber 강조색을 적용했다.
- 모드 전환 탭과 주행 카메라 선택 상태를 같은 직사각형 선택 문법으로 통일했으며, 기존 role·aria-label·입력 계약은 유지했다.

실제 로컬 웹 화면을 960×540과 1440×900에서 확인한 결과, Driving에서는 차량과 오른쪽 다음 경계가 HUD 밖에 남았고, Training에서는 레이싱 라인과 브레이크 마커가 오버레이 뒤에서 계속 읽혔다. Race Weekend와 Design Studio는 상단 메뉴의 선택 상태만 amber로 강조되어 Canvas의 차량 색과 충돌하지 않았다.

### P4 캡처

| 화면 | 960×540 | 1440×900 |
| --- | --- | --- |
| Training | ![P4 Training 960x540](visual-baseline/2026-08-04/p4/960x540/training.png) | ![P4 Training 1440x900](visual-baseline/2026-08-04/p4/1440x900/training.png) |
| Driving | ![P4 Driving 960x540](visual-baseline/2026-08-04/p4/960x540/driving.png) | ![P4 Driving 1440x900](visual-baseline/2026-08-04/p4/1440x900/driving.png) |
| Race Weekend | ![P4 Race Weekend 960x540](visual-baseline/2026-08-04/p4/960x540/weekend.png) | ![P4 Race Weekend 1440x900](visual-baseline/2026-08-04/p4/1440x900/weekend.png) |
| Design Studio | ![P4 Design Studio 960x540](visual-baseline/2026-08-04/p4/960x540/design.png) | ![P4 Design Studio 1440x900](visual-baseline/2026-08-04/p4/1440x900/design.png) |

## PS2-P5 결과

선택적 화면 프로필을 실제 로컬 웹의 동일한 Training 장면에서 A/B 비교했다.

- `nostalgia-soft`를 기본값으로 두고 Canvas에만 약한 채도 감소·대비 보정·0.16px blur를 적용했다. DOM HUD는 선명하게 유지한다.
- `nostalgia-sharp`는 별도 흐림 없이 현재 `antialias: false`와 저폴리 외곽선을 그대로 사용한다.
- `clean-debug`는 채도를 낮추고 대비를 유지해 물리·AI 상태와 주행선을 우선 판독한다.
- 내부 저해상도 렌더 타깃·디더링·CRT scanline·색수차는 추가하지 않았다. 현재 기본 Geometry·팔레트·카메라만으로 목표 인상이 형성되며, 강한 후처리는 차량·HUD 판독성과 성능에 불필요한 위험이 있기 때문이다.
- 오디오 이벤트 연결은 현재 M2A-0에 독립 오디오 믹서·자산 계약이 없으므로 이번 시각 마일스톤에서 보류했다. 사운드 시스템이 별도 마일스톤으로 승인되면 RPM·슬립·연석 이벤트와 함께 연결한다.

세 프로필 모두 물리·입력·DOM HUD를 변경하지 않았고, 실제 웹에서 선택값을 전환해도 Training Lab 모드와 Canvas 장면이 유지되는 것을 E2E로 확인했다.

### P5 프로필 비교 캡처

| 프로필 | 캡처 |
| --- | --- |
| `nostalgia-soft` | ![P5 nostalgia soft](visual-baseline/2026-08-04/p5/nostalgia-soft.png) |
| `nostalgia-sharp` | ![P5 nostalgia sharp](visual-baseline/2026-08-04/p5/nostalgia-sharp.png) |
| `clean-debug` | ![P5 clean debug](visual-baseline/2026-08-04/p5/clean-debug.png) |

## 버전 이력

| 날짜 | 버전 | 변경 |
| --- | --- | --- |
| 2026-08-04 | 0.6.0 | PS2-P5 Canvas 화면 프로필 3종과 선택적 후처리 범위를 실제 웹에서 비교하고, 저해상도·오디오 보류 결정을 기록 |
| 2026-08-04 | 0.5.0 | PS2-P4 HUD 핵심/진단 계층, 불투명 패널, amber 메뉴 상태를 적용하고 4개 화면의 2개 viewport 캡처를 추가 |
| 2026-08-04 | 0.4.0 | PS2-P3 속도 FOV kick·연석/벽 impulse·콕핏 시야 보정과 가속 입력 E2E·2개 viewport 캡처를 추가 |
| 2026-08-04 | 0.3.0 | PS2-P2 차량 차체 재질·flat shading을 통일하고 480×270·960×540·1440×900 캡처를 추가 |
| 2026-08-04 | 0.2.0 | PS2-P1 트랙 어깨·경계 띠·벽 상단 캡을 적용하고 3개 트랙 장면의 2개 viewport 캡처를 추가 |
| 2026-08-04 | 0.1.0 | 네 화면의 960×540·1440×900 기준 캡처, 렌더 설정 기록, 문제 분류와 첫 카메라 수정 대상 확정 |
