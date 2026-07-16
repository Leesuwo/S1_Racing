# Browser Support Matrix

## Initial support target

| Tier | OS | Browser | Status |
|---|---|---|---|
| A | macOS Apple Silicon | Chrome, Safari | target |
| A | Windows | Chrome, Edge | target |
| B | Windows | Firefox | verify after foundation |
| C | low-end laptop integrated GPU | latest Chrome/Edge | performance test |
| C | mobile browsers | Safari/Chrome | not supported in MVP |

## Runtime rules

- WebGL2를 앱 시작 시 검사한다.
- WebGL2가 없으면 렌더링을 시작하지 않고 오류 화면을 표시한다.
- Pointer Lock은 사용자의 명시적 클릭 이후 요청한다.
- 포커스 손실·Escape·탭 숨김 시 주행 세션을 일시정지한다.
- 탭이 백그라운드인 동안 물리를 무한히 따라잡지 않는다.
- WebGPU는 실제 GPU 병목이 확인된 후 별도 조사한다.

## E2E checks

- 앱 제목과 기본 셸 로딩
- Canvas 생성
- WebGL2 실패 화면의 구조
- 탭 visibility 변화에 따른 PAUSED 상태
- Pointer Lock 실패와 포커스 복귀는 입력 마일스톤에서 추가
