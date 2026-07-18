# AI Spec

AI는 플레이어와 같은 차량 물리를 사용하고 `VehicleControlInput`만 출력한다. 차량 위치를 직접 이동시키거나 숨겨진 그립 보너스를 사용하지 않는다.

## 예정 계층

1. Racing line과 목표 속도 프로파일
2. Pure Pursuit 조향
3. PID 기반 가감속
4. 충돌 회피
5. 추월·방어 상태 머신
6. 퀄리파잉·레이스 전략

## Milestone 0

AI 구현과 트랙 데이터는 제외한다. 테스트 트랙과 입력 프리셋을 고정하는 Milestone 1F 이후, Milestone 2A에서 별도 검증 시나리오와 함께 시작한다.
