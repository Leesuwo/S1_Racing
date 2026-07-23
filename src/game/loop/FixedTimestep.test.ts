/** 120Hz 고정 스텝 누적기와 catch-up 상한을 검증한다. */
import { describe, expect, it } from "vitest";
import { FixedTimestepAccumulator } from "./FixedTimestep";

describe("FixedTimestepAccumulator", () => {
  // 일반적인 60Hz 렌더 한 프레임에서 두 개의 120Hz 물리 틱이 실행되어야 한다.
  it("runs two 120Hz steps for roughly one 60Hz frame", () => {
    // 렌더 프레임에서 실제 호출된 고정 dt를 관찰하는 픽스처 배열이다.
    const accumulator = new FixedTimestepAccumulator();
    // callback에 전달된 각 fixed dt를 순서대로 저장한다.
    const deltas: number[] = [];

    const result = accumulator.advance(1 / 60, (dt) => deltas.push(dt));

    expect(result.stepCount).toBe(2);
    expect(deltas).toHaveLength(2);
    expect(deltas[0]).toBeCloseTo(1 / 120);
  });

  // 큰 frame delta도 최대 4틱에서 멈추고 backlog를 버려 spiral을 방지해야 한다.
  it("caps catch-up work and discards the remaining spiral", () => {
    // 콜백 호출 횟수로 catch-up 상한을 검증한다.
    const accumulator = new FixedTimestepAccumulator(1 / 120, 4);
    let steps = 0;
    // 100 ms frame delta를 상한 로직에 전달한다.
    const result = accumulator.advance(0.1, () => {
      steps += 1;
    });

    expect(steps).toBe(4);
    expect(result.accumulator).toBe(0);
  });
});
