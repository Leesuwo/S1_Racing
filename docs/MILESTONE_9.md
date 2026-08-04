# Milestone 9 — AI field profiles and deterministic mistakes

## 완료 범위

- academy, club, pro, elite 프로필을 고유 ID와 결정적 시드로 AI grid에 배치했다.
- 프로필은 코너 목표 속도와 제한된 입력 오류 빈도·시간·스로틀·조향 편향만 조절한다.
- 오류 이벤트는 AI별 LCG 시드와 120Hz 상태로 재현되며 RaceSession digest·HUD 스냅샷에 노출된다.

## 경계

- AI는 차량 위치·속도·그립·출력·연료를 직접 변경하지 않는다.
- 난이도 적응, 드라이버 성격, 장기 학습은 별도 데이터/평가 단계다.

## 검증

- 같은 field 크기의 고유 프로필·시드 재현 단위 테스트
- 같은 시드의 실수 입력 시퀀스가 동일하고 차량 상태를 바꾸지 않는 단위 테스트

