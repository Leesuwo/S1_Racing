/** 결정적 AI 설정 탐색기의 점수·후보 선택·재현성을 검증하는 테스트다. */
import { describe, expect, it } from "vitest";
import {
  evaluateAITrainingConfig,
  searchAITrainingConfig,
} from "./AITrainingEvaluator";

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
});
