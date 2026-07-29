# F1 2012 동역학·온보드 조사 자료

## 1. 조사 목적

S1 Racing의 평면 차량 모델을 특정 팀의 차량이나 실제 텔레메트리 복제품으로 표현하지 않고, 2012년 F1에서 관찰되는 공통 거동에 가깝게 조정하기 위한 조사 기록이다.

조사 기준일: 2026-07-29

## 2. 자료를 통해 확인한 사실

### 2.1 FIA 2012 기술 규정

[FIA 2012 Formula One Technical Regulations 원문 PDF](https://argent.fia.com/web/fia-public.nsf/25971A2138FB2747C1257A850051CF1B/%24FILE/2012%20TECHNICAL%20REGULATIONS%2009-03-2012.pdf)에서 다음 항목을 직접 확인했다.

| 항목 | 규정 근거 | S1 적용 |
|---|---|---|
| 최소 중량 | Article 4.1, 640 kg | `massKg: 640`의 기준선 |
| 전·후 하중 | Article 4.2, 전륜 291 kg·후륜 342 kg 이상 | 약 46/54% 정적 하중 배분 |
| 엔진 | Article 5.1, 2.4 L·90° V8·18,000 rpm | 3,500 rpm idle·18,000 rpm redline·7단 비율 |
| KERS | Article 5.2, 최대 60 kW·랩당 400 kJ 방출 | 현재 파워트레인에서는 별도 입력 마일스톤으로 보류 |
| 서스펜션 | Article 10.1, sprung suspension | 4개 레이캐스트 휠과 하중 기반 서스펜션 유지 |
| ABS | Article 11.5.1, 바퀴 잠김을 방지하는 설계 금지 | 타이어 각속도와 combined force로 lock-up 여지 보존 |
| 휠 | Article 12.4, 전륜 305–355 mm·후륜 365–380 mm·건조 직경 최대 660 mm | 물리 휠 반지름 0.33 m 기준 |

### 2.2 공식 2012 영상

공식 Formula1.com에서 다음 영상을 확인 대상으로 삼았다.

- [Sebastian Vettel 2012 United States GP pole lap](https://www.formula1.com/en/video/mega-quali-laps-sebastian-vettels-pole-lap-at-the-2012-united-states-grand-prix.1714053993819089057): 짧은 조향 입력으로 차체가 빠르게 회전하고, 코너 탈출에서 차체가 크게 미끄러지기보다 라인에 붙어 가속하는 기준 영상이다.
- [Brazil 2012: Best Onboards](https://www.formula1.com/en/video/brazil-2012-best-onboards.1687508295906982814): 추월·제동·노면 변화가 섞인 레이스 온보드 자료로, 브레이크에서 차체가 강하게 감속한 뒤 turn-in에서 점진적으로 조향을 늘리는 흐름을 확인한다.
- [F1 TV 2012 season archive](https://f1tv.formula1.com/page/926/full-race-replays-and-highlights): 위 온보드와 2012 시즌 레이스 리플레이의 공식 색인이다.

브라우저에서는 Formula1.com 쿠키 선택 창 때문에 영상 재생 자체까지는 진행하지 못했다. 따라서 영상 페이지의 공식 제목·길이·설명과 함께 FIA 규정, 공력·제동 기술 설명을 교차 확인했고, 영상에서 관찰할 동작 항목은 런타임 플레이테스트의 기준으로 사용했다.

### 2.3 공력·제동의 해석

- [Mercedes-AMG PETRONAS의 다운포스 설명](https://www.mercedesamgf1.com/news/feature-downforce-in-formula-one-explained)은 고속에서 다운포스가 차량을 지면에 붙이고, 다운포스가 줄면 직선 속도는 늘지만 차체가 더 미끄럽고 후미가 불안정해진다고 설명한다. 또한 약 150 km/h에서 차량 무게에 가까운 다운포스, 최고속 부근에서 3–4배 중량 수준이라는 규모를 제시한다.
- [Honda F1 차량 성능 설명](https://global.honda/en/F1/features/f1-explained/10/)은 다운포스가 코너링·제동 안정성을 높이고, 서스펜션이 가속·제동·코너링 때 차체 자세를 제어한다고 설명한다.
- [Raceteq의 F1 제동 설명](https://www.raceteq.com/articles/2024/07/inside-formula-1-brakes-the-science-and-materials-behind-f1-cars-decelerate)은 F1 제동의 강한 감속, 브레이크 입력에 따른 전·후 제동 분배, ABS 부재와 lock-up 가능성을 설명한다. 제시된 최신 세대 수치는 2012 차량에 그대로 이식하지 않고 동작 원리만 사용한다.

150 km/h를 41.67 m/s, 차량 중량을 640 kg으로 환산하면 중력은 약 6.28 kN이다. 이를 같은 속도에서의 다운포스 시작값으로 삼으면:

```text
downforceCoefficient ≈ 6,280 / 41.67² ≈ 3.6 N/(m/s)²
```

S1에서는 300 km/h에서 약 4배 중량까지 연결되는 고속 안정성 여유를 포함해 `4.4 N/(m/s)^2`를 initial_assumption으로 채택했다. 이 값은 특정 팀의 실제 `CdA`를 주장하지 않는다.

## 3. 현재 코드 적용표

| 거동 목표 | 적용 위치 | 변경 방향 |
|---|---|---|
| 저질량·빠른 방향 전환 | `VehiclePhysics.ts`, `RapierChassisSuspension.ts` | 640 kg, 관성·차체 기준선 축소 |
| 작은 F1 슬립각 | `TireModel.ts`, `VehiclePhysics.ts` | 횡강성 균형과 slip stiffness 상향 |
| 고속에서 붙는 차체 | `AeroModel.ts`, Rapier 설정 | 다운포스 계수 4.4, 전방 공력 배분 43% |
| 강한 고속 제동 | `VehiclePhysics.ts`, Rapier 타이어 힘 | 브레이크 허용력 상향, 타이어 힘 한계로 실제 사용량 제한 |
| 제동-회전 전환 안정성 | `SingleOpponentAI.ts` | 60 m 제동 미리보기, 속도 벡터 방향의 카운터스티어, 저속 스로틀 복귀 |
| 단단한 차체 자세 | `Suspension.ts`, Rapier 설정 | 짧은 travel, 높은 spring rate, 과도한 rebound 억제 |
| 2012 파워트레인 감각 | `VehiclePhysics.ts`, `Drivetrain.ts` 입력값 | 2.4 L V8 기준 18,000 rpm·7단 비율 |

## 4. 남은 한계와 다음 순서

이번 조정의 결정적 회귀 기준은 AI 고속 복합 코너가 초기 비드리프트 슬립 범위 안에 있고, 전체 랩이 120 Hz fixed-step에서 실제 체크포인트와 결승선을 순서대로 통과하는 것이다. 세부 수치와 허용 범위는 차량·타이어 실측 데이터가 확보될 때 다시 조정한다.

- 현재 모델은 2D 평면 차체와 레이캐스트 서스펜션이므로 실제 2012 차량의 pitch·roll·ride-height aero map을 완전히 재현하지 않는다.
- KERS, DRS, brake bias 조절, 연료 질량 변화는 아직 독립 입력·운영 상태가 없다.
- 공개된 2012 팀별 타이어 곡선·공력 맵이 없으므로 `4.4`와 slick tire 계수는 검증 가능한 시작점일 뿐이다.
- 다음 동역학 마일스톤은 `constant-radius skidpad → step-steer → combined braking and turning → high-speed stability` 순서로 허용 범위를 정하고, 영상은 조작 타이밍과 차체 자세의 시각 기준으로만 사용한다.

## 5. 라이선스 경계

이 문서는 공식 규정·공식 영상 페이지·기술 설명의 링크만 기록한다. 외부 영상이나 사진을 런타임 자산으로 복사하지 않으며, 특정 팀의 로고·리버리·드라이버·실차 텔레메트리를 게임에 포함하지 않는다.
