import { describe, expect, it } from "vitest";
import { FixedTimestepAccumulator } from "./FixedTimestep";

describe("FixedTimestepAccumulator", () => {
  it("runs two 120Hz steps for roughly one 60Hz frame", () => {
    const accumulator = new FixedTimestepAccumulator();
    const deltas: number[] = [];

    const result = accumulator.advance(1 / 60, (dt) => deltas.push(dt));

    expect(result.stepCount).toBe(2);
    expect(deltas).toHaveLength(2);
    expect(deltas[0]).toBeCloseTo(1 / 120);
  });

  it("caps catch-up work and discards the remaining spiral", () => {
    const accumulator = new FixedTimestepAccumulator(1 / 120, 4);
    let steps = 0;

    const result = accumulator.advance(0.1, () => {
      steps += 1;
    });

    expect(steps).toBe(4);
    expect(result.accumulator).toBe(0);
  });
});
