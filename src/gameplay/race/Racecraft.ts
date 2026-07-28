/**
 * M3C 추월·방어·충돌 회피의 순수 상태 머신이다.
 * 차량 위치를 직접 변경하지 않고 AI가 사용할 조향·가감속 편향만 반환한다.
 */
import type { TrackPoint } from "../../tracks/TestTrack";

/** 레이스 상황에 따라 선택하는 주행 의도다. */
export type RacecraftMode = "follow" | "attack" | "defend" | "avoid";

/** 상태 머신이 읽는 차량의 진행·속도·위치 상태다. */
export interface RacecraftParticipantState {
  progressM: number;
  speedMps: number;
  position: TrackPoint;
}

/** 추월·방어 판단에 필요한 한 fixed-step 입력이다. */
export interface RacecraftInput {
  self: RacecraftParticipantState;
  opponent: RacecraftParticipantState;
  trackLengthM: number;
  yellowFlag: boolean;
}

/** AI 제어기가 물리 위치를 조작하지 않고 읽는 레이스 의도 스냅샷이다. */
export interface RacecraftSnapshot {
  mode: RacecraftMode;
  steeringBias: number;
  throttleScale: number;
  brakeScale: number;
  overtakeMode: boolean;
  reason: string;
}

/** 두 차량 사이의 평면 거리(m)를 계산한다. */
function distanceM(first: TrackPoint, second: TrackPoint): number {
  return Math.hypot(second.x - first.x, second.z - first.z);
}

/** 진행 거리 차이를 폐곡선의 전방 거리(m)로 변환한다. */
function distanceAheadM(selfM: number, opponentM: number, trackLengthM: number): number {
  if (trackLengthM <= 0) return Number.POSITIVE_INFINITY;
  return (opponentM - selfM + trackLengthM) % trackLengthM;
}

/** 추월·방어·회피 편향을 결정하는 결정적 상태 머신이다. */
export class RacecraftStateMachine {
  private snapshot: RacecraftSnapshot = {
    mode: "follow",
    steeringBias: 0,
    throttleScale: 1,
    brakeScale: 1,
    overtakeMode: false,
    reason: "레이싱 라인 추종",
  };

  /** 리셋 후 기본 추종 상태로 복원한다. */
  reset(): void {
    this.snapshot = {
      mode: "follow",
      steeringBias: 0,
      throttleScale: 1,
      brakeScale: 1,
      overtakeMode: false,
      reason: "레이싱 라인 추종",
    };
  }

  /** 현재 상대 위치와 closing speed를 읽어 다음 레이스 의도를 반환한다. */
  update(input: RacecraftInput): RacecraftSnapshot {
    const gapAheadM = distanceAheadM(input.self.progressM, input.opponent.progressM, input.trackLengthM);
    const opponentDistanceM = distanceM(input.self.position, input.opponent.position);
    const closingSpeedMps = input.self.speedMps - input.opponent.speedMps;
    const opponentSide = Math.sign(input.opponent.position.x - input.self.position.x) || 1;

    if (input.yellowFlag || (opponentDistanceM < 5 && closingSpeedMps > -1)) {
      this.snapshot = {
        mode: "avoid",
        steeringBias: -opponentSide * 0.2,
        throttleScale: 0.55,
        brakeScale: 1.25,
        overtakeMode: false,
        reason: input.yellowFlag ? "황색기·접촉 위험 회피" : "차량 간격 확보",
      };
    } else if (gapAheadM < 24 && closingSpeedMps > -1) {
      this.snapshot = {
        mode: "attack",
        steeringBias: opponentSide * 0.1,
        throttleScale: 1.05,
        brakeScale: 0.92,
        overtakeMode: true,
        reason: "전방 차량 추월 시도",
      };
    } else {
      const gapBehindM = distanceAheadM(input.opponent.progressM, input.self.progressM, input.trackLengthM);
      this.snapshot = gapBehindM < 12
        ? {
            mode: "defend",
            steeringBias: opponentSide * 0.08,
            throttleScale: 1,
            brakeScale: 1,
            overtakeMode: false,
            reason: "후방 차량 방어",
          }
        : {
            mode: "follow",
            steeringBias: 0,
            throttleScale: 1,
            brakeScale: 1,
            overtakeMode: false,
            reason: "레이싱 라인 추종",
          };
    }
    return this.getSnapshot();
  }

  /** 외부 계층에 mutable 상태를 노출하지 않는 복사본이다. */
  getSnapshot(): RacecraftSnapshot {
    return { ...this.snapshot };
  }
}
