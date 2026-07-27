/**
 * M2D 레이스 주말의 단계 전이와 최소 전략 경계를 조정한다.
 * Practice/Qualifying/Race의 규칙 상태만 보유하고, 주행 물리는 RaceSession에 위임한다.
 */
import type { VehicleControlInput } from "../../game/input/VehicleControlInput";
import { neutralVehicleControlInput } from "../../game/input/VehicleControlInput";
import { type SingleOpponentAIConfig } from "../ai/SingleOpponentAI";
import { TEST_TRACK_DATA, type TestTrackDefinition } from "../../tracks/TestTrack";
import {
  createQualifyingGrid,
  QUALIFYING_RULESET,
  QualifyingSession,
  type QualifyingSnapshot,
} from "./QualifyingSession";
import {
  createRaceGrid,
  RaceSession,
  type RaceParticipantDefinition,
  type RaceSessionSnapshot,
} from "./RaceSession";

/** 레이스 주말에서 선택할 수 있는 타이어 컴파운드다. 열화 모델은 후속 범위다. */
export type TyreCompound = "soft" | "medium" | "hard";

/** 최소 한 번의 피트 정지를 표현하는 전략 계약이다. 랩 단위는 1부터 시작한다. */
export interface RaceStrategy {
  startCompound: TyreCompound;
  pitStopLap: number;
  pitStopCompound: TyreCompound;
}

/** 주말 단계와 UI가 표시할 생명주기 상태다. */
export type RaceWeekendStage = "practice" | "qualifying" | "race" | "results";
export type RaceWeekendStatus = "ready" | "running" | "complete";

/** Practice부터 결과까지의 통합 상태 스냅샷이다. */
export interface RaceWeekendSnapshot {
  stage: RaceWeekendStage;
  status: RaceWeekendStatus;
  trackName: string;
  rulesetVersion: string;
  totalLaps: number;
  practiceCompleted: boolean;
  selectedCompound: TyreCompound;
  strategy: RaceStrategy;
  qualifying: QualifyingSnapshot;
  race: RaceSessionSnapshot;
}

/** 레이스 주말의 최소 전략 선택지와 검증 상태를 UI에서 순회할 때 사용한다. */
export const TYRE_COMPOUNDS: readonly TyreCompound[] = ["soft", "medium", "hard"];

/** M2D 초기 주말에서 사용하는 랩 수다. 실제 경기 규정 값이 아닌 initial_assumption이다. */
export const DEFAULT_RACE_WEEKEND_LAPS = 3;

/** 기본 전략은 시작 타이어와 다른 컴파운드로 한 번 정지하는 최소 경계다. */
const DEFAULT_RACE_STRATEGY: RaceStrategy = {
  startCompound: "medium",
  pitStopLap: 2,
  pitStopCompound: "hard",
};

/** 랩타임 합성에 사용할 단계별 초기 가정이다. 실제 차량 성능을 의미하지 않는다. */
const QUALIFYING_PHASE_OFFSETS_SECONDS: Record<"Q1" | "Q2" | "Q3", number> = {
  Q1: 0,
  Q2: -0.35,
  Q3: -0.7,
};

/** 결과가 같은 경우에도 항상 같은 순서를 만드는 레이스 정의를 생성한다. */
function createRaceDefinitions(
  track: TestTrackDefinition,
  qualifying: QualifyingSession,
  participantCount: number,
  aiConfig?: SingleOpponentAIConfig,
): readonly RaceParticipantDefinition[] {
  const baseDefinitions = createRaceGrid(track, participantCount, aiConfig);
  const definitionsById = new Map(baseDefinitions.map((definition) => [definition.id, definition]));
  const qualifyingOrder = qualifying.getGridOrder();
  return qualifyingOrder.slice(0, participantCount).map((id, gridSlot) => {
    const definition = definitionsById.get(id);
    if (!definition) throw new Error("Qualifying result contains an unknown race participant");
    return { ...definition, gridSlot };
  });
}

/** M2D 전체 주말을 하나의 결정적 상태 기계로 묶는다. */
export class RaceWeekendSession {
  /** 모든 세션이 공유하는 트랙 데이터 원본이다. */
  readonly track: TestTrackDefinition;
  /** 주말 내 레이스에 참가하는 차량 수다. */
  readonly participantCount: number;
  /** 주말의 레이스 랩 수다. */
  readonly totalLaps: number;
  /** Q1/Q2/Q3 결과를 소유하는 규칙 세션이다. */
  readonly qualifying: QualifyingSession;
  /** 현재 레이스 차량의 fixed-step 물리를 소유한다. */
  private raceSession: RaceSession;
  private stage: RaceWeekendStage = "practice";
  private status: RaceWeekendStatus = "ready";
  private selectedCompound: TyreCompound = DEFAULT_RACE_STRATEGY.startCompound;
  private strategy: RaceStrategy = { ...DEFAULT_RACE_STRATEGY };
  private practiceCompleted = false;

  constructor(
    track: TestTrackDefinition = TEST_TRACK_DATA,
    participantCount = 20,
    totalLaps = DEFAULT_RACE_WEEKEND_LAPS,
    aiConfig?: SingleOpponentAIConfig,
  ) {
    this.track = track;
    this.participantCount = Math.max(2, Math.min(20, Math.floor(participantCount)));
    this.totalLaps = Math.max(2, Math.floor(totalLaps));
    this.qualifying = new QualifyingSession(createQualifyingGrid());
    this.raceSession = new RaceSession(
      createRaceGrid(track, this.participantCount, aiConfig),
      track,
      this.totalLaps,
    );
  }

  /** Practice를 완료하고 퀄리파잉 진입 상태로 전환한다. */
  completePractice(): void {
    if (this.stage !== "practice" || this.status === "complete") return;
    this.practiceCompleted = true;
    this.stage = "qualifying";
    this.status = "ready";
  }

  /** Q1을 시작한다. Practice 완료 상태에서만 호출할 수 있다. */
  beginQualifying(): void {
    if (!this.practiceCompleted || this.stage !== "qualifying") {
      throw new Error("Practice must be completed before qualifying");
    }
    this.qualifying.start();
    this.status = "running";
  }

  /** 자동 QA와 프로토타입 UI에서 사용할 결정적 Q1/Q2/Q3 실행기다. */
  runDeterministicQualifying(): RaceWeekendSnapshot {
    if (this.stage === "practice") this.completePractice();
    if (this.stage !== "qualifying") throw new Error("Qualifying is not the active weekend stage");
    if (this.qualifying.getSnapshot().status === "ready") this.beginQualifying();

    const gridSlots = new Map(createQualifyingGrid().map((participant) => [participant.id, participant.gridSlot]));
    while (this.qualifying.getSnapshot().status === "running") {
      const qualifyingSnapshot = this.qualifying.getSnapshot();
      qualifyingSnapshot.activeParticipantIds.forEach((participantId) => {
        const gridSlot = gridSlots.get(participantId) ?? 0;
        const phaseOffset = QUALIFYING_PHASE_OFFSETS_SECONDS[qualifyingSnapshot.phase];
        const lapTimeSeconds = 88 + gridSlot * 0.025 + phaseOffset;
        // 일부 첫 시도는 트랙 제한을 벗어나지만, 두 번째 유효 랩으로 세션을 진행한다.
        if ((gridSlot + qualifyingSnapshot.phase.length) % 7 === 0) {
          this.qualifying.recordLap({
            participantId,
            lapNumber: 1,
            lapTimeSeconds,
            valid: false,
          });
        }
        this.qualifying.recordLap({
          participantId,
          lapNumber: 2,
          lapTimeSeconds,
          valid: true,
        });
      });
      this.qualifying.completePhase();
    }
    this.status = "complete";
    return this.getSnapshot();
  }

  /** 시작 타이어를 선택한다. Race 시작 전 단계에서만 바꿀 수 있다. */
  selectTyre(compound: TyreCompound): void {
    if (!TYRE_COMPOUNDS.includes(compound)) throw new Error("Unsupported tyre compound");
    if (this.stage === "race" || this.stage === "results") throw new Error("Tyre selection is locked after race start");
    this.selectedCompound = compound;
    this.strategy = { ...this.strategy, startCompound: compound };
  }

  /** 최소 한 번의 피트 정지와 다른 컴파운드를 검증해 전략을 저장한다. */
  setStrategy(strategy: RaceStrategy): void {
    if (this.stage === "race" || this.stage === "results") throw new Error("Strategy is locked after race start");
    if (strategy.startCompound !== this.selectedCompound) throw new Error("Strategy start tyre must match the selected tyre");
    if (!TYRE_COMPOUNDS.includes(strategy.pitStopCompound)) throw new Error("Unsupported pit-stop tyre compound");
    if (strategy.pitStopCompound === strategy.startCompound) throw new Error("Pit-stop compound must differ from start tyre");
    if (!Number.isInteger(strategy.pitStopLap) || strategy.pitStopLap < 1 || strategy.pitStopLap >= this.totalLaps) {
      throw new Error("Pit-stop lap must be between lap 1 and the penultimate lap");
    }
    this.strategy = { ...strategy };
  }

  /** 퀄리파잉 최종 순서로 레이스 그리드를 재구성하고 레이스를 시작한다. */
  beginRace(): RaceWeekendSnapshot {
    if (this.qualifying.getSnapshot().status !== "complete") throw new Error("Qualifying must be complete before race");
    if (this.stage === "race" && this.status === "running") return this.getSnapshot();
    const definitions = createRaceDefinitions(this.track, this.qualifying, this.participantCount);
    this.raceSession = new RaceSession(definitions, this.track, this.totalLaps);
    this.raceSession.start();
    this.stage = "race";
    this.status = "running";
    return this.getSnapshot();
  }

  /** RaceSession의 fixed-step을 진행하고 종료 시 결과 단계로 전환한다. */
  advanceRace(
    playerInput: VehicleControlInput = neutralVehicleControlInput(),
    maxSteps = 2,
  ): RaceWeekendSnapshot {
    if (this.stage !== "race" || this.status !== "running") return this.getSnapshot();
    const raceSnapshot = this.raceSession.advance(maxSteps, playerInput);
    if (raceSnapshot.status === "finished") this.status = "complete";
    if (raceSnapshot.status === "finished") this.stage = "results";
    return this.getSnapshot();
  }

  /** Practice부터 그리드·전략·타이머를 초기 상태로 돌린다. */
  reset(): void {
    this.qualifying.reset();
    this.raceSession.reset();
    this.stage = "practice";
    this.status = "ready";
    this.selectedCompound = DEFAULT_RACE_STRATEGY.startCompound;
    this.strategy = { ...DEFAULT_RACE_STRATEGY };
    this.practiceCompleted = false;
  }

  /** 렌더러가 레이스 차량의 읽기 전용 포즈를 구독할 수 있게 한다. */
  getRaceSession(): RaceSession {
    return this.raceSession;
  }

  /** 주말 전체의 현재 상태를 소유권이 분리된 스냅샷으로 반환한다. */
  getSnapshot(): RaceWeekendSnapshot {
    return {
      stage: this.stage,
      status: this.status,
      trackName: this.track.name,
      rulesetVersion: QUALIFYING_RULESET.version,
      totalLaps: this.totalLaps,
      practiceCompleted: this.practiceCompleted,
      selectedCompound: this.selectedCompound,
      strategy: { ...this.strategy },
      qualifying: this.qualifying.getSnapshot(),
      race: this.raceSession.getSnapshot(),
    };
  }
}
