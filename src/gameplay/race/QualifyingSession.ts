/**
 * M2C 퀄리파잉 세션의 순수 규칙 실행기다.
 * 랩타임 기록·유효 랩·Q1/Q2/Q3 컷만 관리하고 차량 물리와 렌더링은 소유하지 않는다.
 */

/** 퀄리파잉에서 사용하는 세션 단계다. */
export type QualifyingPhase = "Q1" | "Q2" | "Q3";

/** 퀄리파잉 세션의 생명주기 상태다. */
export type QualifyingStatus = "ready" | "running" | "complete";

/** 퀄리파잉에 참가하는 차량의 고정 식별 정보다. */
export interface QualifyingParticipantDefinition {
  id: string;
  label: string;
  gridSlot: number;
}

/** 한 차량이 제출한 한 랩의 기록이다. 시간 단위는 s다. */
export interface QualifyingLapRecord {
  participantId: string;
  phase: QualifyingPhase;
  lapNumber: number;
  lapTimeSeconds: number;
  valid: boolean;
}

/** 현재 단계의 차량별 랩타임 집계다. 시간 단위는 s다. */
export interface QualifyingEntrySnapshot {
  id: string;
  label: string;
  gridSlot: number;
  bestLapTimeSeconds: number | null;
  validLapCount: number;
  invalidLapCount: number;
}

/** 완료된 Q 단계의 순위와 탈락 결과다. */
export interface QualifyingPhaseResult {
  phase: QualifyingPhase;
  entrantCount: number;
  advanceCount: number;
  eliminatedIds: readonly string[];
  standings: readonly QualifyingEntrySnapshot[];
}

/** 화면·테스트에 전달하는 퀄리파잉 세션 스냅샷이다. */
export interface QualifyingSnapshot {
  status: QualifyingStatus;
  phase: QualifyingPhase;
  rulesetVersion: string;
  activeParticipantIds: readonly string[];
  eliminatedParticipantIds: readonly string[];
  entries: readonly QualifyingEntrySnapshot[];
  phaseResults: readonly QualifyingPhaseResult[];
}

/** 컷 수와 규칙 변경 추적을 함께 고정하는 게임 전용 규칙셋이다. */
export interface QualifyingRuleset {
  version: string;
  q1Entrants: number;
  q1Advance: number;
  q2Entrants: number;
  q2Advance: number;
  q3Entrants: number;
  q3Advance: number;
}

/** M2C 초기 구현에서 사용하는 20→15→10 컷 규칙이다. */
export const QUALIFYING_RULESET: QualifyingRuleset = {
  version: "s1-racing-qualifying-v1",
  q1Entrants: 20,
  q1Advance: 15,
  q2Entrants: 15,
  q2Advance: 10,
  q3Entrants: 10,
  q3Advance: 10,
};

interface QualifyingEntryState extends QualifyingParticipantDefinition {
  bestLapTimeSeconds: number | null;
  validLapCount: number;
  invalidLapCount: number;
}

/** UI와 테스트에서 동일한 20대 퀄리파잉 그리드를 생성한다. */
export function createQualifyingGrid(count = QUALIFYING_RULESET.q1Entrants): readonly QualifyingParticipantDefinition[] {
  const safeCount = Math.max(1, Math.min(QUALIFYING_RULESET.q1Entrants, Math.floor(count)));
  return Array.from({ length: safeCount }, (_, gridSlot) => ({
    id: gridSlot === 0 ? "player" : "ai-" + String(gridSlot),
    label: gridSlot === 0 ? "PLAYER" : "AI " + String(gridSlot),
    gridSlot,
  }));
}

/** 현재 단계의 컷 수를 반환한다. */
function getPhaseAdvanceCount(phase: QualifyingPhase, ruleset: QualifyingRuleset): number {
  if (phase === "Q1") return ruleset.q1Advance;
  if (phase === "Q2") return ruleset.q2Advance;
  return ruleset.q3Advance;
}

/** 다음 퀄리파잉 단계를 반환한다. Q3 이후에는 완료 상태로 전환한다. */
function getNextPhase(phase: QualifyingPhase): QualifyingPhase | undefined {
  if (phase === "Q1") return "Q2";
  if (phase === "Q2") return "Q3";
  return undefined;
}

/** 유효 랩 우선, 빠른 시간 우선, 그리드 슬롯 우선으로 결정적인 순위를 만든다. */
function compareEntries(first: QualifyingEntryState, second: QualifyingEntryState): number {
  const firstTime = first.bestLapTimeSeconds ?? Number.POSITIVE_INFINITY;
  const secondTime = second.bestLapTimeSeconds ?? Number.POSITIVE_INFINITY;
  if (firstTime !== secondTime) return firstTime - secondTime;
  if (first.invalidLapCount !== second.invalidLapCount) return first.invalidLapCount - second.invalidLapCount;
  return first.gridSlot - second.gridSlot;
}

/** 내부 집계를 외부 스냅샷으로 복사해 소유권을 분리한다. */
function toEntrySnapshot(entry: QualifyingEntryState): QualifyingEntrySnapshot {
  return {
    id: entry.id,
    label: entry.label,
    gridSlot: entry.gridSlot,
    bestLapTimeSeconds: entry.bestLapTimeSeconds,
    validLapCount: entry.validLapCount,
    invalidLapCount: entry.invalidLapCount,
  };
}

/** Q1/Q2/Q3 랩타임과 컷을 결정적으로 관리하는 세션이다. */
export class QualifyingSession {
  /** 규칙 변경을 식별하는 버전과 컷 수다. */
  readonly ruleset: QualifyingRuleset;
  /** 참가자 정의는 세션 전체에서 변하지 않는다. */
  private readonly entries = new Map<string, QualifyingEntryState>();
  /** 현재 단계에 남아 있는 참가자 ID다. */
  private activeParticipantIds: string[];
  /** 각 단계가 끝날 때 생성한 결과를 보존한다. */
  private phaseResults: QualifyingPhaseResult[] = [];
  /** 최종 스냅샷에서 탈락 순서를 보여주기 위한 ID 목록이다. */
  private eliminatedParticipantIds: string[] = [];
  /** Q3까지 완료된 뒤에도 마지막 단계 이름을 표시하기 위해 유지한다. */
  private phase: QualifyingPhase = "Q1";
  private status: QualifyingStatus = "ready";

  constructor(
    participants: readonly QualifyingParticipantDefinition[] = createQualifyingGrid(),
    ruleset: QualifyingRuleset = QUALIFYING_RULESET,
  ) {
    if (participants.length !== ruleset.q1Entrants) {
      throw new Error("QualifyingSession requires exactly " + String(ruleset.q1Entrants) + " participants");
    }
    if (new Set(participants.map((participant) => participant.id)).size !== participants.length) {
      throw new Error("QualifyingSession participant ids must be unique");
    }
    this.ruleset = { ...ruleset };
    participants.forEach((participant) => {
      this.entries.set(participant.id, {
        ...participant,
        bestLapTimeSeconds: null,
        validLapCount: 0,
        invalidLapCount: 0,
      });
    });
    this.activeParticipantIds = participants.map((participant) => participant.id);
  }

  /** 세션을 Q1 시작 대기 상태로 되돌린다. */
  reset(): void {
    this.entries.forEach((entry) => {
      entry.bestLapTimeSeconds = null;
      entry.validLapCount = 0;
      entry.invalidLapCount = 0;
    });
    this.activeParticipantIds = [...this.entries.values()]
      .sort((first, second) => first.gridSlot - second.gridSlot)
      .map((entry) => entry.id);
    this.phaseResults = [];
    this.eliminatedParticipantIds = [];
    this.phase = "Q1";
    this.status = "ready";
  }

  /** 현재 단계의 랩 기록을 시작한다. */
  start(): void {
    if (this.status === "complete") this.reset();
    this.status = "running";
  }

  /** 현재 단계 참가자의 랩 한 개를 기록한다. 시간 단위는 s다. */
  recordLap(record: Omit<QualifyingLapRecord, "phase"> & { phase?: QualifyingPhase }): void {
    if (this.status !== "running") throw new Error("QualifyingSession is not running");
    if (record.phase !== undefined && record.phase !== this.phase) throw new Error("Lap phase does not match the current phase");
    if (!this.activeParticipantIds.includes(record.participantId)) throw new Error("Participant is not active in the current phase");
    if (!Number.isInteger(record.lapNumber) || record.lapNumber < 1) throw new Error("Lap number must be a positive integer");
    const entry = this.entries.get(record.participantId);
    if (!entry) throw new Error("Unknown qualifying participant");

    if (record.valid && Number.isFinite(record.lapTimeSeconds) && record.lapTimeSeconds > 0) {
      entry.validLapCount += 1;
      entry.bestLapTimeSeconds = entry.bestLapTimeSeconds === null
        ? record.lapTimeSeconds
        : Math.min(entry.bestLapTimeSeconds, record.lapTimeSeconds);
      return;
    }
    entry.invalidLapCount += 1;
  }

  /** 현재 단계의 기록을 순위화하고 다음 단계 참가자를 확정한다. */
  completePhase(): QualifyingPhaseResult {
    if (this.status !== "running") throw new Error("QualifyingSession is not running");
    const rankedEntries = this.activeParticipantIds
      .map((id) => this.entries.get(id))
      .filter((entry): entry is QualifyingEntryState => entry !== undefined)
      .sort(compareEntries);
    const advanceCount = getPhaseAdvanceCount(this.phase, this.ruleset);
    const standings = rankedEntries.map(toEntrySnapshot);
    const eliminatedIds = rankedEntries.slice(advanceCount).map((entry) => entry.id);
    const result: QualifyingPhaseResult = {
      phase: this.phase,
      entrantCount: rankedEntries.length,
      advanceCount,
      eliminatedIds,
      standings,
    };
    this.phaseResults.push(result);
    this.eliminatedParticipantIds.push(...eliminatedIds);
    this.activeParticipantIds = rankedEntries.slice(0, advanceCount).map((entry) => entry.id);
    const nextPhase = getNextPhase(this.phase);
    if (nextPhase === undefined) {
      this.status = "complete";
      return result;
    }
    this.activeParticipantIds.forEach((id) => {
      const entry = this.entries.get(id);
      if (entry) {
        entry.bestLapTimeSeconds = null;
        entry.validLapCount = 0;
        entry.invalidLapCount = 0;
      }
    });
    this.phase = nextPhase;
    return result;
  }

  /** 현재 단계와 완료 결과를 읽기 전용 값으로 반환한다. */
  getSnapshot(): QualifyingSnapshot {
    const activeSet = new Set(this.activeParticipantIds);
    const entries = [...this.entries.values()]
      .filter((entry) => activeSet.has(entry.id))
      .sort(compareEntries)
      .map(toEntrySnapshot);
    return {
      status: this.status,
      phase: this.phase,
      rulesetVersion: this.ruleset.version,
      activeParticipantIds: [...this.activeParticipantIds],
      eliminatedParticipantIds: [...this.eliminatedParticipantIds],
      entries,
      phaseResults: this.phaseResults.map((result) => ({
        ...result,
        eliminatedIds: [...result.eliminatedIds],
        standings: result.standings.map((entry) => ({ ...entry })),
      })),
    };
  }

  /** Q3 순위부터 Q2 탈락자, Q1 탈락자 순으로 레이스 그리드를 만든다. */
  getGridOrder(): readonly string[] {
    const order: string[] = [];
    const completedResults = [...this.phaseResults].reverse();
    completedResults.forEach((result) => {
      if (result.phase === "Q3") {
        order.push(...result.standings.map((entry) => entry.id));
        return;
      }
      order.push(...result.eliminatedIds);
    });
    this.activeParticipantIds.forEach((id) => {
      if (!order.includes(id)) order.push(id);
    });
    return order;
  }
}
