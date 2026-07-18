import { describe, expect, it } from "vitest";
import { calculateAeroForces, DEFAULT_AERO_MODEL_CONFIG } from "./AeroModel";

describe("AeroModel", () => {
  it("splits downforce by the configured front balance and stays zero at rest", () => {
    const rest = calculateAeroForces({ speedMps: 0 });
    const highSpeed = calculateAeroForces({ speedMps: 40 }, DEFAULT_AERO_MODEL_CONFIG);

    expect(rest.downforceN).toBe(0);
    expect(rest.dragForceN).toBe(0);
    expect(highSpeed.frontDownforceN + highSpeed.rearDownforceN).toBeCloseTo(highSpeed.downforceN, 8);
    expect(highSpeed.frontDownforceN / highSpeed.downforceN).toBeCloseTo(0.43, 8);
  });

  it("scales both forces with the square of speed and surface drag", () => {
    const low = calculateAeroForces({ speedMps: 20 });
    const high = calculateAeroForces({ speedMps: 40 });
    const grass = calculateAeroForces({ speedMps: 20, surfaceDragMultiplier: 2.8 });

    expect(high.downforceN).toBeCloseTo(low.downforceN * 4, 8);
    expect(high.dragForceN).toBeCloseTo(low.dragForceN * 4, 8);
    expect(grass.dragForceN).toBeCloseTo(low.dragForceN * 2.8, 8);
    expect([high.downforceN, high.dragForceN, grass.dragForceN].every(Number.isFinite)).toBe(true);
  });
});
