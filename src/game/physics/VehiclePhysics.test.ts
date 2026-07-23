/** 평면 차량 물리의 가속·제동·엔진 브레이크·노면·하중·조향 안정성을 검증한다. */
import { describe, expect, it } from "vitest";
import {
  ASPHALT_SURFACE,
  createInitialVehicleState,
  DEFAULT_VEHICLE_CONFIG,
  GRASS_SURFACE,
  stepVehicle,
} from "./VehiclePhysics";
import { neutralVehicleControlInput } from "../input/VehicleControlInput";

describe("VehiclePhysics", () => {
  // throttle 입력은 속도를 올리고 위치·RPM을 유한하게 유지해야 한다.
  it("accelerates under throttle and keeps the simulation finite", () => {
    // 상태와 입력을 매 120Hz 틱에 전달하는 기본 주행 픽스처다.
    const state = createInitialVehicleState();
    // 중립 입력에서 throttle만 활성화한 가속 명령이다.
    const input = { ...neutralVehicleControlInput(), throttle: 1 };

    // 2초 가속으로 구동계와 타이어 힘의 연결을 확인한다.
    for (let step = 0; step < 240; step += 1) {
      stepVehicle(state, input, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);
    }

    expect(state.speedMps).toBeGreaterThan(10);
    expect(Number.isFinite(state.position.x)).toBe(true);
    expect(Number.isFinite(state.position.z)).toBe(true);
    expect(Number.isFinite(state.rpm)).toBe(true);
  });

  // 가속 뒤 브레이크를 밟으면 진행 속도가 감소해야 한다.
  it("reduces forward speed when braking after acceleration", () => {
    const state = createInitialVehicleState();
    // 비교할 두 입력은 공통 중립 계약에서 필요한 페달만 켠다.
    const throttleInput = { ...neutralVehicleControlInput(), throttle: 1 };
    // 가속 후 브레이크만 활성화하는 감속 명령이다.
    const brakeInput = { ...neutralVehicleControlInput(), brake: 1 };

    for (let step = 0; step < 180; step += 1) {
      stepVehicle(state, throttleInput, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);
    }
    // 브레이크 직전 속도는 이후 감소 assertion의 기준이다.
    const speedBeforeBrake = state.speedMps;

    for (let step = 0; step < 120; step += 1) {
      stepVehicle(state, brakeInput, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);
    }

    expect(speedBeforeBrake).toBeGreaterThan(5);
    expect(state.speedMps).toBeLessThan(speedBeforeBrake);
  });

  // 클러치가 연결된 throttle lift는 엔진 브레이크 토크를 발생시켜야 한다.
  it("uses engine braking during a connected throttle lift", () => {
    const state = createInitialVehicleState();
    // 엔진을 회전시킬 사전 가속 명령이다.
    const throttleInput = { ...neutralVehicleControlInput(), throttle: 1 };
    // clutch를 건드리지 않은 중립 입력으로 connected lift를 재현한다.
    const liftInput = neutralVehicleControlInput();

    for (let step = 0; step < 240; step += 1) {
      stepVehicle(state, throttleInput, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);
    }
    // lift 직전 속도는 엔진 브레이크가 실제 감속을 만들었는지 비교하는 기준이다.
    const speedBeforeLiftMps = state.speedMps;

    for (let step = 0; step < 120; step += 1) {
      stepVehicle(state, liftInput, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);
    }

    expect(state.engineBrakeTorqueNm).toBeGreaterThan(0);
    expect(state.speedMps).toBeLessThan(speedBeforeLiftMps);
  });

  // 잔디는 아스팔트보다 낮은 그립과 높은 항력으로 더 느린 결과를 내야 한다.
  it("has less grip and more resistance on grass", () => {
    // 동일 입력을 표면만 바꿔 실행해 표면 계수의 효과를 격리한다.
    const asphaltState = createInitialVehicleState();
    const grassState = createInitialVehicleState();
    // 두 표면에 동일하게 적용해 표면 계수만 비교하는 조향 가속 입력이다.
    const input = { ...neutralVehicleControlInput(), throttle: 1, steering: 0.4 };

    for (let step = 0; step < 180; step += 1) {
      stepVehicle(asphaltState, input, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);
      stepVehicle(grassState, input, 1 / 120, DEFAULT_VEHICLE_CONFIG, GRASS_SURFACE);
    }

    expect(grassState.speedMps).toBeLessThan(asphaltState.speedMps);
  });

  // Rapier/서스펜션으로 넘길 네 바퀴 하중과 제동 시 앞축 하중 이동을 확인한다.
  it("exposes four-wheel loads and transfers load during braking", () => {
    const state = createInitialVehicleState();
    // 먼저 rearward 하중이 생기도록 하는 가속 입력이다.
    const throttleInput = { ...neutralVehicleControlInput(), throttle: 1 };
    // 다음 step에서 앞축으로 하중 이동을 유도하는 브레이크 입력이다.
    const brakeInput = { ...neutralVehicleControlInput(), brake: 1 };

    for (let step = 0; step < 180; step += 1) {
      stepVehicle(state, throttleInput, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);
    }

    stepVehicle(state, brakeInput, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);

    // 네 바퀴 결과를 축 합으로 묶어 제동 하중 이동을 비교한다.
    const frontLoadN = state.wheelLoadsN.frontLeft + state.wheelLoadsN.frontRight;
    // frontLoadN과 비교할 rear axle 총 하중(N)이다.
    const rearLoadN = state.wheelLoadsN.rearLeft + state.wheelLoadsN.rearRight;

    expect(frontLoadN).toBeGreaterThan(rearLoadN);
    expect(Object.values(state.wheelLoadsN).every(Number.isFinite)).toBe(true);
    expect(Object.values(state.wheelCompressionM).every(Number.isFinite)).toBe(true);
  });

  // 정지 상태의 조향 입력은 차량을 제자리에서 회전시키지 않아야 한다.
  it("does not rotate at a standstill when steering is pressed", () => {
    const state = createInitialVehicleState();
    // 정지 상태에서 조향만 입력하는 경계 조건이다.
    const input = { ...neutralVehicleControlInput(), steering: 1 };

    for (let step = 0; step < 120; step += 1) {
      stepVehicle(state, input, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);
    }

    expect(state.speedMps).toBe(0);
    expect(state.yawRad).toBeCloseTo(Math.PI / 2, 8);
    expect(state.yawRateRadS).toBeCloseTo(0, 8);
  });

  // 짧은 조향 후 직진을 이어가면 yaw rate가 안정 범위로 돌아와야 한다.
  it("settles after a short steering correction", () => {
    const state = createInitialVehicleState();
    // 직진을 유지하는 기준 throttle 입력이다.
    const throttle = { ...neutralVehicleControlInput(), throttle: 1 };
    // 기준 throttle에 우측 조향을 잠시 더한 보정 입력이다.
    const steer = { ...throttle, steering: 1 };

    for (let step = 0; step < 240; step += 1) {
      stepVehicle(state, throttle, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);
    }
    for (let step = 0; step < 60; step += 1) {
      stepVehicle(state, steer, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);
    }
    for (let step = 0; step < 240; step += 1) {
      stepVehicle(state, throttle, 1 / 120, DEFAULT_VEHICLE_CONFIG, ASPHALT_SURFACE);
    }

    expect(Math.abs(state.yawRad - Math.PI / 2)).toBeLessThan(1);
    expect(Math.abs(state.yawRateRadS)).toBeLessThan(0.5);
  });
});
