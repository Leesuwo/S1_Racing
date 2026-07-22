import { describe, expect, it } from "vitest";
import { VehicleSimulation } from "../../game/physics/VehicleSimulation";
import { TEST_TRACK_DATA } from "../../tracks/TestTrack";
import {
  SingleOpponentAI,
  type SingleOpponentAIState,
} from "./SingleOpponentAI";

// 모든 AI 테스트가 공유하는 시작 포즈·속도·기어 상태 스냅샷이다.
const BASE_STATE: SingleOpponentAIState = {
  position: { x: -10, z: 10 },
  velocity: { x: 0, z: 0 },
  yawRad: Math.PI / 2,
  speedMps: 0,
  forwardSpeedMps: 0,
  rpm: 900,
  gear: 1,
  maxGear: 8,
};

describe("SingleOpponentAI", () => {
  // 같은 입력 상태에서 결과가 같아야 재현 가능한 fixed-step 시나리오와 리플레이가 가능하다.
  it("produces deterministic shared-boundary input at the same state", () => {
    // 서로 다른 인스턴스가 같은 상태에서 독립적으로 생성한 입력이다.
    const first = new SingleOpponentAI();
    const second = new SingleOpponentAI();

    expect(first.update(BASE_STATE, 1 / 120)).toEqual(second.update(BASE_STATE, 1 / 120));
  });

  // 직선 목표 속도와 코너 미리보기 속도가 달라야 AI가 데이터 기반 제동 지점을 사용한다.
  it("selects a faster straight-line target and a slower preview at the brake point", () => {
    // 테스트 상태에 접근하는 순수 AI 컨트롤러다.
    const ai = new SingleOpponentAI();
    // 직선 시작점과 코너 진입 전의 목표 속도 샘플이다.
    const straightTarget = ai.getTarget(BASE_STATE);
    const brakeTarget = ai.getTarget({
      ...BASE_STATE,
      position: { x: 8, z: 10 },
      speedMps: 38,
      forwardSpeedMps: 38,
      rpm: 5_500,
      gear: 3,
    });

    expect(straightTarget.targetSpeedMps).toBeGreaterThan(40);
    expect(brakeTarget.previewSpeedMps).toBeLessThan(straightTarget.targetSpeedMps);
    expect(brakeTarget.brakePoint).toBe(true);
    expect(brakeTarget.targetSpeedMps).toBeLessThan(30);
  });

  // AI는 과속 시 입력만 줄 뿐 상태 위치를 직접 변경해서는 안 된다.
  it("brakes for the upcoming corner without changing the vehicle pose", () => {
    // 브레이크 출력 검증에 사용하는 동일한 AI 컨트롤러다.
    const ai = new SingleOpponentAI();
    // 우측 코너 제동점에서 과속 중인 입력 상태다.
    const state = {
      ...BASE_STATE,
      position: { x: 8, z: 10 },
      speedMps: 38,
      forwardSpeedMps: 38,
      rpm: 5_500,
      gear: 3,
    };

    // AI가 반환한 공유 차량 입력이며 차량 상태 자체가 아니다.
    const input = ai.update(state, 1 / 120);

    expect(input.brake).toBeGreaterThan(0);
    expect(input.throttle).toBe(0);
    expect(state.position).toEqual({ x: 8, z: 10 });
    expect(input).toMatchObject({ clutch: 0, overtakeMode: false, activeAero: true });
  });

  // 변속 명령은 한 fixed step만 발생해야 기어가 쿨다운 동안 반복 증가하지 않는다.
  it("emits one-shot upshift commands with a cooldown", () => {
    // 테스트 트랙을 읽는 변속 상태 보유 컨트롤러다.
    const ai = new SingleOpponentAI(TEST_TRACK_DATA);
    // 업시프트 임계 RPM에 있는 1단 상태다.
    const state = { ...BASE_STATE, rpm: 7_500, gear: 1 };

    expect(ai.update(state, 1 / 120).shiftUp).toBe(true);
    expect(ai.update({ ...state, gear: 2 }, 1 / 120).shiftUp).toBe(false);
    expect(ai.update({ ...state, gear: 2 }, 0.3).shiftUp).toBe(true);
  });

  // 고정 스텝 시나리오에서 AI는 입력만 생성하고 차량 이동은 VehicleSimulation이 담당해야 한다.
  it("drives a finite deterministic scenario through the shared vehicle simulation", () => {
    // 같은 AI 차량 시작 포즈에서 독립적으로 실행하는 두 물리 시뮬레이션이다.
    const firstSimulation = new VehicleSimulation(undefined, TEST_TRACK_DATA, TEST_TRACK_DATA.opponentStartPose);
    const secondSimulation = new VehicleSimulation(undefined, TEST_TRACK_DATA, TEST_TRACK_DATA.opponentStartPose);
    // 동일한 입력 시퀀스가 나오는지 비교하는 두 컨트롤러다.
    const firstAI = new SingleOpponentAI();
    const secondAI = new SingleOpponentAI();

    // 120Hz fixed step 카운터로 짧은 결정성 시나리오를 실행한다.
    for (let step = 0; step < 240; step += 1) {
      // 첫 번째 물리 시뮬레이션에 전달할 AI 입력이다.
      const firstInput = firstAI.update({
        ...firstSimulation.current,
        maxGear: firstSimulation.config.gearRatios.length,
      }, 1 / 120);
      // 두 번째 물리 시뮬레이션에 전달할 비교용 AI 입력이다.
      const secondInput = secondAI.update({
        ...secondSimulation.current,
        maxGear: secondSimulation.config.gearRatios.length,
      }, 1 / 120);
      firstSimulation.step(firstInput, 1 / 120);
      secondSimulation.step(secondInput, 1 / 120);

      expect(firstSimulation.current.position).toEqual(secondSimulation.current.position);
      expect(Number.isFinite(firstSimulation.current.speedMps)).toBe(true);
      expect(Number.isFinite(firstSimulation.current.yawRad)).toBe(true);
    }

    expect(firstSimulation.current.speedMps).toBeGreaterThan(0);
  });
});
