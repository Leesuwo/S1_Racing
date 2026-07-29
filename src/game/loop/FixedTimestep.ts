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

  /**
   * 모드 전환·세션 리셋 뒤 이전 렌더 프레임의 잔여 시간을 새 물리에 전달하지 않는다.
   * 남은 분수 step은 보간용 상태일 뿐 저장하거나 재생할 물리 시간이 아니므로 명시적으로 버린다.
   */
  reset(): void {
    this.accumulator = 0;
  }

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
