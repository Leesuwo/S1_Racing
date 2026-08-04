/**
 * M2D~M3D 레이스 주말의 단계 전이·전략·운영 경계를 조정한다.
 * Practice/Qualifying/Race의 규칙 상태만 보유하고, 타이어·racecraft·운영 물리는 RaceSession에 위임한다.
 */
import type { VehicleControlInput } from "../../game/input/VehicleControlInput";
import { neutralVehicleControlInput } from "../../game/input/VehicleControlInput";
import { type SingleOpponentAIConfig } from "../ai/SingleOpponentAI";
import { TEST_TRACK_DATA, type TestTrackDefinition } from "../../tracks/TestTrack";
import { TYRE_COMPOUNDS, type TyreCompound } from "../../game/physics/TyreCondition";
import { getVehicleSetup, type VehicleSetup, type VehicleSetupPresetId } from "../../game/physics/VehicleSetup";
export { TYRE_COMPOUNDS, type TyreCompound } from "../../game/physics/TyreCondition";
import {
  createQualifyingGrid,
  QUALIFYING_RULESET,
  QualifyingSession,
  type QualifyingSnapshot,
} from "./QualifyingSession";
import {
  createRaceGrid,
  RaceSession,
  type RaceTyrePlan,
  type RaceParticipantDefinition,
  type RaceSessionSnapshot,
} from "./RaceSession";
import {
  getLoadedReplaySnapshot,
  RaceReplayRecorder,
  type RaceReplayRecording,
  type RaceReplaySnapshot,
  validateRaceReplayRecording,
} from "./RaceReplay";
import { DEFAULT_RACE_FUEL_PLAN, normalizeRaceFuelPlan, type RaceFuelPlan } from "./RaceFuel";

/** 최소 한 번의 피트 정지를 표현하는 전략 계약이다. 랩 단위는 1부터 시작한다. */
export interface RaceStrategy {
  startCompound: TyreCompound;
  pitStopLap: number;
  pitStopCompound: TyreCompound;
}

/** 주말 단계와 UI가 표시할 생명주기 상태다. */
export type RaceWeekendStage = "practice" | "qualifying" | "sprint" | "race" | "results";
export type RaceWeekendStatus = "ready" | "running" | "complete";

/** M7에서 선택할 Grand Prix 또는 스프린트 포함 주말 흐름이다. */
export type RaceWeekendFormat = "grand-prix" | "sprint";

/** M7~M8 주말 생성 시 고정하는 스케줄·셋업·연료 옵션이다. */
export interface RaceWeekendOptions {
  format?: RaceWeekendFormat;
  sprintLaps?: number;
  vehicleSetupId?: VehicleSetupPresetId;
  fuelPlan?: RaceFuelPlan;
}

/** Practice부터 결과까지의 통합 상태 스냅샷이다. */
export interface RaceWeekendSnapshot {
  stage: RaceWeekendStage;
  status: RaceWeekendStatus;
  trackName: string;
  rulesetVersion: string;
  totalLaps: number;
  format: RaceWeekendFormat;
  sprintCompleted: boolean;
  sprintResult?: RaceSessionSnapshot;
  vehicleSetup: VehicleSetup;
  fuelPlan: RaceFuelPlan;
  practiceCompleted: boolean;
  selectedCompound: TyreCompound;
  strategy: RaceStrategy;
  qualifying: QualifyingSnapshot;
  race: RaceSessionSnapshot;
  replay: RaceReplaySnapshot;
}

/** M2D 초기 주말에서 사용하는 랩 수다. 실제 경기 규정 값이 아닌 initial_assumption이다. */
export const DEFAULT_RACE_WEEKEND_LAPS = 3;

/** 스프린트는 본선보다 짧지만 순위를 검증할 수 있도록 최소 1랩을 사용한다. */
export const DEFAULT_SPRINT_LAPS = 1;

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

/** 완료된 스프린트 순위를 다음 메인 레이스의 같은 차량 정의·새 그리드 슬롯으로 변환한다. */
function createRaceDefinitionsFromStandings(
  track: TestTrackDefinition,
  standings: readonly RaceSessionSnapshot["standings"][number][],
  participantCount: number,
): readonly RaceParticipantDefinition[] {
  const baseDefinitions = createRaceGrid(track, participantCount);
  const definitionsById = new Map(baseDefinitions.map((definition) => [definition.id, definition]));
  return standings.slice(0, participantCount).map((standing, gridSlot) => {
    const definition = definitionsById.get(standing.id);
    if (!definition) throw new Error("Sprint result contains an unknown race participant");
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
  /** M7 스케줄 선택은 Practice 이전에만 바꾸며, 진행 중 세션을 재해석하지 않는다. */
  private format: RaceWeekendFormat;
  private readonly sprintLaps: number;
  private sprintCompleted = false;
  private sprintResult: RaceSessionSnapshot | undefined;
  /** M8 제한형 셋업은 모든 참가자의 공통 VehicleSimulation 입력 배율로 연결된다. */
  private vehicleSetupId: VehicleSetupPresetId;
  /** M8 연료 계획은 레이스 생성 전에는 변경 가능하고, 시작 후에는 replay 전제의 일부로 잠긴다. */
  private fuelPlan: RaceFuelPlan;
  // RaceSession의 입력·digest 기록을 소유하며 React가 기록 배열을 직접 변경하지 않게 한다.
  private replayRecorder: RaceReplayRecorder | undefined;
  // 종료되거나 파일에서 불러온 immutable replay 문서다.
  private replayRecording: RaceReplayRecording | undefined;
  // Race Weekend UI가 현재 캡처 상태를 읽는 복사본이다.
  private replaySnapshot: RaceReplaySnapshot = {
    status: "idle",
    frameCount: 0,
    fixedStepHz: 120,
    verification: "not-run",
  };

  constructor(
    track: TestTrackDefinition = TEST_TRACK_DATA,
    participantCount = 20,
    totalLaps = DEFAULT_RACE_WEEKEND_LAPS,
    aiConfig?: SingleOpponentAIConfig,
    options: RaceWeekendOptions = {},
  ) {
    this.track = track;
    this.participantCount = Math.max(2, Math.min(20, Math.floor(participantCount)));
    this.totalLaps = Math.max(2, Math.floor(totalLaps));
    this.format = options.format ?? "grand-prix";
    this.sprintLaps = Math.max(1, Math.min(this.totalLaps, Math.floor(options.sprintLaps ?? DEFAULT_SPRINT_LAPS)));
    this.vehicleSetupId = options.vehicleSetupId ?? "balanced";
    this.fuelPlan = normalizeRaceFuelPlan(options.fuelPlan ?? DEFAULT_RACE_FUEL_PLAN);
    this.qualifying = new QualifyingSession(createQualifyingGrid());
    // 짧은 테스트 주말에서도 기본 전략이 마지막 전 랩의 유효 범위를 벗어나지 않게 보정한다.
    this.strategy = {
      ...DEFAULT_RACE_STRATEGY,
      pitStopLap: Math.min(DEFAULT_RACE_STRATEGY.pitStopLap, this.totalLaps - 1),
    };
    this.raceSession = new RaceSession(
      createRaceGrid(track, this.participantCount, aiConfig),
      track,
      this.totalLaps,
      undefined,
      { startCompound: this.selectedCompound },
      { vehicleSetupId: this.vehicleSetupId, fuelPlan: this.fuelPlan },
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
    if (this.stage === "sprint" || this.stage === "race" || this.stage === "results") throw new Error("Tyre selection is locked after race start");
    this.selectedCompound = compound;
    this.strategy = { ...this.strategy, startCompound: compound };
  }

  /** 최소 한 번의 피트 정지와 다른 컴파운드를 검증해 전략을 저장한다. */
  setStrategy(strategy: RaceStrategy): void {
    if (this.stage === "sprint" || this.stage === "race" || this.stage === "results") throw new Error("Strategy is locked after race start");
    if (strategy.startCompound !== this.selectedCompound) throw new Error("Strategy start tyre must match the selected tyre");
    if (!TYRE_COMPOUNDS.includes(strategy.pitStopCompound)) throw new Error("Unsupported pit-stop tyre compound");
    if (strategy.pitStopCompound === strategy.startCompound) throw new Error("Pit-stop compound must differ from start tyre");
    if (!Number.isInteger(strategy.pitStopLap) || strategy.pitStopLap < 1 || strategy.pitStopLap >= this.totalLaps) {
      throw new Error("Pit-stop lap must be between lap 1 and the penultimate lap");
    }
    this.strategy = { ...strategy };
  }

  /** Practice 단계에서만 다음 주말의 스프린트 포함 여부를 바꾼다. */
  setFormat(format: RaceWeekendFormat): void {
    if (this.stage !== "practice") throw new Error("Weekend format is locked after practice");
    this.format = format;
  }

  /** 셋업은 RaceSession 생성 전에만 바꾸며 선택 즉시 읽기 전용 스냅샷에 반영한다. */
  setVehicleSetup(vehicleSetupId: VehicleSetupPresetId): void {
    if (this.stage === "sprint" || this.stage === "race" || this.stage === "results") throw new Error("Vehicle setup is locked after race start");
    this.vehicleSetupId = getVehicleSetup(vehicleSetupId).id;
  }

  /** 연료 계획은 피트 계획과 함께 manifest에 저장되므로 레이스 시작 후에는 변경할 수 없다. */
  setFuelPlan(fuelPlan: RaceFuelPlan): void {
    if (this.stage === "sprint" || this.stage === "race" || this.stage === "results") throw new Error("Fuel plan is locked after race start");
    this.fuelPlan = normalizeRaceFuelPlan(fuelPlan);
  }

  /** 퀄리파잉 최종 순서로 레이스 그리드를 재구성하고 레이스를 시작한다. */
  beginRace(): RaceWeekendSnapshot {
    if (this.qualifying.getSnapshot().status !== "complete") throw new Error("Qualifying must be complete before race");
    if ((this.stage === "race" || this.stage === "sprint") && this.status === "running") return this.getSnapshot();
    const qualifyingDefinitions = createRaceDefinitions(this.track, this.qualifying, this.participantCount);
    if (this.format === "sprint" && !this.sprintCompleted) {
      this.raceSession = new RaceSession(
        qualifyingDefinitions,
        this.track,
        this.sprintLaps,
        undefined,
        { startCompound: this.selectedCompound },
        { vehicleSetupId: this.vehicleSetupId, fuelPlan: this.fuelPlan },
      );
      this.raceSession.start();
      this.stage = "sprint";
      this.status = "running";
      return this.getSnapshot();
    }
    const definitions = this.sprintResult
      ? createRaceDefinitionsFromStandings(this.track, this.sprintResult.standings, this.participantCount)
      : qualifyingDefinitions;
    const tyrePlan: RaceTyrePlan = {
      startCompound: this.selectedCompound,
      pitStopLap: this.strategy.pitStopLap,
      pitStopCompound: this.strategy.pitStopCompound,
    };
    this.raceSession = new RaceSession(definitions, this.track, this.totalLaps, undefined, tyrePlan, {
      vehicleSetupId: this.vehicleSetupId,
      fuelPlan: this.fuelPlan,
    });
    // grid digest를 먼저 보존해야 start 이후 첫 입력부터 동일한 초기 상태를 검증할 수 있다.
    this.replayRecorder = new RaceReplayRecorder(this.raceSession.getSnapshot(), this.raceSession.getReplayManifest());
    this.replayRecording = undefined;
    this.raceSession.start();
    this.stage = "race";
    this.status = "running";
    this.replaySnapshot = this.replayRecorder.getSnapshot();
    return this.getSnapshot();
  }

  /** RaceSession의 fixed-step을 진행하고 종료 시 결과 단계로 전환한다. */
  advanceRace(
    playerInput: VehicleControlInput = neutralVehicleControlInput(),
    maxSteps = 2,
  ): RaceWeekendSnapshot {
    if ((this.stage !== "sprint" && this.stage !== "race") || this.status !== "running") return this.getSnapshot();
    const safeSteps = Math.max(1, Math.min(12, Math.floor(maxSteps)));
    let raceSnapshot = this.raceSession.getSnapshot();
    for (let index = 0; index < safeSteps && raceSnapshot.status === "running"; index += 1) {
      raceSnapshot = this.raceSession.step(playerInput);
      if (this.stage === "race") this.replayRecorder?.recordStep(playerInput, raceSnapshot);
      if (raceSnapshot.status === "finished") {
        if (this.stage === "sprint") {
          this.sprintResult = raceSnapshot;
          this.sprintCompleted = true;
          this.stage = "race";
          this.status = "ready";
          break;
        }
        this.status = "complete";
        this.stage = "results";
        if (this.replayRecorder) {
          this.replayRecording = this.replayRecorder.finish(raceSnapshot);
          this.replaySnapshot = this.replayRecorder.getSnapshot();
        }
      }
    }
    if (this.replayRecorder?.getSnapshot().status === "recording") {
      this.replaySnapshot = this.replayRecorder.getSnapshot();
    }
    return this.getSnapshot();
  }

  /** 현재 주말에 기록된 완료 replay를 저장·다운로드 계층에 전달한다. */
  getReplayRecording(): RaceReplayRecording | undefined {
    return this.replayRecording;
  }

  /** 현재 트랙·랩·그리드와 호환되는 replay JSON을 불러온다. */
  loadReplay(recording: RaceReplayRecording): void {
    validateRaceReplayRecording(recording);
    if (
      recording.metadata.trackName !== this.track.name
      || recording.metadata.totalLaps !== this.totalLaps
      || recording.metadata.participantCount !== this.participantCount
    ) {
      throw new Error("Replay metadata does not match the current Race Weekend");
    }
    this.replayRecorder = undefined;
    this.replayRecording = recording;
    this.replaySnapshot = getLoadedReplaySnapshot(recording);
  }

  /** Practice부터 그리드·전략·타이머를 초기 상태로 돌린다. */
  reset(): void {
    this.qualifying.reset();
    this.raceSession.reset();
    this.stage = "practice";
    this.status = "ready";
    this.selectedCompound = DEFAULT_RACE_STRATEGY.startCompound;
    this.strategy = {
      ...DEFAULT_RACE_STRATEGY,
      pitStopLap: Math.min(DEFAULT_RACE_STRATEGY.pitStopLap, this.totalLaps - 1),
    };
    this.practiceCompleted = false;
    this.sprintCompleted = false;
    this.sprintResult = undefined;
    this.replayRecorder = undefined;
    this.replayRecording = undefined;
    this.replaySnapshot = {
      status: "idle",
      frameCount: 0,
      fixedStepHz: 120,
      verification: "not-run",
    };
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
      format: this.format,
      sprintCompleted: this.sprintCompleted,
      sprintResult: this.sprintResult,
      vehicleSetup: getVehicleSetup(this.vehicleSetupId),
      fuelPlan: { ...this.fuelPlan },
      practiceCompleted: this.practiceCompleted,
      selectedCompound: this.selectedCompound,
      strategy: { ...this.strategy },
      qualifying: this.qualifying.getSnapshot(),
      race: this.raceSession.getSnapshot(),
      replay: { ...this.replaySnapshot },
    };
  }
}
