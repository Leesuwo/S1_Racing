/**
 * M2B 다차량 레이스 세션의 순수 fixed-step 실행기다.
 * 차량 위치·속도는 각 VehicleSimulation이 소유하고, 이 모듈은 AI 입력·랩 진행·순위만 조정한다.
 * 충돌·추월·방어는 M2B 범위에서 제외해 차량 수 증가와 순위 결정성을 먼저 검증한다.
 */
import type { VehicleControlInput } from "../../game/input/VehicleControlInput";
import { neutralVehicleControlInput } from "../../game/input/VehicleControlInput";
import { SingleOpponentAI, type SingleOpponentAIConfig } from "../ai/SingleOpponentAI";
import { VehicleSimulation, type VehicleRenderSnapshot } from "../../game/physics/VehicleSimulation";
import { TEST_TRACK_DATA, type TestTrackDefinition, type TestTrackStartPose, type TrackPoint } from "../../tracks/TestTrack";

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
      this.updateProgress(participant);
      const current = participant.simulation.current;
      if (!Number.isFinite(current.position.x) || !Number.isFinite(current.position.z) || !Number.isFinite(current.speedMps)) {
        participant.retired = true;
      }
    });

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
      standings,
    };
  }

  /** 한 차량의 현재 투영 위치를 누적 진행 거리와 완료 상태로 변환한다. */
  private updateProgress(participant: RaceParticipantState): void {
    const projectedDistanceM = projectDistanceM(participant.simulation.current.position, this.track, this.distanceMap);
    participant.progressM += signedTrackDeltaM(
      participant.previousProjectedDistanceM,
      projectedDistanceM,
      this.trackLengthM,
    );
    participant.previousProjectedDistanceM = projectedDistanceM;
    if (participant.progressM >= this.trackLengthM * this.totalLaps) {
      participant.finished = true;
      participant.finishTimeSeconds ??= this.elapsedSeconds + 1 / 120;
    }
  }

  /** 내부 참가자 상태를 위치·거리·랩 기준의 외부 스냅샷으로 투영한다. */
  private toParticipantSnapshot(participant: RaceParticipantState): RaceParticipantSnapshot {
    const progressM = Math.max(0, participant.progressM);
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
      finishTimeSeconds: participant.finishTimeSeconds,
    };
  }
}
