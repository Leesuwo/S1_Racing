# Architecture

## 현재 구조

```text
src/
├─ app/       React 앱 셸과 WebGL2 검사
├─ game/
│  ├─ loop/   고정 스텝 시간 관리
│  ├─ input/  차량 입력 경계
│  ├─ physics/ 향후 순수 물리 코드
│  └─ vehicle/ 향후 차량 도메인 코드
├─ rendering/ 향후 Three.js/R3F 표시 계층
├─ state/     메뉴·세션 상태
├─ telemetry/ 향후 수치 기록
└─ ui/        HUD와 메뉴
```

## 의존성 방향

```text
app/ui → state/input → game domain → physics math
rendering → read-only snapshots
```

물리·수학 모듈은 React, R3F, Zustand, DOM을 import하지 않는다. 브라우저 이벤트와 렌더링 오브젝트는 경계 계층에서만 다룬다.

## 데이터 흐름

```text
input devices
→ VehicleControlInput
→ fixed-step simulation
→ immutable/read-only render snapshot
→ R3F canvas
```

## 테스트 경계

- 단위 테스트: 순수 시간·입력·수학 함수
- 통합 테스트: 물리 세계와 차량 상태
- E2E: 앱 부팅, 캔버스, 메뉴, 포커스·일시정지 흐름
- 성능 테스트: 20대 레이스와 최악 환경에서 별도 실행
