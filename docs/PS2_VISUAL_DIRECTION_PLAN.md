# PS2 레이싱 감성 시각·게임플레이 전환 계획

## 1. 문서 목적

이 문서는 Google 이미지 탐색과 Reddit의 `PS2 nostalgia` 게시물에서 사용자가 원하는 시각 인상을 추출해, S1 Racing의 그래픽과 게임 감성으로 재해석하는 계획이다. 특정 게임의 차량·트랙·UI·사운드·브랜드를 복제하지 않고, 당시 레이싱 게임과 커뮤니티의 향수 이미지에서 반복되는 화면 질감·색·카메라·피드백 원칙을 S1의 무표식 오픈휠 프로토타입에 적용한다.

이 계획은 물리·입력·AI의 설계 경계를 변경하지 않는다. 차량은 계속 `VehicleControlInput`과 `VehicleSimulation`을 통해 움직이고, 렌더러는 물리 스냅샷을 읽기만 한다.

현재 구현 단계는 **M2A-0 — AI Training Circuit & Evaluator**다. 따라서 그래픽 작업은 물리·AI 완료 기준을 대체하지 않으며, 렌더 전용 변경부터 작은 검증 단위로 진행한다.

## 2. 결론과 권장 방향

### 2.1 선택할 스타일: moodboard-first PS2 nostalgia

S1 Racing의 목표 스타일은 특정 타이틀 하나를 고르는 방식이 아니라, Google 이미지와 Reddit에서 반복되는 인상을 먼저 고정한 **moodboard-first PS2 nostalgia circuit racer**로 한다. 아래 게임은 moodboard의 감각을 레이싱 문법으로 번역하기 위한 보조 축이다.

| 레퍼런스 축 | 가져올 요소 | 가져오지 않을 요소 |
| --- | --- | --- |
| Gran Turismo 4 | 차량 실루엣의 명료함, 트랙 경계의 가독성, 정돈된 리플레이·쇼케이스 감각 | 실차·브랜드·실제 트랙·현대식 사실성 |
| Formula One 04 계열 | 낮은 콕핏 시점, 레이스 정보 밀도, 랩·포지션·타이어·차량 상태의 즉시성 | 공식 팀·드라이버·서킷 라이선스 |
| Ridge Racer V 계열 | 강한 속도감, 단순하고 큰 HUD, 색이 분명한 배경과 코너 읽기 | 도시 배경·차량 디자인·아케이드 물리 복제 |
| Burnout 3 계열 | 충돌·연석·제동·추월 순간의 카메라와 화면 피드백 | 파괴 시스템·공격 레이스 규칙 |

PS2 감성은 `NearestFilter`를 모든 텍스처에 적용하거나 화면을 무조건 낮은 해상도로 만드는 것과 다르다. 전체 인상은 저폴리 Geometry, 제한된 색상 수, 강한 명암, 짧고 명확한 피드백, 단순한 HUD가 함께 만들어야 한다.

### 2.2 사용자가 원하는 핵심 인상

Google 이미지의 `PS2 nostalgia`, `PS2 racing nostalgia`, `PS2 graphics` 탐색 결과와 Reddit의 PS2 그래픽·향수 토론을 교차해 다음을 시각적 우선순위로 둔다.

1. **soft standard-definition image:** 완전히 깨끗한 현대적 렌더보다 약간 부드럽고 흐릿한 화면을 선호한다.
2. **jagged but readable silhouette:** 안티앨리어싱이 약한 듯한 차량·가드레일·연석의 계단진 외곽선을 허용하되, 차량 방향과 트랙 경계는 선명해야 한다.
3. **fake-lighting charm:** 고급 PBR보다 버텍스 명암, 단순한 directional light, baked-looking 색 블록으로 면을 읽게 한다.
4. **warm memory color:** 노을·황색 조명·올리브 잔디·짙은 청회색 도로처럼 압축된 따뜻한 색감을 사용한다.
5. **cinematic motion:** 속도·제동·연석·충돌 순간에 짧은 motion blur, FOV 변화, 카메라 impulse를 사용한다.
6. **era-appropriate UI:** 현재의 유리 패널보다 각진 패널, 큰 숫자, 작은 보조 정보, 단일 강조색을 사용한다.

Reddit 토론은 PS2에 단일한 시각 스타일이 있다고 보기 어렵고, 게임별 차이와 CRT·업스케일러·선명도 설정의 차이가 크다는 점도 보여준다. 따라서 S1은 `PS2 하드웨어를 정확히 흉내 낸다`가 아니라 `PS2를 기억하는 사람이 즉시 알아보는 신호를 조절한다`는 목표로 고정한다.

### 2.3 soft/sharp 화면 프로필

커뮤니티 자료에서 표준해상도의 부드러움과 선명한 출력에 대한 취향이 갈리므로, 화면을 하나의 강제 필터로 고정하지 않는다.

| 프로필 | 목적 | 적용 방향 |
| --- | --- | --- |
| `nostalgia-soft` | Google 이미지·CRT 기억에 가까운 부드러운 향수 인상 | 낮은 내부 렌더 해상도 또는 가벼운 blur, 약한 색 번짐, DOM HUD는 선명하게 유지 |
| `nostalgia-sharp` | Reddit에서 언급되는 component/480p·sharp 출력 인상 | 내부 해상도 저하 없음, `antialias: false`, 계단진 실루엣과 강한 색 대비 유지 |
| `clean-debug` | 물리·AI·시각 QA | 필터·blur·카메라 shake 최소화, 텔레메트리 판독성 우선 |

기본 플레이는 `nostalgia-soft`, 개발·물리 검증은 `clean-debug`, 사용자가 선명한 화면을 선호할 때는 `nostalgia-sharp`를 사용한다. 이 프로필은 Canvas에만 적용하고 입력, 물리 timestep, DOM 접근성, HUD 텍스트에는 영향을 주지 않는다.

### 2.4 디자인 문장

> 낮은 카메라에서 무표식 오픈휠 차량의 실루엣과 노면 경계를 즉시 읽고, 제동·연석·충돌·추월 순간에 짧고 강한 화면 피드백을 받는 2000년대 콘솔 레이싱 게임.

## 3. 조사 결과

### 3.1 공식 자료와 커뮤니티 자료의 역할 구분

Sony의 PS2 역사 자료는 Emotion Engine과 Graphics Synthesizer를 당시의 실시간 3D 이미지 생성 기반으로 설명하고, Sony의 2003년 발표는 Graphics Synthesizer를 embedded DRAM을 가진 병렬 렌더링 프로세서로 설명한다. 이 자료는 S1이 PS2 하드웨어를 에뮬레이션해야 한다는 근거가 아니라, 당시 게임이 제한된 렌더 자원 안에서 실루엣·색·카메라·피드백을 우선순위로 삼았다는 배경 자료로 사용한다.

공식 자료는 PS2의 시대와 기술 배경을 확인하는 데 사용하고, Google·Reddit 자료는 사용자가 원하는 향수 인상의 반복 신호를 확인하는 데 사용한다. Reddit의 댓글은 객관적인 렌더링 사양이 아니라 사용자 경험과 취향의 자료이므로, 수치나 하드웨어 사실로 확정하지 않는다.

그로부터 다음의 구현 원칙을 도출한다.

1. 세부 부품 수보다 차량과 트랙의 큰 실루엣을 먼저 판독한다.
2. 재질 수와 텍스처 수를 늘리는 대신, 면·색·그림자·안개로 깊이를 만든다.
3. 화면 전체를 무겁게 만드는 후처리보다 카메라와 HUD의 타이밍으로 속도를 전달한다.
4. 낮은 해상도처럼 보이게 하더라도 DOM HUD의 텍스트 가독성과 입력 반응성은 유지한다.
5. `soft`, `sharp`, `clean-debug`를 비교할 수 있는 캡처 기준을 만들고 단일 필터 취향을 전체 프로젝트의 품질 기준으로 삼지 않는다.

### 3.2 Google 이미지 moodboard에서 추출한 시각 신호

Google 이미지 탐색은 출처가 섞인 시각 인덱스이므로, 검색 결과의 이미지를 프로젝트 자산으로 복사하지 않는다. 대신 반복되는 구도와 색의 방향만 추출한다.

| 반복 신호 | S1 적용 |
| --- | --- |
| 따뜻한 노을·황색 광원 | `SceneLighting`의 sun/fill 색을 따뜻한 범위에서 조정 |
| 짙은 도로와 밝은 연석 | 도로·잔디·연석의 명도 차이를 먼저 확보 |
| 멀리 사라지는 안개와 단순한 배경 | fog로 draw distance를 감추되 다음 코너 판독성은 유지 |
| 화면을 차지하는 큰 차량 실루엣 | chase 카메라를 낮추고 차체가 프레임 중심을 차지하게 조정 |
| 큰 속도계·랩·포지션 숫자 | HUD의 핵심 수치를 작은 카드가 아니라 큰 고정 영역으로 배치 |
| 약한 blur와 계단진 외곽선 | `nostalgia-soft`에서만 적용하고 `clean-debug`에서는 끈다 |

### 3.3 Reddit `PS2 nostalgia` 토론에서 추출한 시각 신호

Reddit의 `r/ps2` 토론에서는 다음 의견이 반복된다.

- PS2는 저폴리만으로 정의되지 않고, 조명·색·카메라·후처리의 조합이 중간 세대 특유의 인상을 만든다는 의견
- PS1처럼 완전히 진흙투성이인 화면과 PS3 이후의 지나치게 깨끗한 화면 사이에 있는 절충감
- 표준해상도, 계단진 외곽선, 약한 blur/flicker와 CRT 또는 업스케일러의 출력 차이
- 게임마다 스타일이 달라 하나의 `PS2 look`으로 일반화하기 어렵다는 의견

이를 S1에 적용할 때는 실제 화면 결함을 그대로 재현하지 않고, 다음처럼 조절한다.

- texture warping·clipping·심한 flicker는 의도적인 기본 효과에서 제외한다.
- vertex/fake lighting, warm color grading, limited fog, controlled motion blur는 적극 검토한다.
- blur는 경쟁 주행 HUD와 다음 코너를 가리지 않는 범위에서만 사용한다.
- 화면 옵션에서 `soft`와 `sharp`를 나눠 커뮤니티의 서로 다른 기억을 수용한다.

### 3.4 레이싱 게임별 관찰

#### Gran Turismo 4

Gran Turismo 4 공식 제품 페이지는 PS2 독점 레이싱 게임으로서 더 많은 차량·코스·레이스 모드와 향상된 물리·그래픽을 강조한다. S1에는 이를 다음처럼 번역한다.

- 차량 디자인 스튜디오와 주행 화면에서 차체 실루엣을 먼저 보여준다.
- 트랙의 노면·연석·벽·체크포인트를 색과 높이 차로 분리한다.
- 리플레이나 검수 화면에서는 장식을 늘리기보다 차량과 주행선이 잘 보이는 카메라를 제공한다.

#### Formula One 04 계열

SCEE의 Formula One 04 발표 자료는 공식 팀·드라이버·서킷과 당시 시즌 레이스 운영을 제품의 핵심으로 설명한다. S1에서는 라이선스 자산을 제외하고, 콕핏·레이스 HUD·세션 상태의 정보 구조만 참고한다.

- 콕핏뷰는 스티어링 휠·노즈·전방 트랙이 한 화면에 함께 보이게 한다.
- 포지션·랩·현재 기록·최속 기록·속도·RPM을 한 번에 읽을 수 있게 한다.
- 디버그 텔레메트리와 플레이어용 HUD를 같은 밀도로 섞지 않는다.

#### Ridge Racer V 계열

Sony ECTS 2000 press kit에서 유래한 Ridge Racer V 홍보 이미지는 큰 속도계·RPM·포지션·랩 기록과 단순한 트랙 배경을 함께 보여주는 참고 자료다. 이 자료는 공식 게임 자산을 저장하거나 복제하기 위한 것이 아니라, 작은 화면에서 핵심 레이스 정보와 코너 방향을 우선 배치하는 기준으로만 사용한다.

- HUD의 숫자와 게이지는 작게 흩어놓지 않고 큰 덩어리로 묶는다.
- 배경 장식은 차량과 다음 코너의 실루엣을 방해하지 않는 범위에서만 추가한다.
- 속도감을 위해 카메라 추적·FOV·화면 흔들림을 먼저 조정하고, 모션 블러는 후순위로 둔다.

#### Burnout 3 계열

Criterion의 공식 게임 목록은 Burnout 3: Takedown을 자사 대표 드라이빙 게임으로 소개한다. 이 계획에서는 공격 레이스 규칙이 아니라, 충돌·추월·위험 주행을 즉시 인식시키는 짧은 화면 연출을 참고한다.

- 연석을 밟았을 때 짧은 카메라 진동과 타이어음으로 접촉을 알린다.
- 충돌 시 물리 포즈를 덮어쓰지 않고, 렌더 전용 impulse만 적용한다.
- 이벤트 연출은 주행 시야를 오래 가리지 않으며, 경쟁 판독성이 우선이다.

### 3.5 Three.js 구현 근거

현재 프로젝트는 Three.js `0.177.0`과 R3F를 사용하고 있다. Three.js 공식 문서 기준으로 다음을 적용한다.

- `antialias: false`는 현재 Canvas 설정과 일치하며, PS2 시대의 선명하고 거친 실루엣 기준에 맞는다.
- 색은 sRGB 출력과 Linear-sRGB 작업 공간을 구분해야 한다. 색이 어둡거나 과하게 밝아졌을 때 조명 강도만 조정하지 않고 renderer와 texture의 색 공간을 먼저 확인한다.
- `NearestFilter`는 의도적으로 픽셀화된 텍스처에만 사용한다. 원거리 트랙 텍스처에 무조건 적용하면 깜빡임이 커질 수 있으므로, 일반 트랙 텍스처는 mipmap과 선형 필터를 우선 검토한다.
- `BasicShadowMap`과 제한된 shadow caster 수를 유지한다. 그림자 품질을 올리기 위해 차량 수·물리 업데이트·입력 반응성을 희생하지 않는다.

## 4. 디자인 시스템

### 4.1 색상

기존 `src/world/VisualPalette.ts`의 따뜻한 노을·올리브 잔디·짙은 도로·적색 연석 구조를 유지하되, 장면마다 색을 새로 만들지 않고 공통 토큰으로 고정한다.

| 역할 | 기준 방향 | 초기 가정 |
| --- | --- | --- |
| 하늘·안개 | 먼지 낀 노을, 낮은 채도 | 기존 `scene.background`·`fog`를 기준으로 A/B 비교 |
| 도로 | 짙은 차콜 또는 갈색 회색 | 잔디와 명도 차이를 먼저 확보 |
| 잔디 | 어두운 올리브 | 도로보다 따뜻하거나 노란 방향 |
| 연석 | 적색·주황색 | 코너 진입점과 위험을 즉시 표시 |
| 플레이어 | 강한 적색 또는 주황색 | 배경과 AI 차량에서 분리 |
| AI | 청록·노랑·보라·연두 | 색상만으로 차량을 구분 |
| HUD | 불투명한 흑청색 + 단일 강조색 | 유리 질감과 과도한 blur 제거 |

색상 수를 줄이되, 명도 대비를 낮춰 화면을 탁하게 만들지 않는다. 색상 값은 렌더 전용 `initial_assumption`이며 물리 계수의 근거로 사용하지 않는다.

### 4.2 Geometry와 재질

- 차량은 현재 `LowPolyCar`를 공통 기준으로 유지한다.
- 차체·윙·휠·콕핏의 큰 면을 우선하고, 작은 장식은 실루엣이나 접점 판독성을 높일 때만 추가한다.
- `flatShading`은 차량 외부 파츠·연석·벽에 우선 적용하고, 운전자·타이어처럼 둥근 형태가 필요한 파츠는 면 수를 제한한 smooth shading을 비교한다.
- PBR 반사, 환경 맵, SSR, 고해상도 재질 텍스처는 기본 스타일에서 제외한다.
- 도로·잔디·벽은 복잡한 텍스처보다 Geometry 높이와 색 블록으로 먼저 구분한다.
- 외부 차량·트랙·브랜드 자산은 추가하지 않는다. 필요한 레퍼런스 이미지는 개발 문서에 출처·라이선스와 함께 등록한다.

### 4.3 화면 해상도와 픽셀감

1. 기준 캡처 viewport는 `960×540`과 `1440×900` 두 가지로 고정한다.
2. Canvas는 현재처럼 `antialias: false`를 유지하고, DOM HUD는 브라우저 해상도에 맞춰 선명하게 렌더링한다.
3. 실제 내부 저해상도 렌더 타깃은 선택 기능으로 검토한다. 도입하더라도 물리 timestep·입력 샘플링·HUD 텍스트 해상도와 분리한다.
4. 화면 전체에 강한 CRT scanline·색수차·노이즈를 기본 적용하지 않는다. 이런 효과는 옵션 또는 사진 모드에서만 검토한다.

이 기준은 PS2의 출력 특성을 흉내 내되, 브라우저에서 글자를 읽기 어렵게 만들거나 게임 플레이를 흐리게 하지 않기 위한 절충이다.

## 5. 카메라와 게임 감성

### 5.1 추적 카메라

기존 추적 시점의 `55°` FOV를 기준으로 다음 범위를 A/B 테스트한다. 모든 값은 렌더 전용 `initial_assumption`이다.

| 항목 | 초기 범위 | 판단 기준 |
| --- | ---: | --- |
| Chase FOV | 48~55° | 차량이 작아지지 않으면서 속도감이 커지는 지점 |
| 카메라 높이 | 3.5~5.5 m | 전방 코너와 차량 자세가 동시에 읽히는 지점 |
| 후방 거리 | 8~12 m | 리어 윙이 프레임을 과도하게 차지하지 않는 지점 |
| Look-ahead | 6~14 m | 다음 코너와 차량 노즈의 균형 |
| 추적 damping | 현재값 기준 ±20% | 입력 반응보다 늦지 않는 지점 |
| FOV kick | 최대 ±3° | 직선 가속 때만 작동하고 제동 때 복귀 |

FOV kick, camera roll, shake는 물리 상태를 변경하지 않고 렌더 스냅샷과 이벤트 신호에서 계산한다. 주행 중 화면이 어지럽거나 트랙 경계가 가려지면 효과를 줄이는 것이 정답이다.

### 5.2 콕핏뷰

기존 콕핏뷰를 유지하되, 다음 시각 기준을 추가한다.

- 시선은 낮고, 스티어링 휠은 화면 하단 중앙에 남긴다.
- 노즈와 첫 번째 코너의 진입 방향이 함께 보인다.
- 운전자 외부 메시를 숨겨 카메라 앞 occlusion을 막는다.
- 화면 흔들림은 차체 roll 전체를 따라가지 않고, 연석·충돌의 짧은 렌더 impulse로 제한한다.

### 5.3 속도·충돌·연석 피드백

구현 순서는 다음과 같다.

1. 카메라 추적 지연과 look-ahead를 조정한다.
2. 속도에 따른 FOV kick과 미세한 화면 이동을 추가한다.
3. 타이어 슬립·연석·충돌 이벤트에 짧은 카메라 impulse를 연결한다.
4. 타이어음·엔진음·바람음이 준비된 이후 시각 피드백과 타이밍을 맞춘다.
5. 모션 블러·색수차·강한 bloom은 마지막 선택 항목으로 둔다.

입력 반응성, 고정 120Hz 물리, AI의 `VehicleControlInput` 경계는 위 효과보다 항상 우선한다.

## 6. HUD와 메뉴 디자인

### 6.1 주행 HUD

현재 HUD의 데이터 계약은 유지하되, 현대적인 glassmorphism을 줄이고 2000년대 콘솔 레이싱 화면처럼 정보 덩어리를 단순화한다.

- 좌상단: 랩·포지션·세션 상태
- 우상단: 미니맵 또는 다음 체크포인트 방향
- 우하단: 속도·RPM·기어를 가장 큰 숫자로 표시
- 하단 또는 좌측 보조 영역: 타이어·브레이크·노면 상태
- 개발자용 텔레메트리: Training/Debug 모드에서만 별도 패널로 표시

패널은 둥근 모서리와 강한 blur 대신 어두운 불투명 배경, 1px 선, 작은 사각 탭, monospace 숫자를 사용한다. DOM 기반 텍스트 HUD는 Canvas 픽셀화 효과에 종속시키지 않는다.

### 6.2 메뉴와 디자인 스튜디오

- 메뉴 배경은 어두운 청회색·검정, 강조색은 주황 또는 청록 하나로 제한한다.
- 탭 전환은 짧은 slide·wipe 또는 hard cut을 사용한다.
- 버튼은 큰 직사각형과 명확한 선택 상태를 사용한다.
- `RB8 Form Study`의 특정 팀·스폰서·로고 자산은 유지하지 않는다.
- 차량 디자인 스튜디오는 시대감보다 파츠 접점과 실루엣 검수가 우선이다.

## 7. 구현 마일스톤

### PS2-P0 — 시각 기준선과 리서치 보드

**목적:** 변경 전후를 객관적으로 비교한다.

- Training·Driving·Race Weekend·Design Studio의 동일 viewport 캡처
- 현재 카메라·DPR·Canvas 설정·팔레트 기록
- 레퍼런스 링크를 이 문서와 `docs/ASSET_LICENSE_REGISTER.md`의 개발 자료 경계로 연결
- 현재 그래픽 문제를 `트랙`, `차량`, `카메라`, `HUD`, `피드백`으로 분류

**완료 기준:** 같은 장면을 같은 조건으로 다시 캡처할 수 있고, 물리 문제와 시각 문제를 구분할 수 있다.

### PS2-P1 — 트랙 색·높이·가독성

- `TestTrackVisual`과 `NorthfieldGP`의 도로·잔디·연석·벽 높이 계층 통일
- 기존 `z-fighting`과 녹색 사각형 깜빡임 회귀 방지
- 도로·잔디·연석의 색상 대비를 PS2 팔레트 기준으로 재조정
- 텍스처보다 Geometry와 안개로 거리감을 구성

**완료 기준:** 첫 화면에서 주행 가능 영역과 다음 코너가 즉시 보이고, 물리 경계는 변경되지 않는다.

### PS2-P2 — 차량 실루엣과 재질

- `LowPolyCar`의 큰 실루엣, 윙·노즈·콕핏·휠 접점 우선 검수
- hero/grid 공통 외관 계약 유지
- flat shading·거친 무광 재질·제한된 금속성 비교
- 장식 추가보다 부유·겹침·접점 문제를 먼저 제거

**완료 기준:** 50% 축소 캡처에서도 플레이어·AI 차량의 방향과 색이 구분된다.

### PS2-P3 — 카메라와 속도 피드백

- chase FOV·거리·높이·look-ahead A/B 테스트
- 콕핏뷰의 시야와 노즈·휠 위치 검수
- FOV kick·연석 impulse·충돌 impulse 추가
- 효과의 강도와 지속시간에 상한을 둔다.

**완료 기준:** 입력 반응을 늦추지 않으면서 직선·제동·코너·연석·충돌의 차이가 화면에서 읽힌다.

### PS2-P4 — HUD·메뉴 재구성

- glassmorphism과 과도한 blur 축소
- 숫자·RPM·랩·포지션의 우선순위 재배치
- Training 디버그 HUD와 Driving 플레이 HUD 분리
- 좁은 viewport와 넓은 viewport에서 차량·결승선·코너를 가리지 않는지 검수

**완료 기준:** 주행 화면이 정보를 제공하면서도 차량과 다음 진행 방향을 가리지 않는다.

### PS2-P5 — 선택적 픽셀·후처리와 오디오 연결

- 128~512px 텍스처 아틀라스가 실제로 필요한지 판단
- 필요한 텍스처만 `SRGBColorSpace`와 적절한 mipmap 필터를 설정
- 선택적 내부 저해상도·디더링·vignette를 A/B 테스트
- 엔진 RPM·타이어 슬립·연석·충돌 소리를 시각 이벤트와 연결

**완료 기준:** 효과를 꺼도 기본 게임이 완성되어 보이고, 효과를 켰을 때만 시대감이 강화된다.

### PS2-P6 — 통합 검증

- 세 장면과 디자인 스튜디오의 화면 캡처 매트릭스 갱신
- Playwright E2E에서 카메라·HUD·모드 전환·입력 계약 회귀 검증
- `npm run architecture:check`와 `npm run verify` 실행
- QA 보고서에 물리·AI 통과와 시각 기준 통과를 분리 기록

**완료 기준:** PS2 감성은 확인되지만, 물리·AI·입력·접근성·성능 회귀가 없다.

## 8. 금지 범위와 라이선스

- PlayStation·Gran Turismo·Formula One·Burnout·Ridge Racer의 로고·UI 복제 금지
- 실제 팀·드라이버·스폰서·리버리·트랙·차량 모델 사용 금지
- 외부 게임 스크린샷은 계획·리서치 링크로만 참고하고 production 번들에 포함하지 않는다.
- 저장할 레퍼런스 이미지가 생기면 출처·작성자·라이선스·SHA-256을 `docs/ASSET_LICENSE_REGISTER.md`에 등록한다.
- 새 post-processing 패키지·엔진·렌더러는 기존 Three.js/R3F로 해결할 수 없는 증거와 성능 측정을 제시하기 전까지 추가하지 않는다.

## 9. 검증 기준

### 기능·물리 회귀

- `npm run typecheck`
- `npm run test`
- `npm run test:e2e`
- `npm run architecture:check` — 모듈 경계나 데이터 흐름이 변한 경우
- `npm run verify`

### 시각 검수

각 장면을 `960×540`, `1440×900`에서 캡처해 다음을 확인한다.

1. 차량 실루엣이 배경과 분리된다.
2. 도로·잔디·연석·벽의 경계가 깜빡이지 않는다.
3. 다음 코너와 주행 방향이 HUD에 가려지지 않는다.
4. 속도·제동·연석·충돌의 변화가 짧은 피드백으로 전달된다.
5. 픽셀 효과를 꺼도 텍스트와 입력 UI가 선명하다.
6. 다차량 장면에서 그림자와 후처리가 프레임을 불필요하게 압박하지 않는다.
7. 렌더 전용 변경이 물리 포즈·속도·타이어 힘·AI 입력을 변경하지 않는다.

## 10. 주요 위험과 대응

| 위험 | 대응 |
| --- | --- |
| 너무 거친 픽셀 효과로 PS1처럼 보임 | Geometry·팔레트·카메라를 먼저 고정하고 픽셀화는 선택 항목으로 둔다 |
| 현재의 현대적인 glass HUD가 시대감을 약화 | 불투명 패널·각진 탭·큰 숫자·단일 강조색으로 단계적 교체 |
| 낮은 해상도가 텍스트를 훼손 | Canvas와 DOM HUD를 분리하고 내부 저해상도는 선택 기능으로만 둔다 |
| 카메라 흔들림이 조작 판독을 방해 | 이벤트별 지속시간·각도·FOV 상한을 설정하고 옵션화한다 |
| 저폴리 차량이 장난감처럼 보임 | 파츠 수를 늘리기보다 노즈·콕핏·휠·윙의 접점과 그림자를 먼저 검수한다 |
| 색상 관리 오류로 화면이 탁하거나 과노출됨 | Three.js sRGB/Linear-sRGB 계약을 확인한 뒤 팔레트와 조명을 조정한다 |
| 그래픽 작업이 M2A-0 검증을 가림 | 렌더 전용 변경을 분리하고 `npm run verify` 결과에서 AI·물리와 시각 결과를 별도 보고한다 |

## 11. 최초 실행 작업

다음 단일 마일스톤은 **PS2-P0 — 시각 기준선과 리서치 보드**로 한다.

첫 구현에서 바로 적용할 최소 범위는 다음 세 가지다.

1. 세 장면과 디자인 스튜디오의 기준 캡처 조건 고정
2. 현재 팔레트·조명·카메라·HUD를 이 문서의 기준표와 대조
3. 트랙·차량·카메라·HUD 중 첫 수정 대상을 하나만 선정해 A/B 캡처

이후 PS2-P1부터 실제 코드 변경을 진행하며, 각 단계는 기존 S1 Racing의 `npm run verify` 완료 게이트를 통과해야 한다.

## 12. 참고 자료

### Google·Reddit moodboard 자료

- [Google Images — PS2 nostalgia graphics](https://www.google.com/search?tbm=isch&q=PS2+nostalgia+graphics): 전체적인 색·안개·화면 질감 탐색용 인덱스
- [Google Images — PS2 racing nostalgia](https://www.google.com/search?tbm=isch&q=PS2+racing+nostalgia): 레이싱 구도·HUD·차량 실루엣 탐색용 인덱스
- [Reddit r/ps2 — How would you define PS2 graphics?](https://www.reddit.com/r/ps2/comments/1uhrmm1/how_would_you_define_ps2_graphics_exactly_like/): PS2 look이 저폴리 하나가 아니라 조명·색·카메라·blur의 조합이라는 커뮤니티 토론
- [Reddit r/ps2 — Which games personify the PS2 aesthetic for you?](https://www.reddit.com/r/ps2/comments/18yprn3/which_games_personify_the_ps2_aesthetic_for_you/): PS2 시대의 스타일이 하나가 아니라 게임별로 다양하다는 취향 자료
- [Reddit r/ps2 — Is it normal that my PS2 looks this bad?](https://www.reddit.com/r/ps2/comments/1fwj07q/its_normal_that_my_ps2_looks_this_bad/): CRT·component·upscaler·sharpness에 따른 softness 인상 차이 참고

Reddit 게시물과 Google 검색 결과는 정량적 기술 사양이나 라이선스가 확인된 런타임 자산의 출처가 아니다. 사용자 취향과 moodboard 신호를 추출하는 연구 자료로만 사용하고, 이미지를 저장하거나 production bundle에 포함하지 않는다.

### 공식·1차 자료

- [PlayStation History — 2000 PlayStation 2](https://www.playstation.com/en-us/playstation-history/2000-ps2-psp/): PS2의 제품·시대 배경
- [Sony Interactive Entertainment — EmotionEngine and Graphics Synthesizer](https://sonyinteractive.com/en/press-releases/2003/emotionengine-and-graphics-synthesizer-used-in-the-core-of-playstation-become-one-chip/): EE·GS와 embedded DRAM에 대한 제조사 발표
- [Gran Turismo 4 공식 제품 페이지](https://www.gran-turismo.com/us/products/gt4/): PS2 레이싱 게임의 차량·코스·레이스 모드·물리·그래픽 방향
- [Sony India — Gran Turismo 4](https://www.sony.co.in/microsite/playstation/product/gt4/game.html): GT4의 차량·자동차 문화·PS2 제품 포지션 참고
- [Electronic Arts — Criterion Games](https://www.ea.com/ea-studios/criterion-games/games): Burnout 3의 개발사·작품 계보 참고
- [SCEE announces Formula One 04](https://www.gamespot.com/articles/scee-announces-formula-one-04/1100-6094149/): 당시 SCEE의 공식 발표를 보존한 아카이브 자료

### 렌더링 구현 자료

- [Three.js Color Management](https://threejs.org/manual/en/color-management.html): sRGB·Linear-sRGB·texture color space
- [Three.js Textures](https://threejs.org/manual/en/textures.html): `NearestFilter`, 선형 필터, mipmap 선택
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html): `antialias`, shadow map, renderer 옵션
- [Ridge Racer V promotional image — Sony ECTS 2000 press kit attribution](https://www.mobygames.com/game/3632/ridge-racer-v/promo/group-5007/image-59882/): HUD·속도감의 외부 시각 참고 링크. 저장·번들링하지 않는다.

### 프로젝트 내부 자료

- [`docs/GRAPHICS_RECONSTRUCTION_PLAN.md`](GRAPHICS_RECONSTRUCTION_PLAN.md): 기존 저폴리·트랙 링·공통 조명·HUD 정리 계획
- [`docs/DECISIONS.md`](DECISIONS.md): 렌더 전용 경계와 차량 디자인 결정 기록
- [`docs/ASSET_LICENSE_REGISTER.md`](ASSET_LICENSE_REGISTER.md): 외부 레퍼런스 출처·라이선스 등록부
- [`src/world/VisualPalette.ts`](../src/world/VisualPalette.ts): 현재 공통 색상 토큰
- [`src/world/SceneLighting.tsx`](../src/world/SceneLighting.tsx): 현재 장면 조명·안개 토큰

## 13. 버전 이력

| 날짜 | 버전 | 변경 |
| --- | --- | --- |
| 2026-08-04 | 0.8.0 | PS2-P5 Canvas 화면 프로필 3종·선택적 후처리 비교와 저해상도·오디오 보류 결정을 기록 |
| 2026-08-04 | 0.7.0 | PS2-P4 HUD 핵심/진단 계층과 불투명 amber 메뉴를 실제 로컬 웹 캡처로 검증 |
| 2026-08-04 | 0.6.0 | PS2-P3 카메라 속도 FOV·접촉 impulse·콕핏 시야 보정과 E2E·시각 검증을 완료 |
| 2026-08-04 | 0.5.0 | PS2-P2 차량 차체 면·무광 재질·flat shading 적용과 50% 축소 시각 검증을 완료 |
| 2026-08-04 | 0.4.0 | PS2-P1 트랙 어깨·경계 띠·벽 높이 계층 구현과 기준선 검증 결과를 기록 |
| 2026-08-04 | 0.3.0 | PS2-P0 기준선 캡처와 첫 렌더 전용 카메라 수정 결과를 `PS2_VISUAL_BASELINE_2026-08-04.md`에 기록 |
| 2026-08-03 | 0.2.0 | Google·Reddit `PS2 nostalgia` moodboard를 1차 디자인 기준으로 명시하고, soft/sharp/debug 화면 프로필과 커뮤니티 인상 분석을 추가 |
| 2026-08-03 | 0.1.0 | PS2 레이싱 감성 조사 결과, 디자인 시스템, 구현 마일스톤, 검증 기준을 최초 작성 |
