/**
 * AI Training Lab의 평가 결과를 브라우저와 독립적인 버전 JSON 문서로 고정한다.
 * 파일 생성·다운로드는 앱 셸이 담당하고, 이 모듈은 결정적 평가 데이터의 구조와 직렬화만 담당한다.
 */
import type {
  AITrainingEvaluation,
  AITrainingSearchResult,
} from "./AITrainingEvaluator";
import type {
  AITrainingFailure,
  AITrainingScenarioId,
  AITrainingSnapshot,
} from "./AITrainingRunner";

/** 저장 파일의 스키마 식별자로, 이후 포맷 변경을 기존 결과와 구분한다. */
export const AI_TRAINING_RESULT_SCHEMA = "s1-racing.ai-training-result" as const;

/** 현재 결과 문서의 구조 버전이다. 평가 수치의 단위나 필드가 바뀌면 증가시킨다. */
export const AI_TRAINING_RESULT_SCHEMA_VERSION = 1 as const;

/** 완료 에피소드와 후보 탐색 결과를 다시 평가할 수 있게 보존하는 JSON 문서다. */
export interface AITrainingResultDocument {
  /** 결과 파일 포맷을 판별하는 고정 문자열이다. */
  schema: typeof AI_TRAINING_RESULT_SCHEMA;
  /** 필드 추가·단위 변경을 구분하는 정수 버전이다. */
  schemaVersion: typeof AI_TRAINING_RESULT_SCHEMA_VERSION;
  /** 평가가 아니라 파일을 생성한 UTC 시각이다. */
  savedAtUtc: string;
  /** 평가에 사용한 트랙의 데이터 원본 이름이다. */
  trackName: string;
  /** 결과를 만든 교육 시나리오의 식별 정보다. */
  scenario: {
    /** 시나리오 선택·재실행에 사용하는 고정 ID다. */
    id: AITrainingScenarioId;
    /** 사용자 화면에 표시하는 시나리오 이름이다. */
    label: string;
    /** 해당 시나리오의 fixed-step 시간 상한이다. */
    maxSteps: number;
  };
  /** 최고 후보를 다음 주행에 자동 적용했는지 나타낸다. */
  applied: boolean;
  /** 자동 튜닝 전에 관찰한 실제 완료·실패 에피소드다. */
  completedEpisode: AITrainingSnapshot;
  /** 기준·최고·전체 후보의 결정적 평가 결과다. */
  search: AITrainingSearchResult;
}

/** 결과 문서 생성에 필요한 UI 적용 상태와 완료 시점 스냅샷이다. */
export interface CreateAITrainingResultDocumentOptions {
  /** 현재 트랙·시나리오에서 실행한 후보 탐색 결과다. */
  result: AITrainingSearchResult;
  /** 자동 탐색을 촉발한 실제 에피소드의 최종 스냅샷이다. */
  completedSnapshot: AITrainingSnapshot;
  /** 최고 후보가 기준보다 낮은 점수로 적용되었는지 나타낸다. */
  applied: boolean;
  /** 파일 생성 시점의 ISO-8601 UTC 문자열이다. */
  savedAtUtc: string;
}

/** 실패 스냅샷의 중첩 객체까지 복사해 저장 결과가 이후 UI 변경에 영향을 받지 않게 한다. */
function cloneFailure(failure: AITrainingFailure | undefined): AITrainingFailure | undefined {
  return failure && {
    ...failure,
    position: { ...failure.position },
    input: { ...failure.input },
  };
}

/** 렌더링·평가 결과의 중첩 값을 복사해 파일 문서의 입력을 불변 스냅샷으로 만든다. */
function cloneSnapshot(snapshot: AITrainingSnapshot): AITrainingSnapshot {
  return {
    ...snapshot,
    scenario: { ...snapshot.scenario },
    targetPoint: { ...snapshot.targetPoint },
    currentPosition: { ...snapshot.currentPosition },
    input: { ...snapshot.input },
    failure: cloneFailure(snapshot.failure),
  };
}

/** 하나의 후보 평가를 복사해 기준·최고·후보 배열이 같은 객체를 공유하지 않게 한다. */
function cloneEvaluation(evaluation: AITrainingEvaluation): AITrainingEvaluation {
  return {
    ...evaluation,
    config: { ...evaluation.config },
    scenarioResults: evaluation.scenarioResults.map((scenarioResult) => ({
      ...scenarioResult,
      snapshot: cloneSnapshot(scenarioResult.snapshot),
    })),
  };
}

/** 자동 튜닝 직후의 결과를 버전이 있는 파일 문서로 변환한다. */
export function createAITrainingResultDocument(
  options: CreateAITrainingResultDocumentOptions,
): AITrainingResultDocument {
  const { result, completedSnapshot } = options;
  return {
    schema: AI_TRAINING_RESULT_SCHEMA,
    schemaVersion: AI_TRAINING_RESULT_SCHEMA_VERSION,
    savedAtUtc: options.savedAtUtc,
    trackName: completedSnapshot.trackName,
    scenario: {
      id: completedSnapshot.scenario.id,
      label: completedSnapshot.scenario.label,
      maxSteps: completedSnapshot.maxSteps,
    },
    applied: options.applied,
    completedEpisode: cloneSnapshot(completedSnapshot),
    search: {
      baseline: cloneEvaluation(result.baseline),
      best: cloneEvaluation(result.best),
      candidates: result.candidates.map(cloneEvaluation),
    },
  };
}

/** 결과 문서를 줄바꿈이 있는 UTF-8 JSON 문자열로 직렬화한다. */
export function serializeAITrainingResult(document: AITrainingResultDocument): string {
  return JSON.stringify(document, null, 2) + "\n";
}
