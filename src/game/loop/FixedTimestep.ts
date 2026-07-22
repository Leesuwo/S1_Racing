/** 고정 스텝 실행 횟수와 다음 렌더링 보간에 필요한 잔여 시간을 반환한다. */
export interface FixedStepResult {
  stepCount: number;
  alpha: number;
  accumulator: number;
}

/**
 * 렌더 프레임 시간과 물리 시간을 분리한다. 기본 120Hz 스텝은 결정성을 유지하고,
 * 프레임이 급격히 지연되면 최대 스텝 수를 넘는 잔여 시간을 버려 spiral of death를 막는다.
 */
export class FixedTimestepAccumulator {
  private accumulator = 0;

  constructor(
    public readonly stepSize = 1 / 120,
    public readonly maxStepsPerFrame = 4,
  ) {}

  /**
   * 프레임 시간을 누적하고 필요한 만큼 `stepSize` 콜백을 호출한다.
   * `alpha`는 이전 상태와 현재 상태 사이에서 렌더러가 사용할 0..1 보간 비율이다.
   */
  advance(frameDeltaSeconds: number, step: (dt: number) => void): FixedStepResult {
    // 탭 복귀나 브라우저 중단으로 생긴 큰 delta를 그대로 적분하면 차량이 순간이동한다.
    const safeDelta = Math.max(0, Math.min(frameDeltaSeconds, 0.1));
    this.accumulator += safeDelta;

    let stepCount = 0;
    while (this.accumulator >= this.stepSize && stepCount < this.maxStepsPerFrame) {
      step(this.stepSize);
      this.accumulator -= this.stepSize;
      stepCount += 1;
    }

    if (stepCount === this.maxStepsPerFrame && this.accumulator >= this.stepSize) {
      // 프레임 지연을 과거 시점까지 따라잡지 않고 현재 시각으로 재동기화한다.
      this.accumulator = 0;
    }

    return {
      stepCount,
      alpha: this.accumulator / this.stepSize,
      accumulator: this.accumulator,
    };
  }
}
