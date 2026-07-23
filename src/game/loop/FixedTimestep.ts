/**
 * 렌더 프레임과 물리 틱 사이의 누적 실행 결과다. alpha는 이전·현재
 * 물리 상태를 렌더링할 때 사용하는 보간 비율이다.
 */
export interface FixedStepResult {
  stepCount: number;
  alpha: number;
  accumulator: number;
}

/**
 * 가변 렌더 프레임을 고정 간격 물리 스텝으로 분해한다. 최대 catch-up 수를
 * 제한해 일시적인 프레임 저하가 무한 계산 루프로 번지는 것을 막는다.
 */
export class FixedTimestepAccumulator {
  /** 아직 물리 스텝으로 소비되지 않은 렌더 시간(초)이다. */
  private accumulator = 0;

  /** 고정 물리 간격과 한 렌더 프레임당 최대 catch-up 스텝을 설정한다. */
  constructor(
    public readonly stepSize = 1 / 120,
    public readonly maxStepsPerFrame = 4,
  ) {}

  /** 누적 시간을 소비하고 실행한 스텝 수와 렌더 보간 상태를 반환한다. */
  advance(frameDeltaSeconds: number, step: (dt: number) => void): FixedStepResult {
    // 탭 복귀나 디버거 중단으로 생긴 큰 delta가 물리를 폭발시키지 않게 제한한다.
    const safeDelta = Math.max(0, Math.min(frameDeltaSeconds, 0.1));
    this.accumulator += safeDelta;

    // 이번 렌더 프레임에서 실제로 실행한 고정 스텝 수다.
    let stepCount = 0;
    while (this.accumulator >= this.stepSize && stepCount < this.maxStepsPerFrame) {
      step(this.stepSize);
      this.accumulator -= this.stepSize;
      stepCount += 1;
    }

    // 한 프레임의 예산을 모두 사용했으면 남은 backlog를 버려 spiral of death를 끊는다.
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
