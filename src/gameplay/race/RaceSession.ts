/**
 * M3A 다차량 레이스 세션의 순수 fixed-step 실행기다.
 * 차량 위치·속도는 각 VehicleSimulation이 소유하고, 이 모듈은 AI 입력·랩 진행·트랙 리밋·접촉 응답·순위를 조정한다.
 * 접촉은 초기 원형 근사로 분리하고, 정교한 차체 형상·추월·손상은 후속 마일스톤의 확장 경계로 남긴다.
 */
import type { VehicleControlInput } from "../../game/input/VehicleControlInput";
import { neutralVehicleControlInput } from "../../game/input/VehicleControlInput";
import { SingleOpponentAI, type SingleOpponentAIConfig } from "../ai/SingleOpponentAI";
import { VehicleSimulation, type VehicleRenderSnapshot } from "../../game/physics/VehicleSimulation";
import { TEST_TRACK_DATA, type TestTrackDefinition, type TestTrackStartPose, type TrackPoint } from "../../tracks/TestTrack";
import { TrackLimitsMonitor, type TrackLimitsSnapshot } from "./TrackLimits";
import { resolveVehicleContacts } from "./VehicleContact";

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
  finishTimeSeconds?: number;
}

/** M2B fixed-step 레이스 세션의 UI·QA 스냅샷이다. */
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

/** RaceSession이 비정상 입력을 무한히 실행하지 않도록 하는 기본 fixed-step 상한이다. */
export const DEFAULT_RACE_MAX_STEPS = 120 * 180;

/** M3A 원형 접촉 근사의 차량 반경(m)이다. 차체 형상은 Rapier 리그가 소유한다. */
const RACE_CONTACT_RADIUS_M = 1.25;

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
  private status: RaceSessionSnapshot["status"] = "grid";
  private stepIndex = 0;
  private elapsedSeconds = 0;
  private resetCount = 0;
  private fixedStepDurationMs = 0;
  private maximumFixedStepDurationMs = 0;
  private contactCount = 0;

  constructor(
    definitions: readonly RaceParticipantDefinition[] = createRaceGrid(),
    track: TestTrackDefinition = TEST_TRACK_DATA,
    totalLaps = 1,
    maxSteps = DEFAULT_RACE_MAX_STEPS,
  ) {
    // 빈 그리드는 순위를 계산할 수 없으므로 방어적으로 두 대 이상의 참가자만 허용한다.
    if (definitions.length < 2) throw new Error("RaceSession requires at least two participants");
    this.track = track;
    this.distanceMap = createTrackDistanceMap(track);
    this.trackLengthM = this.distanceMap.totalLengthM;
    this.totalLaps = Math.max(1, Math.floor(totalLaps));
    this.maxSteps = Math.max(1, Math.floor(maxSteps));
    this.participants = definitions.map((definition) => {
      const simulation = new VehicleSimulation(undefined, track, definition.startPose);
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
      };
    });
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
    });
    this.status = "grid";
    this.stepIndex = 0;
    this.elapsedSeconds = 0;
    this.fixedStepDurationMs = 0;
    this.maximumFixedStepDurationMs = 0;
    this.contactCount = 0;
    this.resetCount += 1;
  }

  /** 한 번의 120Hz fixed step에 플레이어 입력과 AI 입력을 모두 처리한다. */
  step(playerInput: VehicleControlInput = neutralVehicleControlInput()): RaceSessionSnapshot {
    if (this.status !== "running") return this.getSnapshot();
    const startTimeMs = typeof performance !== "undefined" ? performance.now() : 0;
    const dtSeconds = 1 / 120;
    this.participants.forEach((participant) => {
      if (participant.finished || participant.retired) return;
      const input = participant.definition.kind === "player"
        ? playerInput
        : participant.ai?.update({ ...participant.simulation.current, maxGear: participant.simulation.config.gearRatios.length }, dtSeconds)
          ?? neutralVehicleControlInput();
      participant.simulation.step(input, dtSeconds);
      participant.trackLimits.update(participant.simulation.current.position, dtSeconds);
      this.updateProgress(participant);
      const current = participant.simulation.current;
      if (!Number.isFinite(current.position.x) || !Number.isFinite(current.position.z) || !Number.isFinite(current.speedMps)) {
        participant.retired = true;
      }
    });

    // 차량 간 접촉은 AI 명령과 분리된 물리 응답으로만 적용해 위치 직접 조작 경계를 보존한다.
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
      this.contactCount += contactResult.contacts.length;
    }

    this.stepIndex += 1;
    this.elapsedSeconds += dtSeconds;
    if (startTimeMs > 0) {
      this.fixedStepDurationMs = Math.max(0, performance.now() - startTimeMs);
      this.maximumFixedStepDurationMs = Math.max(this.maximumFixedStepDurationMs, this.fixedStepDurationMs);
    }
    if (this.stepIndex >= this.maxSteps || this.participants.every((participant) => participant.finished || participant.retired)) {
      this.status = "finished";
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

  /** 차량별 렌더 포즈를 내부 물리 객체와 분리해 반환한다. */
  getRenderSnapshots(alpha = 1): readonly RaceVehicleRenderSnapshot[] {
    return this.participants.map((participant) => ({
      id: participant.definition.id,
      label: participant.definition.label,
      kind: participant.definition.kind,
      snapshot: participant.simulation.getRenderSnapshot(alpha),
    }));
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
      standings,
    };
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
    if (participant.progressM >= this.trackLengthM * this.totalLaps) {
      participant.finished = true;
      participant.finishTimeSeconds ??= this.elapsedSeconds + 1 / 120;
    }
  }

  /** 내부 참가자 상태를 위치·거리·랩 기준의 외부 스냅샷으로 투영한다. */
  private toParticipantSnapshot(participant: RaceParticipantState): RaceParticipantSnapshot {
    const progressM = Math.max(0, participant.progressM);
    const trackLimits = participant.trackLimits.getSnapshot();
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
      trackLimits,
      // 트랙 리밋 패널티는 완주 시각에 더해 최종 분류 순서에도 반영한다.
      finishTimeSeconds: participant.finishTimeSeconds === undefined
        ? undefined
        : participant.finishTimeSeconds + trackLimits.penaltySeconds,
    };
  }
}
