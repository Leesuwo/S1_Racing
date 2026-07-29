/**
 * M4C S1 Racing 레이스 규정의 순수 fixed-step 상태기계다.
 * 실제 FIA 문서의 완전한 법규를 복제하지 않고, 현재 프로토타입이 검증할 수 있는
 * 황색기·세이프티카·청색기·레드 플래그·시간 패널티 경계를 명시한다.
 */

/** 레이스 컨트롤이 전역으로 표시하는 플래그 상태다. */
export type RaceControlState = "green" | "yellow" | "safety-car" | "red" | "checkered";

/** 규정 엔진이 UI·결정성 QA에 제공하는 전체 상태다. */
export interface RaceRegulationSnapshot {
  raceControl: RaceControlState;
  remainingControlSeconds: number;
  contactCount: number;
  safetyCarCount: number;
  redFlagCount: number;
  timePenaltyCount: number;
  totalTimePenaltySeconds: number;
}

/** 규정 엔진의 initial_assumption 시간 경계다. 단위는 s다. */
export const YELLOW_FLAG_DURATION_SECONDS = 2;
export const SAFETY_CAR_DURATION_SECONDS = 5;
export const SAFETY_CAR_IMPACT_THRESHOLD_MPS = 8;
export const PIT_SPEED_PENALTY_SECONDS = 5;

/** 플래그·패널티·재시작 상태를 fixed-step으로 관리한다. */
export class RaceRegulations {
  private snapshot: RaceRegulationSnapshot = createInitialSnapshot();

  /** 초기 그리드 상태로 되돌린다. */
  reset(): void {
    this.snapshot = createInitialSnapshot();
  }

  /** 접촉 강도에 따라 황색기 또는 세이프티카를 발생시킨다. */
  recordContact(impactSpeedMps: number): RaceRegulationSnapshot {
    const impact = Number.isFinite(impactSpeedMps) ? Math.max(0, impactSpeedMps) : 0;
    const safetyCar = impact >= SAFETY_CAR_IMPACT_THRESHOLD_MPS;
    this.snapshot = {
      ...this.snapshot,
      raceControl: safetyCar ? "safety-car" : "yellow",
      remainingControlSeconds: safetyCar ? SAFETY_CAR_DURATION_SECONDS : YELLOW_FLAG_DURATION_SECONDS,
      contactCount: this.snapshot.contactCount + 1,
      safetyCarCount: this.snapshot.safetyCarCount + (safetyCar ? 1 : 0),
    };
    return this.getSnapshot();
  }

  /** 피트 레인 제한 속도 위반에 대한 고정 시간 패널티를 누적한다. */
  recordPitSpeedViolation(): RaceRegulationSnapshot {
    this.snapshot = {
      ...this.snapshot,
      timePenaltyCount: this.snapshot.timePenaltyCount + 1,
      totalTimePenaltySeconds: this.snapshot.totalTimePenaltySeconds + PIT_SPEED_PENALTY_SECONDS,
    };
    return this.getSnapshot();
  }

  /** 한 fixed step 동안 황색기·세이프티카 잔여 시간을 소진한다. */
  tick(dtSeconds: number): RaceRegulationSnapshot {
    if (this.snapshot.raceControl !== "yellow" && this.snapshot.raceControl !== "safety-car") return this.getSnapshot();
    const safeDtSeconds = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 1 / 120;
    const remainingControlSeconds = Math.max(0, this.snapshot.remainingControlSeconds - safeDtSeconds);
    this.snapshot = remainingControlSeconds <= 0
      ? { ...this.snapshot, raceControl: "green", remainingControlSeconds: 0 }
      : { ...this.snapshot, remainingControlSeconds };
    return this.getSnapshot();
  }

  /** 레드 플래그를 발생시켜 RaceSession이 주행을 일시정지하게 한다. */
  triggerRedFlag(): RaceRegulationSnapshot {
    this.snapshot = {
      ...this.snapshot,
      raceControl: "red",
      remainingControlSeconds: 0,
      redFlagCount: this.snapshot.redFlagCount + 1,
    };
    return this.getSnapshot();
  }

  /** 레드 플래그 중단 이후 그린 상태로 재시작한다. */
  restartFromRedFlag(): RaceRegulationSnapshot {
    if (this.snapshot.raceControl === "red") {
      this.snapshot = { ...this.snapshot, raceControl: "green", remainingControlSeconds: 0 };
    }
    return this.getSnapshot();
  }

  /** 완주 시 레이스 컨트롤을 체커드로 고정한다. */
  showCheckered(): RaceRegulationSnapshot {
    this.snapshot = { ...this.snapshot, raceControl: "checkered", remainingControlSeconds: 0 };
    return this.getSnapshot();
  }

  /** mutable 규정 상태의 복사본을 반환한다. */
  getSnapshot(): RaceRegulationSnapshot {
    return { ...this.snapshot };
  }
}

/** 규정 엔진의 모든 누적값이 0인 초기 상태다. */
function createInitialSnapshot(): RaceRegulationSnapshot {
  return {
    raceControl: "green",
    remainingControlSeconds: 0,
    contactCount: 0,
    safetyCarCount: 0,
    redFlagCount: 0,
    timePenaltyCount: 0,
    totalTimePenaltySeconds: 0,
  };
}
