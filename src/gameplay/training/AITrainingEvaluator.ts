/** AI 설정 후보를 동일한 fixed-step 시나리오로 평가하고 최고 설정을 선택하는 결정적 학습기다. */
import {
  AI_TRAINING_SCENARIOS,
  AITrainingRunner,
  type AITrainingScenarioId,
  type AITrainingSnapshot,
} from "./AITrainingRunner";
import {
  DEFAULT_SINGLE_OPPONENT_AI_CONFIG,
  type SingleOpponentAIConfig,
} from "../ai/SingleOpponentAI";
import { NORTHFIELD_GP_DATA } from "../../tracks/NorthfieldGP";
import type { TestTrackDefinition } from "../../tracks/TestTrack";

/** 트랙 이탈·조향·속도·제동·입력 품질을 하나의 낮을수록 좋은 점수로 결합하는 초기 가정이다. */
export interface AITrainingScoreWeights {
  offTrackPenalty: number;
  lateralRmsPenalty: number;
  lateralP95Penalty: number;
  speedRmsPenalty: number;
  speedP95Penalty: number;
  brakeOverspeedPenalty: number;
  inputChatterPenalty: number;
  elapsedSecondsPenalty: number;
  incompleteEpisodePenalty: number;
}

/** 실제 차량 재현값이 아닌 simulation_required 상태의 교육 점수 가중치다. */
export const DEFAULT_AI_TRAINING_SCORE_WEIGHTS: AITrainingScoreWeights = {
  offTrackPenalty: 120,
  lateralRmsPenalty: 12,
  lateralP95Penalty: 8,
  speedRmsPenalty: 4,
  speedP95Penalty: 2,
  brakeOverspeedPenalty: 3,
  inputChatterPenalty: 0.5,
  elapsedSecondsPenalty: 0.25,
  incompleteEpisodePenalty: 100_000,
};

/** 하나의 교육 시나리오에서 특정 AI 설정이 만든 평가 결과다. */
export interface AITrainingScenarioEvaluation {
  scenarioId: AITrainingScenarioId;
  score: number;
  snapshot: AITrainingSnapshot;
}

/** 하나의 AI 설정을 전체 커리큘럼으로 평가한 결과다. */
export interface AITrainingEvaluation {
  config: SingleOpponentAIConfig;
  totalScore: number;
  offTrackCount: number;
  lateralErrorRmsM: number;
  speedErrorRmsMps: number;
  scenarioResults: readonly AITrainingScenarioEvaluation[];
  determinismSignature: string;
}

/** 기준 설정과 후보 설정을 비교해 Training Lab에 표시할 학습 결과다. */
export interface AITrainingSearchResult {
  baseline: AITrainingEvaluation;
  best: AITrainingEvaluation;
  candidates: readonly AITrainingEvaluation[];
}

/** 파라미터 탐색에 필요한 트랙·시나리오·후보 수 설정이다. */
export interface AITrainingSearchOptions {
  track?: TestTrackDefinition;
  scenarioIds?: readonly AITrainingScenarioId[];
  baseConfig?: SingleOpponentAIConfig;
  maxCandidates?: number;
  weights?: AITrainingScoreWeights;
}

/** 절대 오차와 에피소드 상태를 낮을수록 좋은 단일 점수로 계산한다. */
export function scoreAITrainingSnapshot(
  snapshot: AITrainingSnapshot,
  weights: AITrainingScoreWeights = DEFAULT_AI_TRAINING_SCORE_WEIGHTS,
): number {
  // 완료되지 않은 후보는 우연히 빠른 중단으로 선택되지 않도록 큰 실패 비용을 받는다.
  const incompletePenalty = snapshot.status === "completed" ? 0 : weights.incompleteEpisodePenalty;
  return snapshot.offTrackCount * weights.offTrackPenalty
    + snapshot.lateralErrorRmsM * weights.lateralRmsPenalty
    + snapshot.lateralErrorP95M * weights.lateralP95Penalty
    + snapshot.speedErrorRmsMps * weights.speedRmsPenalty
    + snapshot.speedErrorP95Mps * weights.speedP95Penalty
    + snapshot.brakeOverspeedMps * weights.brakeOverspeedPenalty
    + snapshot.inputChatterCount * weights.inputChatterPenalty
    + snapshot.elapsedSeconds * weights.elapsedSecondsPenalty
    + incompletePenalty;
}

/** 고정된 후보 순서로 설정을 생성해 같은 입력에서 같은 학습 결과를 재현한다. */
export function buildAITrainingCandidates(
  baseConfig: SingleOpponentAIConfig = DEFAULT_SINGLE_OPPONENT_AI_CONFIG,
  maxCandidates = 12,
): readonly SingleOpponentAIConfig[] {
  // 먼저 기준 설정을 평가해 학습 전후의 개선량을 UI에 표시할 수 있게 한다.
  const mutations: readonly Partial<SingleOpponentAIConfig>[] = [
    {},
    { lookaheadM: 2.5 },
    { lookaheadM: 3.5 },
    { lookaheadM: 5.5 },
    { headingGain: 1.1 },
    { headingGain: 1.7 },
    { lateralGain: 1.4 },
    { lateralGain: 2.2 },
    { lookaheadSpeedScale: 0.08 },
    { brakeLookaheadM: 9 },
    { cornerSpeedScale: 0.6 },
    { cornerSpeedScale: 0.9 },
    { throttleGain: 0.08 },
    { brakeGain: 0.22 },
  ];
  const safeCandidateCount = Math.max(1, Math.min(mutations.length, Math.floor(maxCandidates)));
  return mutations.slice(0, safeCandidateCount).map((mutation) => ({
    ...baseConfig,
    ...mutation,
  }));
}

/** 하나의 AI 설정을 동일한 시나리오 집합으로 반복 평가한다. */
export function evaluateAITrainingConfig(
  config: SingleOpponentAIConfig,
  options: Pick<AITrainingSearchOptions, "track" | "scenarioIds" | "weights"> = {},
): AITrainingEvaluation {
  // 시나리오를 생략하면 제품 커리큘럼 전체를 사용해 특정 구간 과적합을 줄인다.
  const track = options.track ?? NORTHFIELD_GP_DATA;
  const scenarioIds = options.scenarioIds ?? AI_TRAINING_SCENARIOS.map((scenario) => scenario.id);
  const weights = options.weights ?? DEFAULT_AI_TRAINING_SCORE_WEIGHTS;
  const scenarioResults = scenarioIds.map((scenarioId) => {
    // 매 시나리오는 초기 포즈와 해시를 독립적으로 리셋해 후보 간 조건을 동일하게 만든다.
    const runner = new AITrainingRunner(track, scenarioId, config);
    runner.start();
    let snapshot = runner.getSnapshot();
    while (snapshot.status === "running") {
      snapshot = runner.advance(12);
    }
    return {
      scenarioId,
      score: scoreAITrainingSnapshot(snapshot, weights),
      snapshot,
    };
  });

  // 전체 시나리오 점수는 합산하되, 표시용 평균 지표는 시나리오 수로 정규화한다.
  const scenarioCount = Math.max(1, scenarioResults.length);
  const totalScore = scenarioResults.reduce((sum, result) => sum + result.score, 0);
  const offTrackCount = scenarioResults.reduce((sum, result) => sum + result.snapshot.offTrackCount, 0);
  const lateralErrorRmsM = scenarioResults.reduce((sum, result) => sum + result.snapshot.lateralErrorRmsM, 0) / scenarioCount;
  const speedErrorRmsMps = scenarioResults.reduce((sum, result) => sum + result.snapshot.speedErrorRmsMps, 0) / scenarioCount;
  const determinismSignature = scenarioResults
    .map((result) => result.scenarioId + ":" + result.snapshot.determinismHash)
    .join("|");

  return {
    config: { ...config },
    totalScore,
    offTrackCount,
    lateralErrorRmsM,
    speedErrorRmsMps,
    scenarioResults,
    determinismSignature,
  };
}

/** 제한된 후보 탐색으로 가장 낮은 점수의 AI 설정을 결정적으로 선택한다. */
export function searchAITrainingConfig(options: AITrainingSearchOptions = {}): AITrainingSearchResult {
  // 후보 순서와 평가 순서를 고정해 같은 저장소 상태에서 결과가 변하지 않게 한다.
  const baseConfig = options.baseConfig ?? DEFAULT_SINGLE_OPPONENT_AI_CONFIG;
  const candidates = buildAITrainingCandidates(baseConfig, options.maxCandidates ?? 12);
  const evaluations = candidates.map((config) => evaluateAITrainingConfig(config, options));
  const baseline = evaluations[0] ?? evaluateAITrainingConfig(baseConfig, options);
  const best = evaluations.reduce((currentBest, candidate) => (
    candidate.totalScore < currentBest.totalScore ? candidate : currentBest
  ), baseline);

  return {
    baseline,
    best,
    candidates: evaluations,
  };
}
