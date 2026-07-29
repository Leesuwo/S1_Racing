/**
 * M3B·M3C·M3D 다차량 레이스 세션의 순수 fixed-step 실행기다.
 * 차량 위치·속도는 각 VehicleSimulation이 소유하고, 이 모듈은 AI 입력·레이스크래프트·랩 진행·트랙 리밋·접촉·운영 상태·순위를 조정한다.
 * AI 상태 머신은 입력 편향만 반환하며 차량 위치를 직접 변경하지 않는다.
 */
import type { VehicleControlInput } from "../../game/input/VehicleControlInput";
import { neutralVehicleControlInput } from "../../game/input/VehicleControlInput";
import { SingleOpponentAI, type SingleOpponentAIConfig } from "../ai/SingleOpponentAI";
import { VehicleSimulation, type VehicleRenderSnapshot } from "../../game/physics/VehicleSimulation";
import {
  sampleTestTrackLocation,
  TEST_TRACK_DATA,
  type TestTrackDefinition,
  type TestTrackStartPose,
  type TrackPoint,
} from "../../tracks/TestTrack";
import { type TyreCompound, type TyreConditionSnapshot } from "../../game/physics/TyreCondition";
import { TrackLimitsMonitor, type TrackLimitsSnapshot } from "./TrackLimits";
import { resolveVehicleContacts } from "./VehicleContact";
import type { RaceCollisionBodyInput, RaceCollisionWorld, RaceCollisionStepResult } from "./RaceCollisionWorld";
import { PitLaneMonitor, type PitLaneSnapshot } from "./PitLane";
import { RaceRegulations, PIT_SPEED_PENALTY_SECONDS, type RaceRegulationSnapshot } from "./RaceRegulations";
import { RacecraftStateMachine, type RacecraftSnapshot } from "./Racecraft";
import {
  RaceOperations,
  type RaceFlag,
  type RaceOperationsSnapshot,
} from "./RaceOperations";

/** 레이스 세션에 참가하는 차량의 제어 주체다. */
export type RaceParticipantKind = "player" | "ai";

/** 차량 한 대의 그리드·AI·리셋 계약이다. */
export interface RaceParticipantDefinition {
  id: string;
  label: string;
  kind: RaceParticipantKind;
  gridSlot: number;
  startPose: TestTrackStartPose;
  aiConfig?: SingleOpponentAIConfig;
}

/** 레이스 전체에 적용할 시작 컴파운드와 선택적 피트 교체 계획이다. */
export interface RaceTyrePlan {
  startCompound: TyreCompound;
  pitStopLap?: number;
  pitStopCompound?: TyreCompound;
}

/** 단일 차량 세션의 기본 타이어 계획이다. 피트 교체는 선택적으로 활성화된다. */
export const DEFAULT_RACE_TYRE_PLAN: RaceTyrePlan = {
  startCompound: "medium",
};

/** 순위 계산과 렌더링에 필요한 차량 한 대의 읽기 전용 상태다. */
export interface RaceParticipantSnapshot {
  id: string;
  label: string;
  kind: RaceParticipantKind;
  gridSlot: number;
  position: number;
  positionM: TrackPoint;
  speedMps: number;
  lapIndex: number;
  progressM: number;
  raceDistanceM: number;
  finished: boolean;
  retired: boolean;
  trackLimits: TrackLimitsSnapshot;
  tyreCondition: TyreConditionSnapshot;
  racecraft: RacecraftSnapshot;
  operations: RaceOperationsSnapshot;
  pitLane: PitLaneSnapshot;
  regulationPenaltySeconds: number;
  finishTimeSeconds?: number;
}

/** M3B·M3C·M3D fixed-step 레이스 세션의 UI·QA 스냅샷이다. */
export interface RaceSessionSnapshot {
  status: "grid" | "running" | "paused" | "finished";
  trackName: string;
  stepIndex: number;
  elapsedSeconds: number;
  totalLaps: number;
  participantCount: number;
  finishedCount: number;
  resetCount: number;
  fixedStepDurationMs: number;
  maximumFixedStepDurationMs: number;
  contactCount: number;
  tyreChangeCount: number;
  pitLaneViolationCount: number;
  flag: RaceFlag;
  regulations: RaceRegulationSnapshot;
  standings: readonly RaceParticipantSnapshot[];
}

/** 순위·차량 렌더러가 내부 시뮬레이션 객체를 직접 소유하지 않도록 하는 렌더 스냅샷이다. */
export interface RaceVehicleRenderSnapshot {
  id: string;
  label: string;
  kind: RaceParticipantKind;
  snapshot: VehicleRenderSnapshot;
}

/** 사용자 화면에서 선택할 수 있는 기본 그리드 차량 수다. 수치는 M2B 초기 가정이다. */
export const DEFAULT_RACE_GRID_SIZE = 6;

/** RaceSession이 비정상 입력을 무한히 실행하지 않도록 하는 기본 fixed-step 상한이다. 시뮬레이션 시간은 45 s다. */
export const DEFAULT_RACE_MAX_STEPS = 120 * 45;

/**
 * 렌더 시간·성능 측정값을 제외한 레이스 상태를 FNV-1a digest로 직렬화한다.
 * 결정성 QA가 같은 입력에서 동일한 물리·전략·운영 상태를 재현했는지 비교할 때 사용한다.
 */
export function createRaceDeterminismDigest(snapshot: RaceSessionSnapshot): string {
  let hash = 2166136261;
  const append = (value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  };
  const number = (value: number, digits = 4): string => Number.isFinite(value) ? value.toFixed(digits) : "NaN";
  append([snapshot.status, snapshot.trackName, String(snapshot.stepIndex), number(snapshot.elapsedSeconds), String(snapshot.resetCount), snapshot.flag].join("|"));
  snapshot.standings.forEach((participant) => {
    append([
      participant.id,
      String(participant.position),
      number(participant.positionM.x),
      number(participant.positionM.z),
      number(participant.speedMps),
      number(participant.progressM),
      String(participant.lapIndex),
      String(participant.finished),
      String(participant.retired),
      participant.tyreCondition.compound,
      number(participant.tyreCondition.averageTemperatureC, 3),
      number(participant.tyreCondition.averageWearRatio, 6),
      number(participant.tyreCondition.averagePressureKPa, 3),
      participant.racecraft.mode,
      String(participant.racecraft.overtakeMode),
      participant.operations.flag,
      number(participant.operations.damage.totalRatio, 6),
      number(participant.operations.damage.performanceMultiplier, 6),
      participant.operations.pitStop.status,
      number(participant.operations.pitStop.remainingSeconds, 4),
      String(participant.operations.pitStop.stopCount),
      String(participant.trackLimits.violationCount),
      String(participant.trackLimits.lapValid),
      participant.pitLane.status,
      number(participant.pitLane.laneProgressM, 3),
      String(participant.pitLane.speedViolationCount),
      number(participant.regulationPenaltySeconds, 3),
    ].join("|"));
  });
  return hash.toString(16).padStart(8, "0");
}

/** M3A 원형 접촉 근사의 차량 반경(m)이다. 차체 형상은 Rapier 리그가 소유한다. */
const RACE_CONTACT_RADIUS_M = 1.25;

/** 트랙 밖 또는 정지 상태가 지속될 때 세션이 결과로 수렴하도록 하는 초기 가정(s)이다. */
const STALLED_RETIREMENT_SECONDS = 6;

/** 레이싱 라인 길이와 선분별 시작 거리를 캐시한다. 거리 단위는 m다. */
interface TrackDistanceMap {
  segmentLengthsM: readonly number[];
  cumulativeStartsM: readonly number[];
  totalLengthM: number;
}

/** 참가자별 물리·AI·진행 상태를 한곳에 보관한다. */
interface RaceParticipantState {
  definition: RaceParticipantDefinition;
  simulation: VehicleSimulation;
  ai?: SingleOpponentAI;
  trackLimits: TrackLimitsMonitor;
  previousProjectedDistanceM: number;
  progressM: number;
  finished: boolean;
  retired: boolean;
  finishTimeSeconds?: number;
  tyreChangeApplied: boolean;
  racecraft: RacecraftStateMachine;
  operations: RaceOperations;
  pitLane: PitLaneMonitor;
  noProgressSeconds: number;
}

/** 두 평면 위치 사이의 거리(m)를 계산한다. */
function distanceM(first: TrackPoint, second: TrackPoint): number {
  return Math.hypot(second.x - first.x, second.z - first.z);
}

/** 레이싱 라인 폐곡선의 누적 거리 캐시를 생성한다. */
function createTrackDistanceMap(track: TestTrackDefinition): TrackDistanceMap {
  const segmentLengthsM = track.racingLine.map((point, index) => (
    distanceM(point.position, track.racingLine[(index + 1) % track.racingLine.length].position)
  ));
  const cumulativeStartsM: number[] = [];
  let totalLengthM = 0;
  segmentLengthsM.forEach((segmentLengthM) => {
    cumulativeStartsM.push(totalLengthM);
    totalLengthM += segmentLengthM;
  });
  return { segmentLengthsM, cumulativeStartsM, totalLengthM };
}

/** 차량 위치를 가장 가까운 레이싱 라인 선분으로 투영해 누적 거리(m)를 구한다. */
function projectDistanceM(
  position: TrackPoint,
  track: TestTrackDefinition,
  distanceMap: TrackDistanceMap,
): number {
  if (track.racingLine.length < 2 || distanceMap.totalLengthM <= 0) return 0;

  let closestDistanceSquared = Number.POSITIVE_INFINITY;
  let closestDistanceM = 0;
  track.racingLine.forEach((start, index) => {
    const end = track.racingLine[(index + 1) % track.racingLine.length];
    const deltaX = end.position.x - start.position.x;
    const deltaZ = end.position.z - start.position.z;
    const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
    const ratio = lengthSquared > 0
      ? Math.max(0, Math.min(1, ((position.x - start.position.x) * deltaX + (position.z - start.position.z) * deltaZ) / lengthSquared))
      : 0;
    const projected = {
      x: start.position.x + deltaX * ratio,
      z: start.position.z + deltaZ * ratio,
    };
    const distanceSquared = (position.x - projected.x) ** 2 + (position.z - projected.z) ** 2;
    if (distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = distanceSquared;
      closestDistanceM = (distanceMap.cumulativeStartsM[index] ?? 0)
        + (distanceMap.segmentLengthsM[index] ?? 0) * ratio;
    }
  });
  return closestDistanceM;
}

/** 폐곡선 경계를 통과할 때도 실제 전진·후진 방향을 보존한 거리 차(m)를 계산한다. */
function signedTrackDeltaM(previousDistanceM: number, nextDistanceM: number, trackLengthM: number): number {
  if (trackLengthM <= 0) return 0;
  let deltaM = nextDistanceM - previousDistanceM;
  if (deltaM > trackLengthM * 0.5) deltaM -= trackLengthM;
  if (deltaM < -trackLengthM * 0.5) deltaM += trackLengthM;
  return deltaM;
}

/** +X/+Z 평면의 전방·우측 벡터를 이용해 그리드 슬롯을 생성한다. */
export function createRaceGrid(
  track: TestTrackDefinition = TEST_TRACK_DATA,
  count = DEFAULT_RACE_GRID_SIZE,
  aiConfig?: SingleOpponentAIConfig,
): readonly RaceParticipantDefinition[] {
  const safeCount = Math.max(2, Math.min(20, Math.floor(count)));
  const pose = track.startPose;
  const forward = { x: Math.sin(pose.yawRad), z: -Math.cos(pose.yawRad) };
  const right = { x: Math.cos(pose.yawRad), z: Math.sin(pose.yawRad) };
  return Array.from({ length: safeCount }, (_, gridSlot) => {
    const row = Math.floor(gridSlot / 2);
    const side = gridSlot % 2 === 0 ? -1 : 1;
    const longitudinalOffsetM = row * 5.2 + 1.1;
    const lateralOffsetM = side * 1.45;
    return {
      id: gridSlot === 0 ? "player" : "ai-" + String(gridSlot),
      label: gridSlot === 0 ? "PLAYER" : "AI " + String(gridSlot),
      kind: gridSlot === 0 ? "player" : "ai",
      gridSlot,
      startPose: {
        position: {
          x: pose.position.x - forward.x * longitudinalOffsetM + right.x * lateralOffsetM,
          z: pose.position.z - forward.z * longitudinalOffsetM + right.z * lateralOffsetM,
        },
        yawRad: pose.yawRad,
      },
      aiConfig,
    };
  });
}

/**
 * 다차량 고정 스텝 세션이다.
 * AI 차량은 SingleOpponentAI가 만든 입력만 받고, 모든 차량의 위치·속도는 VehicleSimulation이 계산한다.
 */
export class RaceSession {
  /** 모든 참가자가 공유하는 트랙 데이터 원본이다. */
  readonly track: TestTrackDefinition;
  /** 한 랩의 레이싱 라인 길이(m)다. */
  readonly trackLengthM: number;
  /** 실제 물리 차량과 AI 제어 상태를 소유한다. */
  private readonly participants: RaceParticipantState[];
  /** 한 차량이 완료해야 하는 랩 수다. */
  private readonly totalLaps: number;
  /** 에피소드가 무한히 실행되지 않도록 하는 fixed-step 상한이다. */
  private readonly maxSteps: number;
  private readonly distanceMap: TrackDistanceMap;
  private readonly regulations = new RaceRegulations();
  private status: RaceSessionSnapshot["status"] = "grid";
  private stepIndex = 0;
  private elapsedSeconds = 0;
  private resetCount = 0;
  private fixedStepDurationMs = 0;
  private maximumFixedStepDurationMs = 0;
  private contactCount = 0;
  private tyreChangeCount = 0;
  private collisionWorld: RaceCollisionWorld | undefined;
  private raceFlag: RaceFlag = "green";
  private readonly tyrePlan: RaceTyrePlan;

  constructor(
    definitions: readonly RaceParticipantDefinition[] = createRaceGrid(),
    track: TestTrackDefinition = TEST_TRACK_DATA,
    totalLaps = 1,
    maxSteps = DEFAULT_RACE_MAX_STEPS,
    tyrePlan: RaceTyrePlan = DEFAULT_RACE_TYRE_PLAN,
  ) {
    // 빈 그리드는 순위를 계산할 수 없으므로 방어적으로 두 대 이상의 참가자만 허용한다.
    if (definitions.length < 2) throw new Error("RaceSession requires at least two participants");
    this.track = track;
    this.distanceMap = createTrackDistanceMap(track);
    this.trackLengthM = this.distanceMap.totalLengthM;
    this.totalLaps = Math.max(1, Math.floor(totalLaps));
    this.maxSteps = Math.max(1, Math.floor(maxSteps));
    this.tyrePlan = {
      ...tyrePlan,
      startCompound: tyrePlan.startCompound,
    };
    this.participants = definitions.map((definition) => {
      const simulation = new VehicleSimulation(undefined, track, definition.startPose, this.tyrePlan.startCompound);
      const projectedDistanceM = projectDistanceM(simulation.current.position, track, this.distanceMap);
      return {
        definition: { ...definition, startPose: { ...definition.startPose, position: { ...definition.startPose.position } } },
        simulation,
        ai: definition.kind === "ai" ? new SingleOpponentAI(track, definition.aiConfig) : undefined,
        trackLimits: new TrackLimitsMonitor(track),
        previousProjectedDistanceM: projectedDistanceM,
        progressM: 0,
        finished: false,
        retired: false,
        tyreChangeApplied: false,
        racecraft: new RacecraftStateMachine(),
        operations: new RaceOperations(),
        pitLane: new PitLaneMonitor(track),
        noProgressSeconds: 0,
      };
    });
  }

  /** M4A 공유 Rapier 충돌 세계를 연결하거나 테스트용으로 해제한다. */
  setCollisionWorld(collisionWorld: RaceCollisionWorld | undefined): void {
    this.collisionWorld = collisionWorld;
  }

  /** M4C 레드 플래그를 발생시켜 fixed-step 주행을 안전하게 일시정지한다. */
  triggerRedFlag(): void {
    if (this.status !== "running" && this.status !== "paused") return;
    this.regulations.triggerRedFlag();
    this.raceFlag = "red";
    this.status = "paused";
  }

  /** M4C 레드 플래그 중단 이후 동일한 물리 상태에서 레이스를 재개한다. */
  restartFromRedFlag(): void {
    if (this.status !== "paused" || this.raceFlag !== "red") return;
    this.regulations.restartFromRedFlag();
    this.raceFlag = "green";
    this.status = "running";
  }

  /** 레이스 시작 전 그리드 상태에서 주행을 시작한다. */
  start(): void {
    if (this.status === "finished") this.reset();
    this.status = "running";
  }

  /** 현재 물리 상태를 보존한 채 주행을 일시정지한다. */
  pause(): void {
    if (this.status === "running") this.status = "paused";
  }

  /** 일시정지한 세션을 같은 fixed-step 상태에서 재개한다. */
  resume(): void {
    if (this.status === "paused") this.status = "running";
  }

  /** 모든 차량·순위·시간을 원래 그리드로 복원한다. */
  reset(): void {
    this.participants.forEach((participant) => {
      participant.simulation.reset();
      participant.ai?.reset();
      participant.trackLimits.reset();
      participant.previousProjectedDistanceM = projectDistanceM(participant.simulation.current.position, this.track, this.distanceMap);
      participant.progressM = 0;
      participant.finished = false;
      participant.retired = false;
      participant.finishTimeSeconds = undefined;
      participant.tyreChangeApplied = false;
      participant.racecraft.reset();
      participant.operations.reset();
      participant.pitLane.reset();
      participant.noProgressSeconds = 0;
    });
    this.status = "grid";
    this.stepIndex = 0;
    this.elapsedSeconds = 0;
    this.fixedStepDurationMs = 0;
    this.maximumFixedStepDurationMs = 0;
    this.contactCount = 0;
    this.tyreChangeCount = 0;
    this.regulations.reset();
    this.collisionWorld?.reset();
    this.raceFlag = "green";
    this.resetCount += 1;
  }

  /** 한 번의 120Hz fixed step에 플레이어 입력과 AI 입력을 모두 처리한다. */
  step(playerInput: VehicleControlInput = neutralVehicleControlInput()): RaceSessionSnapshot {
    if (this.status !== "running") return this.getSnapshot();
    const startTimeMs = typeof performance !== "undefined" ? performance.now() : 0;
    const dtSeconds = 1 / 120;
    this.raceFlag = this.regulations.tick(dtSeconds).raceControl;
    // 같은 fixed step에서 모든 AI가 동일한 이전 상태를 읽도록 의도를 먼저 계산한다.
    this.updateRacecraftStates();
    this.participants.forEach((participant) => {
      if (participant.finished || participant.retired) return;
      const operationSnapshot = participant.operations.tick(dtSeconds);
      if (participant.pitLane.getSnapshot().status === "servicing" && operationSnapshot.status === "completed") {
        participant.pitLane.markServiceCompleted();
      }
      if (participant.operations.isServicing()) {
        participant.pitLane.update(
          participant.simulation.current.position,
          participant.simulation.current.velocity,
          participant.simulation.current.yawRad,
          true,
        );
        return;
      }
      const progressBeforeStepM = participant.progressM;
      const pitLaneSnapshot = participant.pitLane.getSnapshot();
      const input = pitLaneSnapshot.requested
        ? participant.pitLane.createControlInput(
          participant.simulation.current.position,
          participant.simulation.current.velocity,
          participant.simulation.current.yawRad,
        )
        : participant.definition.kind === "player"
        ? playerInput
        : participant.ai?.update(
          { ...participant.simulation.current, maxGear: participant.simulation.config.gearRatios.length },
          dtSeconds,
          participant.racecraft.getSnapshot(),
        )
          ?? neutralVehicleControlInput();
      participant.simulation.step(input, dtSeconds);
      participant.trackLimits.update(participant.simulation.current.position, dtSeconds);
      this.updateProgress(participant);
      const current = participant.simulation.current;
      const pitUpdate = participant.pitLane.update(
        current.position,
        current.velocity,
        current.yawRad,
        participant.operations.isServicing(),
      );
      if (pitUpdate.speedViolationStarted) {
        this.regulations.recordPitSpeedViolation();
      }
      if (
        pitUpdate.enteredBox
        && !participant.tyreChangeApplied
        && this.tyrePlan.pitStopCompound !== undefined
        && participant.operations.beginPitStop()
      ) {
        participant.simulation.changeTyre(this.tyrePlan.pitStopCompound);
        participant.simulation.setDamagePerformanceMultiplier(
          participant.operations.getSnapshot().damage.performanceMultiplier,
        );
        participant.tyreChangeApplied = true;
        participant.pitLane.markServicing(current.position, current.speedMps);
        this.tyreChangeCount += 1;
      }
      const currentLocation = sampleTestTrackLocation(current.position, this.track);
      const progressDeltaM = Math.abs(participant.progressM - progressBeforeStepM);
      // 물리 발산이나 AI 정지로 진행이 영원히 멈추지 않도록 결과 수렴용 퇴역 경계를 둔다.
      if (!currentLocation.onTrack || (progressDeltaM < 0.01 && current.speedMps < 1)) {
        participant.noProgressSeconds += dtSeconds;
      } else {
        participant.noProgressSeconds = 0;
      }
      if (!Number.isFinite(current.position.x) || !Number.isFinite(current.position.z) || !Number.isFinite(current.speedMps)) {
        participant.retired = true;
      } else if (participant.noProgressSeconds >= STALLED_RETIREMENT_SECONDS) {
        participant.retired = true;
      }
    });

    // M4A Rapier 차체 형상 충돌을 우선 사용하고, WASM이 없는 순수 테스트에서는 M3A 원형 응답을 유지한다.
    if (this.collisionWorld) {
      const collisionResult = this.collisionWorld.step(
        dtSeconds,
        this.participants
          .filter((participant) => !participant.finished && !participant.retired)
          .map((participant): RaceCollisionBodyInput => ({
            id: participant.definition.id,
            position: participant.simulation.current.position,
            velocity: participant.simulation.current.velocity,
            yawRad: participant.simulation.current.yawRad,
            yawRateRadS: participant.simulation.current.yawRateRadS,
            massKg: participant.simulation.config.massKg,
          })),
      );
      this.applyCollisionWorldResult(collisionResult);
    } else {
      const contactResult = resolveVehicleContacts(
        this.participants
          .filter((participant) => !participant.finished && !participant.retired)
          .map((participant) => ({
            id: participant.definition.id,
            position: participant.simulation.current.position,
            velocity: participant.simulation.current.velocity,
            massKg: participant.simulation.config.massKg,
            radiusM: RACE_CONTACT_RADIUS_M,
          })),
      );
      if (contactResult.contacts.length > 0) {
        const contactedIds = new Set(contactResult.contacts.flatMap((contact) => [contact.firstId, contact.secondId]));
        contactResult.responses.forEach((response) => {
          if (!contactedIds.has(response.id)) return;
          this.participants.find((participant) => participant.definition.id === response.id)
            ?.simulation.applyContactResolution(response);
        });
        this.applyCollisionContacts(contactResult.contacts);
      }
    }

    this.stepIndex += 1;
    this.elapsedSeconds += dtSeconds;
    if (startTimeMs > 0) {
      this.fixedStepDurationMs = Math.max(0, performance.now() - startTimeMs);
      this.maximumFixedStepDurationMs = Math.max(this.maximumFixedStepDurationMs, this.fixedStepDurationMs);
    }
    if (this.stepIndex >= this.maxSteps || this.participants.every((participant) => participant.finished || participant.retired)) {
      this.status = "finished";
      this.raceFlag = "checkered";
      this.regulations.showCheckered();
    }
    return this.getSnapshot();
  }

  /** 한 렌더 프레임에서 실행할 fixed-step 수를 제한해 브라우저 프레임을 보호한다. */
  advance(maxSteps = 2, playerInput: VehicleControlInput = neutralVehicleControlInput()): RaceSessionSnapshot {
    const safeSteps = Math.max(1, Math.min(12, Math.floor(maxSteps)));
    let snapshot = this.getSnapshot();
    for (let index = 0; index < safeSteps && this.status === "running"; index += 1) {
      snapshot = this.step(playerInput);
    }
    return snapshot;
  }

  /** Rapier가 반환한 충돌 후 포즈를 차량 상태에 복사한 뒤 접촉 운영을 갱신한다. */
  private applyCollisionWorldResult(result: RaceCollisionStepResult): void {
    result.bodies.forEach((body) => {
      const participant = this.participants.find((candidate) => candidate.definition.id === body.id);
      if (!participant) return;
      participant.simulation.synchronizeFromExternalPose({
        position: body.position,
        velocity: body.velocity,
        yawRad: body.yawRad,
        yawRateRadS: body.yawRateRadS,
      }, 1 / 120);
    });
    this.applyCollisionContacts(result.contacts);
  }

  /** 충돌 구현체와 무관하게 손상·세이프티카·결정성 카운트를 동일하게 갱신한다. */
  private applyCollisionContacts(
    contacts: readonly { firstId: string; secondId: string; impactSpeedMps: number; penetrationM: number }[],
  ): void {
    if (contacts.length === 0) return;
    contacts.forEach((contact) => {
      [contact.firstId, contact.secondId].forEach((participantId) => {
        const participant = this.participants.find((candidate) => candidate.definition.id === participantId);
        if (!participant) return;
        const damage = participant.operations.recordContact(contact.impactSpeedMps, contact.penetrationM);
        participant.simulation.setDamagePerformanceMultiplier(damage.performanceMultiplier);
        if (damage.retired) participant.retired = true;
      });
    });
    this.contactCount += contacts.length;
    const maximumImpactSpeedMps = Math.max(...contacts.map((contact) => contact.impactSpeedMps));
    this.raceFlag = this.regulations.recordContact(maximumImpactSpeedMps).raceControl;
  }

  /** 차량별 렌더 포즈를 내부 물리 객체와 분리해 반환한다. */
  getRenderSnapshots(alpha = 1): readonly RaceVehicleRenderSnapshot[] {
    return this.participants.map((participant) => ({
      id: participant.definition.id,
      label: participant.definition.label,
      kind: participant.definition.kind,
      snapshot: participant.simulation.getRenderSnapshot(alpha),
    }));
  }

  /**
   * 추적 카메라가 매 렌더 프레임 전체 그리드를 복사하지 않도록 플레이어 pose만 반환한다.
   * 반환값은 렌더 전용 스냅샷이며 RaceSession의 물리 상태를 변경하지 않는다.
   */
  getPlayerRenderSnapshot(alpha = 1): RaceVehicleRenderSnapshot | undefined {
    const player = this.participants.find((participant) => participant.definition.kind === "player");
    if (!player) return undefined;
    return {
      id: player.definition.id,
      label: player.definition.label,
      kind: player.definition.kind,
      snapshot: player.simulation.getRenderSnapshot(alpha),
    };
  }

  /** UI와 테스트에 전달할 읽기 전용 세션 상태를 생성한다. */
  getSnapshot(): RaceSessionSnapshot {
    const standings = this.participants
      .map((participant) => this.toParticipantSnapshot(participant))
      .sort((first, second) => {
        if (first.finished !== second.finished) return first.finished ? -1 : 1;
        if (first.retired !== second.retired) return first.retired ? 1 : -1;
        if (first.finished && second.finished) return (first.finishTimeSeconds ?? Infinity) - (second.finishTimeSeconds ?? Infinity);
        if (first.raceDistanceM !== second.raceDistanceM) return second.raceDistanceM - first.raceDistanceM;
        return first.gridSlot - second.gridSlot;
      })
      .map((participant, index) => ({ ...participant, position: index + 1 }));

    return {
      status: this.status,
      trackName: this.track.name,
      stepIndex: this.stepIndex,
      elapsedSeconds: this.elapsedSeconds,
      totalLaps: this.totalLaps,
      participantCount: standings.length,
      finishedCount: standings.filter((participant) => participant.finished).length,
      resetCount: this.resetCount,
      fixedStepDurationMs: this.fixedStepDurationMs,
      maximumFixedStepDurationMs: this.maximumFixedStepDurationMs,
      contactCount: this.contactCount,
      tyreChangeCount: this.tyreChangeCount,
      pitLaneViolationCount: standings.reduce((sum, participant) => sum + participant.pitLane.speedViolationCount, 0),
      flag: this.raceFlag,
      regulations: this.regulations.getSnapshot(),
      standings,
    };
  }

  /** 각 AI가 가장 가까운 활성 상대와의 상대 진행·속도를 읽도록 racecraft를 갱신한다. */
  private updateRacecraftStates(): void {
    const activeParticipants = this.participants.filter(
      (participant) => !participant.finished && !participant.retired && !participant.operations.isServicing(),
    );
    activeParticipants.forEach((participant) => {
      const opponent = activeParticipants
        .filter((candidate) => candidate.definition.id !== participant.definition.id)
        .sort((first, second) => (
          distanceM(participant.simulation.current.position, first.simulation.current.position)
          - distanceM(participant.simulation.current.position, second.simulation.current.position)
        ))[0];
      if (!opponent) {
        participant.racecraft.reset();
        return;
      }
      participant.racecraft.update({
        self: {
          progressM: participant.progressM,
          speedMps: participant.simulation.current.speedMps,
          position: participant.simulation.current.position,
        },
        opponent: {
          progressM: opponent.progressM,
          speedMps: opponent.simulation.current.speedMps,
          position: opponent.simulation.current.position,
        },
        trackLengthM: this.trackLengthM,
        yellowFlag: this.raceFlag === "yellow",
      });
    });
  }

  /** 완주·퇴역·황색기·랩 다운 우선순위로 참가자별 플래그를 계산한다. */
  private getParticipantFlag(participant: RaceParticipantState): RaceFlag {
    if (participant.retired) return "red";
    if (participant.finished) return "checkered";
    if (this.raceFlag === "yellow" || this.raceFlag === "safety-car") return this.raceFlag;
    const leaderProgressM = this.participants.reduce(
      (maximum, candidate) => Math.max(maximum, candidate.progressM),
      participant.progressM,
    );
    return leaderProgressM - participant.progressM >= this.trackLengthM ? "blue" : "green";
  }

  /** 한 차량의 현재 투영 위치를 누적 진행 거리와 완료 상태로 변환한다. */
  private updateProgress(participant: RaceParticipantState): void {
    const previousLapIndex = Math.floor(Math.max(0, participant.progressM) / Math.max(1, this.trackLengthM));
    const projectedDistanceM = projectDistanceM(participant.simulation.current.position, this.track, this.distanceMap);
    participant.progressM += signedTrackDeltaM(
      participant.previousProjectedDistanceM,
      projectedDistanceM,
      this.trackLengthM,
    );
    participant.previousProjectedDistanceM = projectedDistanceM;
    const currentLapIndex = Math.floor(Math.max(0, participant.progressM) / Math.max(1, this.trackLengthM));
    if (currentLapIndex > previousLapIndex && currentLapIndex < this.totalLaps) {
      // 랩이 넘어갈 때 이전 랩의 유효성은 보존하고, 다음 랩의 규칙 상태를 새로 시작한다.
      participant.trackLimits.startLap();
    }
    if (
      !participant.tyreChangeApplied
      && this.tyrePlan.pitStopLap !== undefined
      && this.tyrePlan.pitStopCompound !== undefined
      && currentLapIndex >= Math.max(0, this.tyrePlan.pitStopLap - 1)
      && this.tyrePlan.pitStopCompound !== participant.simulation.getTyreCondition().compound
    ) {
      // 전략 랩은 1부터 세며, M4B에서는 랩 경계에서 서비스하지 않고 실제 피트 차선 진입을 예약한다.
      if (this.track.pitLane) participant.pitLane.request();
      else if (participant.operations.beginPitStop()) {
        // 피트 레인이 없는 오래된 테스트 정의는 기존 추상 서비스 경계를 유지한다.
        participant.simulation.changeTyre(this.tyrePlan.pitStopCompound);
        participant.simulation.setDamagePerformanceMultiplier(
          participant.operations.getSnapshot().damage.performanceMultiplier,
        );
        participant.tyreChangeApplied = true;
        this.tyreChangeCount += 1;
      }
    }
    if (participant.progressM >= this.trackLengthM * this.totalLaps) {
      participant.finished = true;
      participant.finishTimeSeconds ??= this.elapsedSeconds + 1 / 120;
    }
  }

  /** 내부 참가자 상태를 위치·거리·랩 기준의 외부 스냅샷으로 투영한다. */
  private toParticipantSnapshot(participant: RaceParticipantState): RaceParticipantSnapshot {
    const progressM = Math.max(0, participant.progressM);
    const trackLimits = participant.trackLimits.getSnapshot();
    const flag = this.getParticipantFlag(participant);
    return {
      id: participant.definition.id,
      label: participant.definition.label,
      kind: participant.definition.kind,
      gridSlot: participant.definition.gridSlot,
      position: 0,
      positionM: { ...participant.simulation.current.position },
      speedMps: participant.simulation.current.speedMps,
      lapIndex: Math.min(this.totalLaps, Math.floor(progressM / Math.max(1, this.trackLengthM))),
      progressM,
      raceDistanceM: progressM,
      finished: participant.finished,
      retired: participant.retired,
      tyreCondition: participant.simulation.getTyreCondition(),
      racecraft: participant.racecraft.getSnapshot(),
      operations: participant.operations.getSnapshot(flag),
      pitLane: participant.pitLane.getSnapshot(),
      trackLimits,
      regulationPenaltySeconds: participant.pitLane.getSnapshot().speedViolationCount * PIT_SPEED_PENALTY_SECONDS,
      // 트랙 리밋 패널티는 완주 시각에 더해 최종 분류 순서에도 반영한다.
      finishTimeSeconds: participant.finishTimeSeconds === undefined
        ? undefined
        : participant.finishTimeSeconds
          + trackLimits.penaltySeconds
          + participant.pitLane.getSnapshot().speedViolationCount * PIT_SPEED_PENALTY_SECONDS,
    };
  }
}
