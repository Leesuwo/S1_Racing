import { describe, expect, it } from "vitest";
import { FixedTimestepAccumulator } from "./FixedTimestep";

// 렌더 프레임과 120Hz 물리 스텝의 분리, 지연 프레임 catch-up 제한을 검증한다.
describe("FixedTimestepAccumulator", () => {
  it("runs two 120Hz steps for roughly one 60Hz frame", () => {
    const accumulator = new FixedTimestepAccumulator();
    // 60Hz 한 프레임은 120Hz 물리 두 스텝으로 분해되어야 한다.
    const deltas: number[] = [];

    const result = accumulator.advance(1 / 60, (dt) => deltas.push(dt));

    expect(result.stepCount).toBe(2);
    expect(deltas).toHaveLength(2);
    expect(deltas[0]).toBeCloseTo(1 / 120);
  });

  it("caps catch-up work and discards the remaining spiral", () => {
    const accumulator = new FixedTimestepAccumulator(1 / 120, 4);
    // 지연 프레임에서 무한 catch-up하지 않고 maxStepsPerFrame에서 재동기화한다.
    let steps = 0;

    const result = accumulator.advance(0.1, () => {
      steps += 1;
    });

    expect(steps).toBe(4);
    expect(result.accumulator).toBe(0);
  });
});
