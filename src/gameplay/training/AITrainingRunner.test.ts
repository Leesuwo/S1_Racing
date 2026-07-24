/** AI 교육 실행기의 결정성·상태 전이·평가 지표를 검증하는 순수 TypeScript 테스트다. */
import { describe, expect, it } from "vitest";
import { MAXIMUM_TRAINING_BODY_SLIP_ANGLE_RAD } from "./AITrainingEvaluator";
import { AITrainingRunner, signedTrackDeltaM } from "./AITrainingRunner";

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

  // 맵 외곽을 완전히 벗어난 AI는 잘못된 주행을 계속 누적하지 않고, 그 순간의 실패 원인을 학습기에 넘겨야 한다.
  it("immediately fails and records an off-track learning case outside the map", () => {
    // 직선 가속 시나리오에서 차량을 outerBounds 바깥으로 배치해 월드 맵 이탈을 결정적으로 재현한다.
    const runner = new AITrainingRunner(undefined, "acceleration");
    runner.start();
    runner.simulation.current.position = { x: 1_000, z: 1_000 };

    const snapshot = runner.advance(1);

    expect(snapshot.status).toBe("failed");
    expect(snapshot.stepIndex).toBe(1);
    expect(snapshot.offTrackCount).toBe(1);
    expect(snapshot.failure).toMatchObject({
      reason: "off-track",
      sectionLabel: "맵 외곽",
      input: snapshot.input,
    });
    expect(snapshot.failure?.distanceToBoundaryM).toBeLessThan(0);
    expect(snapshot.message).toContain("에피소드를 즉시 종료");
  });

  // 전체 랩의 100%는 짧은 시간 제한이 아니라 모든 체크포인트와 결승선 재통과를 뜻해야 한다.
  it("does not report a full lap as complete before its physical checkpoints are reached", () => {
    const runner = new AITrainingRunner(undefined, "full-lap");
    runner.start();

    // 이전 16 s 상한과 같은 1,920 step을 실행해도 대형 트랙의 전체 랩은 종료되지 않아야 한다.
    const snapshot = runner.advance(1_920);

    expect(snapshot.status).toBe("running");
    expect(snapshot.maxSteps).toBe(7_200);
    expect(snapshot.progressRatio).toBeLessThan(1);
    expect(snapshot.checkpointIndex).toBeLessThan(snapshot.totalCheckpointCount);
    expect(snapshot.lapProgressM).toBeGreaterThan(0);
    expect(snapshot.progressRatio).toBeCloseTo(snapshot.lapProgressM / snapshot.trackLengthM, 8);
  });

  // 출발선 경계를 건너는 경우에도 전진과 후진을 큰 점프가 아닌 가장 짧은 실제 거리로 계산해야 한다.
  it("keeps lap progress signed when a vehicle reverses on the closed track", () => {
    expect(signedTrackDeltaM(40, 28, 100)).toBe(-12);
    expect(signedTrackDeltaM(96, 3, 100)).toBe(7);
    expect(signedTrackDeltaM(3, 96, 100)).toBe(-7);
  });

  // 전체 랩은 정해진 시간만 채우는 시나리오가 아니라 실제 결승선 재통과까지 진행되어야 한다.
  it("completes the Northfield full lap by passing every checkpoint and the finish", () => {
    const runner = new AITrainingRunner(undefined, "full-lap");
    runner.start();
    let snapshot = runner.getSnapshot();

    // 상한 60 s를 12 step 묶음으로 재현해도 결정적 결과를 유지한다.
    while (snapshot.status === "running") {
      snapshot = runner.advance(12);
    }

    expect(snapshot).toMatchObject({
      status: "completed",
      progressRatio: 1,
      checkpointIndex: snapshot.totalCheckpointCount,
    });
    expect(snapshot.message).toContain("전체 랩 완료");
  });

  // 고속 복합 코너는 레이싱 라인을 향한 작은 타이어 슬립은 허용하지만, 차체가 진행 방향보다 크게 옆으로 미끄러지는 드리프트 상태는 허용하지 않는다.
  it("keeps the high-speed complex within the initial non-drifting slip envelope", () => {
    // 고속 복합 코너 시작 포즈와 기본 AI 설정을 공유 물리 경계로 실행한다.
    const runner = new AITrainingRunner(undefined, "high-speed");
    let snapshot = runner.getSnapshot();
    let maximumBodySlipAngleRad = 0;

    runner.start();
    while (snapshot.status === "idle" || snapshot.status === "running") {
      snapshot = runner.advance(12);
      // 차체 기준 종·횡 속도로 계산한 slip angle은 시각적 드리프트를 수치로 검증하는 기준이다.
      const forwardSpeedMps = Math.max(0.5, Math.abs(runner.simulation.current.forwardSpeedMps));
      const bodySlipAngleRad = Math.atan2(
        Math.abs(runner.simulation.current.lateralSpeedMps),
        forwardSpeedMps,
      );
      maximumBodySlipAngleRad = Math.max(maximumBodySlipAngleRad, bodySlipAngleRad);
    }

    expect(snapshot.status).toBe("completed");
    expect(maximumBodySlipAngleRad).toBeLessThanOrEqual(MAXIMUM_TRAINING_BODY_SLIP_ANGLE_RAD);
  });

});
