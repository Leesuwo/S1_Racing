/** AI 교육 실행기의 결정성·상태 전이·평가 지표를 검증하는 순수 TypeScript 테스트다. */
import { describe, expect, it } from "vitest";
import { AITrainingRunner } from "./AITrainingRunner";

describe("AITrainingRunner", () => {
  // 같은 트랙·시나리오·fixed-step 입력은 UI 실행과 무관하게 같은 결과를 내야 한다.
  it("produces the same snapshot sequence for two independent runs", () => {
    // 서로 다른 실행기지만 동일한 결정적 교육 조건을 사용한다.
    const first = new AITrainingRunner(undefined, "acceleration");
    const second = new AITrainingRunner(undefined, "acceleration");
    first.start();
    second.start();

    // 120Hz 물리 스텝을 묶어서 진행해도 매 샘플의 해시·지표가 일치해야 한다.
    for (let sample = 0; sample < 12; sample += 1) {
      expect(first.advance(5)).toEqual(second.advance(5));
    }
  });

  // 시작·일시정지·수동 스텝·리셋은 현재 물리 상태와 평가 상태를 같은 순서로 전이해야 한다.
  it("supports observable start, pause, step, and reset transitions", () => {
    // UI 조작 버튼과 동일한 실행기 수명 주기를 재현한다.
    const runner = new AITrainingRunner(undefined, "acceleration");

    expect(runner.getSnapshot()).toMatchObject({ status: "idle", stepIndex: 0, progressRatio: 0 });
    runner.start();
    const running = runner.advance(12);
    expect(running.status).toBe("running");
    expect(running.stepIndex).toBe(12);
    expect(running.determinismHash).not.toBe("811c9dc5");
    expect(Number.isFinite(running.speedMps)).toBe(true);

    runner.pause();
    expect(runner.getSnapshot().status).toBe("paused");
    expect(runner.stepOnce().stepIndex).toBe(13);

    runner.reset();
    expect(runner.getSnapshot()).toMatchObject({
      status: "idle",
      stepIndex: 0,
      determinismHash: "811c9dc5",
      offTrackCount: 0,
      inputChatterCount: 0,
    });
  });

  // 짧은 시나리오도 최대 스텝에서 완료되어 진행률과 완료 메시지를 HUD에 제공해야 한다.
  it("completes a scenario at its configured step boundary", () => {
    // 직선 가속 시나리오는 전체 랩보다 짧아 상태 전이를 빠르게 검증할 수 있다.
    const runner = new AITrainingRunner(undefined, "acceleration");
    runner.start();

    for (let batch = 0; batch < 40; batch += 1) {
      runner.advance(12);
    }

    expect(runner.getSnapshot()).toMatchObject({
      status: "completed",
      stepIndex: 480,
      progressRatio: 1,
    });
    expect(runner.getSnapshot().message).toContain("시나리오 완료");
  });

});
