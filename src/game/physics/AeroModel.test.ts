/** 공력의 정지 상태·전후 하중 배분·속도 제곱 스케일을 검증한다. */
import { describe, expect, it } from "vitest";
import { calculateAeroForces, DEFAULT_AERO_MODEL_CONFIG } from "./AeroModel";

describe("AeroModel", () => {
  // 정지 공력은 0이고 고속 다운포스는 설정된 전륜 balance를 따라야 한다.
  it("splits downforce by the configured front balance and stays zero at rest", () => {
    // 정지와 40 m/s를 비교하는 기본 공력 픽스처다.
    const rest = calculateAeroForces({ speedMps: 0 });
    // 기준 공력 설정을 사용한 고속 결과다.
    const highSpeed = calculateAeroForces({ speedMps: 40 }, DEFAULT_AERO_MODEL_CONFIG);

    expect(rest.downforceN).toBe(0);
    expect(rest.dragForceN).toBe(0);
    expect(highSpeed.frontDownforceN + highSpeed.rearDownforceN).toBeCloseTo(highSpeed.downforceN, 8);
    expect(highSpeed.frontDownforceN / highSpeed.downforceN).toBeCloseTo(0.43, 8);
  });

  // 속도와 표면 항력 배율이 결과에 독립적으로 적용되는지 확인한다.
  it("scales both forces with the square of speed and surface drag", () => {
    // 20 m/s를 기준으로 속도 제곱 배율과 잔디 항력 배율을 비교한다.
    const low = calculateAeroForces({ speedMps: 20 });
    const high = calculateAeroForces({ speedMps: 40 });
    const grass = calculateAeroForces({ speedMps: 20, surfaceDragMultiplier: 2.8 });

    expect(high.downforceN).toBeCloseTo(low.downforceN * 4, 8);
    expect(high.dragForceN).toBeCloseTo(low.dragForceN * 4, 8);
    expect(grass.dragForceN).toBeCloseTo(low.dragForceN * 2.8, 8);
    expect([high.downforceN, high.dragForceN, grass.dragForceN].every(Number.isFinite)).toBe(true);
  });
});
