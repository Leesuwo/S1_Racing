/**
 * AI Training Lab 결과 파일의 버전·재현성·불변 복사 계약을 검증한다.
 * 브라우저 다운로드 대신 순수 문서 생성과 JSON 파싱을 검사해 환경과 무관한 인수 기준을 둔다.
 */
import { describe, expect, it } from "vitest";
import { searchAITrainingConfig } from "./AITrainingEvaluator";
import {
  AI_TRAINING_RESULT_SCHEMA,
  AI_TRAINING_RESULT_SCHEMA_VERSION,
  createAITrainingResultDocument,
  serializeAITrainingResult,
} from "./AITrainingResult";
import { AITrainingRunner } from "./AITrainingRunner";

describe("AITrainingResult", () => {
  it("stores a versioned document that can reproduce the selected scenario and hash", () => {
    const runner = new AITrainingRunner(undefined, "acceleration");
    runner.start();
    const completedSnapshot = runner.advance(480);
    const result = searchAITrainingConfig({
      scenarioIds: ["acceleration"],
      maxCandidates: 2,
    });

    const document = createAITrainingResultDocument({
      result,
      completedSnapshot,
      applied: result.best.totalScore < result.baseline.totalScore,
      savedAtUtc: "2026-07-27T00:00:00.000Z",
    });
    const serialized = serializeAITrainingResult(document);
    const parsed = JSON.parse(serialized) as typeof document;

    expect(parsed.schema).toBe(AI_TRAINING_RESULT_SCHEMA);
    expect(parsed.schemaVersion).toBe(AI_TRAINING_RESULT_SCHEMA_VERSION);
    expect(parsed.trackName).toBe("Northfield GP");
    expect(parsed.scenario.id).toBe("acceleration");
    expect(parsed.completedEpisode.determinismHash).toBe(completedSnapshot.determinismHash);
    expect(parsed.search.best.config).toEqual(result.best.config);
    expect(parsed.search.best.determinismSignature).toBe(result.best.determinismSignature);
    expect(serialized.endsWith("\n")).toBe(true);
  });

  it("copies nested snapshots so later runner changes cannot mutate the saved document", () => {
    const runner = new AITrainingRunner(undefined, "acceleration");
    runner.start();
    const completedSnapshot = runner.advance(12);
    const result = searchAITrainingConfig({ scenarioIds: ["acceleration"], maxCandidates: 1 });
    const document = createAITrainingResultDocument({
      result,
      completedSnapshot,
      applied: false,
      savedAtUtc: "2026-07-27T00:00:00.000Z",
    });

    completedSnapshot.currentPosition.x = 999;
    completedSnapshot.input.steering = 999;

    expect(document.completedEpisode.currentPosition.x).not.toBe(999);
    expect(document.completedEpisode.input.steering).not.toBe(999);
  });
});
