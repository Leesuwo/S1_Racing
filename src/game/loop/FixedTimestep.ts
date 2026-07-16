export interface FixedStepResult {
  stepCount: number;
  alpha: number;
  accumulator: number;
}

export class FixedTimestepAccumulator {
  private accumulator = 0;

  constructor(
    public readonly stepSize = 1 / 120,
    public readonly maxStepsPerFrame = 4,
  ) {}

  advance(frameDeltaSeconds: number, step: (dt: number) => void): FixedStepResult {
    const safeDelta = Math.max(0, Math.min(frameDeltaSeconds, 0.1));
    this.accumulator += safeDelta;

    let stepCount = 0;
    while (this.accumulator >= this.stepSize && stepCount < this.maxStepsPerFrame) {
      step(this.stepSize);
      this.accumulator -= this.stepSize;
      stepCount += 1;
    }

    if (stepCount === this.maxStepsPerFrame && this.accumulator >= this.stepSize) {
      this.accumulator = 0;
    }

    return {
      stepCount,
      alpha: this.accumulator / this.stepSize,
      accumulator: this.accumulator,
    };
  }
}
