/** 결정적 AI 설정 탐색기의 점수·후보 선택·재현성을 검증하는 테스트다. */
import { describe, expect, it } from "vitest";
import {
  evaluateAITrainingConfig,
  MAXIMUM_TRAINING_BODY_SLIP_ANGLE_RAD,
  searchAITrainingConfig,
} from "./AITrainingEvaluator";
import { AITrainingRunner } from "./AITrainingRunner";

describe("AITrainingEvaluator", () => {
  // 동일 설정과 동일 커리큘럼은 후보 탐색을 반복해도 같은 해시·점수를 내야 한다.
  it("reproduces the same evaluation signature for the same configuration", () => {
    // 전체 평가기와 같은 기본 설정을 두 번 독립 실행한다.
    const first = evaluateAITrainingConfig({
      lookaheadM: 4.5,
      lookaheadSpeedScale: 0.18,
      brakeLookaheadM: 13,
      headingGain: 1.4,
      lateralGain: 1.8,
      throttleGain: 0.12,
      brakeGain: 0.16,
      brakeDeadbandMps: 1.5,
      cornerSpeedScale: 0.75,
      slipRecoverySteeringGain: 1.2,
      slipThrottleCutAngleRad: 0.05,
      upshiftRpm: 7_200,
      downshiftRpm: 2_000,
      shiftCooldownSeconds: 0.25,
    }, { scenarioIds: ["acceleration", "full-lap"] });
    const second = evaluateAITrainingConfig(first.config, {
      scenarioIds: ["acceleration", "full-lap"],
    });

    expect(second.totalScore).toBe(first.totalScore);
    expect(second.determinismSignature).toBe(first.determinismSignature);
  });

  // 탐색기는 기준 후보를 포함하고 더 낮은 점수의 후보를 최고 설정으로 선택해야 한다.
  it("selects the lowest deterministic score from bounded candidates", () => {
    // 테스트 시간을 제한하면서도 기준·변형·최고 후보 비교를 수행한다.
    const result = searchAITrainingConfig({
      scenarioIds: ["acceleration"],
      maxCandidates: 4,
    });

    expect(result.candidates).toHaveLength(4);
    expect(result.best.totalScore).toBeLessThanOrEqual(result.baseline.totalScore);
    expect(Number.isFinite(result.best.totalScore)).toBe(true);
    expect(result.best.determinismSignature).toContain("acceleration:");
  });

  // 자동 튜닝이 선택한 후보도 고속 복합 코너에서 차체를 드리프트 상태로 보내지 않아야 한다.
  it("keeps the automatically selected high-speed configuration within the slip envelope", () => {
    // 사용자가 고속 복합 코너 교육을 완료한 뒤와 같은 시나리오 범위로 후보를 비교한다.
    const result = searchAITrainingConfig({ scenarioIds: ["high-speed"], maxCandidates: 14 });
    const runner = new AITrainingRunner(undefined, "high-speed", result.best.config);
    let snapshot = runner.getSnapshot();
    let maximumBodySlipAngleRad = 0;

    runner.start();
    while (snapshot.status === "idle" || snapshot.status === "running") {
      snapshot = runner.advance(12);
      // 선택된 설정의 종·횡 속도에서 계산한 차체 slip angle을 같은 기준으로 수집한다.
      maximumBodySlipAngleRad = Math.max(
        maximumBodySlipAngleRad,
        Math.atan2(
          Math.abs(runner.simulation.current.lateralSpeedMps),
          Math.max(0.5, Math.abs(runner.simulation.current.forwardSpeedMps)),
        ),
      );
    }

    expect(snapshot.status).toBe("completed");
    expect(maximumBodySlipAngleRad).toBeLessThanOrEqual(MAXIMUM_TRAINING_BODY_SLIP_ANGLE_RAD);
  });
});
