# 최적화 및 코드 리뷰 하네스

`npm run verify`는 코드 작성 뒤 항상 아래의 두 검토를 실행한다. 장비별 FPS를 CI에서 단정하지 않고, 저장소가 재현할 수 있는 성능 계약과 구조적 회귀를 실패 조건으로 둔다.

## 코드 리뷰

`npm run review:code`는 다음을 검사한다.

- `git diff --check` 공백 오류
- `src/game/**`, `src/gameplay/**`, `src/tracks/**`의 React·R3F·Three·Zustand 직접 의존성
- production 소스의 `console.log`·`console.debug`·`console.info`

## 최적화 리뷰

`npm run review:performance`는 production build 뒤 다음 계약을 검사한다.

- Training·Race Weekend의 시간 기반 120Hz 누적기
- Canvas DPR 최대 1.25와 basic shadow
- Rapier 접촉 callback의 collider handle 직접 조회
- 전체 JavaScript 4,000,000 B, 최대 chunk 2,500,000 B 예산

예산을 바꿔야 하면 실제 프로파일 근거, 대상 장치, 변경 전후 수치를 `docs/DECISIONS.md`에 기록한다. 이 하네스는 `npm run verify`와 GitHub Actions Verify 워크플로에 포함된다.
