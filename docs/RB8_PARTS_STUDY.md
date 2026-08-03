# RB8 2012 파츠별 형상 연구

작성일: 2026-08-03
대상: `S1 2012 Open-Wheel`의 무표식 `RB8 Form Study`
범위: 모델링·렌더링 기준 재정립. 물리 파라미터나 실제 팀 자산은 포함하지 않는다.

## 2026-08-03 구현 기록 — 전방 접점·시점 검수 패스

이번 반복에서 파츠 연결을 확인할 수 있는 검수 경계를 먼저 고정하고, 전방에서 분리되어 보이던 접점을 보강했다.

- 디자인 스튜디오에 `COCKPIT` 프리셋을 추가해 시트·스티어링 휠·콕핏 림·노즈를 운전자 시야에서 확인한다.
- `FRONT`, `SIDE`, `REAR` 프리셋은 버튼 전환 때 카메라 위치·주시점·FOV를 함께 재설정해 같은 기준으로 비교한다.
- 콕핏 프리셋에서는 외부 드라이버 메시를 숨겨 헬멧이 카메라를 가리지 않게 하되, 실제 Driving의 콕핏 카메라와 차량 물리는 변경하지 않는다.
- 프런트 윙 pylon의 노즈·메인 플레인 collar를 추가해 링크 양 끝의 접점을 고정했다.
- 사이드포드 흡입구에 body-colored surround를 겹쳐 검은 cavity가 외피에 붙은 개구부로 읽히게 했다.
- 모든 변경은 `LowPolyCar`와 디자인 스튜디오의 렌더 전용 범위에 머물며 `VehicleControlInput`, Rapier, AI 위치·속도 소유권은 유지한다.

브라우저 수동 검수 기준은 다섯 시점에서 부유 파츠·차체 관통·휠 축 불일치가 없는지 확인하는 것이다. 이 기록은 프로젝트 내부 시각 기준이며 실제 RB8의 CAD 또는 픽셀 단위 복제를 의미하지 않는다.

## 결론

현재 `LowPolyCar`는 2012년형 부품 이름과 저폴리 메시를 대부분 갖추고 있지만, 실제 차량처럼 보이게 만드는 부품 간 연결 관계가 일부 단순화되어 있다. 특히 프런트 윙, 전륜 서스펜션, 사이드포드-배기-디퓨저, 리어 윙-기어박스의 연결을 별도 파츠의 집합이 아니라 하나의 공력 패키지로 다시 검증해야 한다.

기존 `RB8_FORM_SCORECARD.md`의 100/100은 프로젝트 내부 무표식 렌더 점수다. 실차의 1:1 재현이나 각 파츠의 구조적 정확성을 증명하는 점수로 사용하지 않으며, 이번 문서의 파츠별 검증이 끝나기 전까지는 다음 구현의 완료 근거로 사용하지 않는다.

## 2026-08-03 구현 기록 — cockpit to rear spine

이번 반복에서는 콕핏 뒤의 파츠를 개별 장식이 아니라 중앙 구조 패키지로 연결했다.

- 에어박스: body 외피와 carbon inlet lip을 분리해 전면 throat만 어둡게 유지
- 엔진 커버: 에어박스 뒤에서 코크 보틀 끝까지 좁아지는 `ENGINE_COVER_SPINE_STATIONS` 추가
- 기어박스: 후방 diffuser와 리어 윙 지지점까지 낮아지는 `GEARBOX_TAIL_STATIONS` 추가
- 리어 윙: gearbox 중심선에서 main wing으로 올라가는 central support와 하부 mounting collar 추가
- 기존 driver·seat·headrest·steering column·휠·물리 스냅샷 계약은 유지

추가 station과 높이·폭은 사진에서 직접 계측한 실차 치수가 아닌 렌더 전용 `initial_assumption`이다. 이 변경은 `LowPolyCar`의 geometry·material만 수정하며, 공력 힘이나 차량 포즈를 계산하지 않는다.

## 2026-08-03 구현 기록 — 모든 인게임 차량 공통 적용

AI 교육과 Race Weekend AI가 별도 `GridCar` 외관을 사용하던 경로를 제거했다. 현재 `hero`와 `grid` 호출은 모두 같은 RB8 Form Study geometry를 표시하고, 차이점은 차량 색상과 AI 차량의 그림자 정책뿐이다. 따라서 디자인 스튜디오에서 확인한 노즈·콕핏·사이드포드·엔진 커버·기어박스·리어윙 중심 구조가 교육·주행·레이스 화면에서도 동일하게 유지된다.

## 기준과 근거

### 저장된 로컬 레퍼런스

- `rb8-jerez-rear-2012.jpg`: 높은 리어 윙, 중앙 지지대, 코크 보틀 수축, 넓은 후륜, 디퓨저 층
- `w03-barcelona-test-2012.jpg`: 낮은 노즈, 높은 모노코크, 콕핏 뒤 엔진 커버 수축, 전후 stance
- `f2012-malaysia-front-suspension-2012.jpg`: 허브·브레이크·링크·노즈의 실제 접점 관계
- `w03-malaysia-front-suspension-2012.jpg`: 얇은 carbon suspension rod와 upright·브레이크 패키지
- `f2012-italian-gp-cockpit-2012.jpg`: 낮은 시트, 어깨·헬멧·콕핏 림·스티어링 휠의 깊이 관계
- `mp4-27-malaysia-exhaust-2012.jpg`: 사이드포드 어깨, 흡입구, 바닥 언더컷, 후방 배기 주변의 표면 관계

### 외부 기술 자료

- [Formula 1 — Adrian Newey 차량 기술 회고](https://www.formula1.com/en/latest/article/insight-a-closer-look-at-the-12-constructors-title-winning-cars-adrian-newey.1QAwEdYMG8hAz76kEHGefF): RB8의 배기 위치 규정 변화, Coanda 배기, 사이드포드 바닥 터널, 디퓨저 측면 유동 관계
- [FIA 2012 Formula One Technical Regulations](https://argent.fia.com/web/fia-public.nsf/13C06BF289E0E36FC12579C9003CB5B9/%24FILE/1-2012%20TECHNICAL%20REGULATIONS%2009-03-2012.pdf): 배기 출구의 후방·측방·높이·각도 제한, 휠·브레이크·서스펜션 구조 경계
- [RaceFans — RB8 exhaust feeds its diffuser](https://www.racefans.net/2012/03/14/red-bull-rb8-exhaust-blown-diffuser-diagram/): 상부 배기 출구, downward ramp, sidepod 하부 tunnel, 디퓨저 외측 sealing 관계
- [F1Technical — Red Bull RB8](https://www.f1technical.net/f1db/cars/986/red-bull-rb8): step nose의 driver-cooling aperture와 2012년형 RB8의 전체 기술 방향

## 파츠별 대조 결과

| 파츠 | 2012 RB8에서 읽어야 하는 관계 | 현재 구현 상태 | 다음 검증 기준 |
|---|---|---|---|
| 노즈·step | 낮은 선단과 높은 모노코크가 한 번 꺾이고, 상면 aperture가 기능성 개구부로 보인다. | station과 상면 bridge는 있으나 step 표면과 aperture가 단순한 평면 장식으로 읽힐 위험이 있다. | 정면·측면에서 선단-단차-모노코크의 높이 변화를 하나의 외피로 확인한다. |
| 프런트 윙 | main plane, flap, cascade, endplate, nose pylon이 전륜 축과 같은 패키지로 연결된다. | 다층 패널과 pylon은 있으나 저폴리 평판 비중이 높아 실제 날개 단면보다 판 묶음으로 보일 수 있다. | 모든 층이 서로 겹치고, pylon 양 끝이 노즈·main plane에 닿으며, 끝단이 독립 부품처럼 떠 보이지 않아야 한다. |
| 전륜 서스펜션 | 얇은 wishbone·rod가 허브/upright와 모노코크의 구조점 사이를 연결하고 브레이크가 휠 뒤에 붙는다. | 링크·upright·caliper는 있으나 링크 수와 각도가 일반화되어 있어 RB8 계열의 상·하부 관계가 약하다. | wheel centre, upright, upper/lower wishbone, steering arm, brake duct의 5개 접점을 같은 축에서 확인한다. |
| 콕핏·드라이버 | 낮은 시트에 어깨가 잠기고, 헬멧은 headrest·콕핏 림 안에 있으며 휠은 몸통 앞쪽에 붙는다. | seat basin, torso, helmet, visor, arms, wheel, headrest가 있다. 화면에서는 운전자와 셀이 어두워 접점이 약해질 수 있다. | 3/4와 cockpit view에서 헬멧·어깨·팔·휠이 빈 공간 없이 겹치고, 외부 드라이버가 차체 밖으로 튀지 않아야 한다. |
| 사이드포드 흡입구 | 높은 어깨 아래의 넓은 개구부와 바닥으로 파인 언더컷이 코크 보틀로 이어진다. | station, black intake slot, lip, lower channel은 있으나 slot이 실제 cavity보다 세로 막대처럼 읽힐 수 있다. | 정면 사선에서 intake lip·검은 cavity·pod shoulder·floor channel의 단면이 분리되어야 한다. |
| 배기·Coanda ramp | 상부·후방의 배기 출구 뒤에 downwash ramp가 있고, 하부 tunnel은 배기 흐름과 다른 디퓨저 측면 경로를 만든다. | 배기 cylinder, ramp, dark channel, diffuser는 있으나 출구와 ramp의 방향성이 약하다. | 배기 출구가 차체에 묻히고 ramp 끝이 diffuser side로 향하되, 실제 물리 공력 효과를 구현했다고 표현하지 않는다. |
| 엔진 커버·에어박스 | 낮은 airbox와 roll-hoop가 드라이버 뒤에서 엔진 커버·코크 보틀로 연속된다. | airbox, roll hoop, cover fin, engine-cover stations가 있다. | 후면에서 airbox-커버-gearbox가 중앙 spine으로 이어지고 수직 핀이 떠 있지 않아야 한다. |
| 리어 서스펜션·기어박스 | 후륜 허브에서 얇은 링크가 기어박스 주변으로 모이고, central support가 리어 윙 하중 경로를 만든다. | 후륜 링크와 tail fairing, central rear-wing supports가 있다. | 링크가 타이어 안쪽에서 끝나지 않고 gearbox/upright 양쪽에 닿으며, support가 rear wing에 겹쳐야 한다. |
| 리어 윙·DRS·beam wing | 높은 main wing, DRS flap, endplate, beam wing이 서로 다른 높이의 얇은 층으로 쌓인다. | 두 개의 planform panel, endplate, beam wing, support가 있다. | 후면 정면에서 층 사이 간격과 중앙 지지대가 보이고, 블록형 수직판이 없어야 한다. |
| floor·diffuser | 바닥은 낮고 넓으며, 디퓨저는 후방으로 올라가고 strake·타이어 squirt 경계가 분리된다. | floor panel, diffuser plane, 5개 strake가 있다. | 후면 하부에서 diffuser exit가 floor와 기어박스에 접촉하고 strake가 같은 경사면에 놓여야 한다. |
| 휠·타이어·브레이크 | 13인치 휠의 작은 림과 두꺼운 slick sidewall, upright·disc·caliper가 휠 안쪽에 밀집한다. | 두꺼운 타이어, 작은 림, spoke, hub, upright, caliper가 구현되어 있다. | 전후 타이어 폭 차이, 허브 축, steer 부모 그룹과 spin 자식 그룹을 네 바퀴에서 유지한다. |
| 미러·바지보드·세부 aero | 작은 mirror stay와 bargeboard가 차체 외피에 붙어 흐름 방향을 만든다. | mirror, stay, bargeboard, link가 있다. | 얇은 rod와 짧은 panel만 남기고 차체에서 떨어진 장식판은 제거한다. |

## 현재 구현에 대한 재판정

현재 모델은 “부품 목록” 기준으로는 충분하지만 “부품 연결” 기준으로는 다음 세 영역이 가장 낮다.

1. 프런트 윙과 전륜 서스펜션의 구조점이 하나의 전방 패키지로 읽히는지
2. 사이드포드 흡입구·상부 배기·하부 tunnel·디퓨저 외측이 실제 RB8의 공기 경로처럼 연결되는지
3. 콕핏·엔진 커버·기어박스·리어 윙 중앙 지지대가 하나의 중심 spine으로 이어지는지

따라서 다음 모델링 반복은 새 파츠를 무작정 추가하는 방식이 아니라, 위 세 영역의 접점·단면·카메라 판독성을 먼저 고정해야 한다.

## 구현 순서

1. 정면·측면·후면 기준선을 먼저 고정하고 노즈, 휠 축, 콕핏 입구, 리어 윙 높이를 같은 좌표표에서 검증한다.
2. 프런트 윙과 suspension을 통합해 pylon·wishbone·upright·브레이크 덕트의 접점을 만든다.
3. sidepod 외피를 shoulder·intake cavity·undercut tunnel·coke-bottle exit의 네 표면으로 재구성한다.
4. 배기 출구와 ramp를 RB8의 시각적 공기 경로로 정리하되, 게임 물리의 `AeroModel`과 섞지 않는다.
5. cockpit·airbox·engine cover·gearbox·rear wing support를 중앙 spine으로 연결한다.
6. diffuser와 rear aero를 얇은 층으로 정리하고 후면에서 부유·clipping을 검사한다.
7. 마지막에 휠·브레이크·세부 aero의 재질 대비를 조정하고 기존 steer/spin 회귀를 확인한다.

## 판정 규칙

- 사진의 투시를 CAD 치수로 해석하지 않는다. 확인되지 않은 수치는 `initial_assumption`으로 표시한다.
- 실제 팀 로고·스폰서·리버리·드라이버 자산은 사용하지 않는다.
- 모델링 변경은 `LowPolyCar`의 읽기 전용 외관에만 적용한다. `VehicleControlInput`, 120Hz fixed-step, Rapier 포즈 소유권, 타이어 힘, AI 위치 경계는 변경하지 않는다.
- 파츠별 만점은 단일 시점이 아니라 `3/4 VIEW`, `FRONT`, `SIDE`, `REAR`, 필요 시 cockpit view에서 모두 접점이 유지될 때만 인정한다.
- 다음 구현 후에는 전체 점수보다 파츠별 pass/fail 증거를 먼저 남긴다.
