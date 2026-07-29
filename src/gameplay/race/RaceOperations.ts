/**
 * M3D 레이스 운영 상태를 계산하는 순수 fixed-step 모듈이다.
 * 접촉 손상, 피트 서비스 시간, 차량별 플래그를 물리 위치와 분리해 RaceSession에 제공한다.
 * 손상량과 피트 시간은 실차 규정값이 아닌 initial_assumption이며 후속 시뮬레이션으로 조정한다.
 */

/** 레이스 운영 계층에서 사용할 최소 플래그 상태다. */
export type RaceFlag = "green" | "yellow" | "safety-car" | "blue" | "red" | "checkered";

/** 접촉 누적 손상과 물리 성능 저하를 표시하는 읽기 전용 상태다. 비율은 0..1이다. */
export interface DamageSnapshot {
  bodyRatio: number;
  aeroRatio: number;
  suspensionRatio: number;
  totalRatio: number;
  performanceMultiplier: number;
  retired: boolean;
}

/** 피트 레인 서비스의 진행 상태다. 시간 단위는 s다. */
export interface PitStopSnapshot {
  status: "none" | "servicing" | "completed";
  remainingSeconds: number;
  stopCount: number;
}

/** 한 참가자의 손상·피트·플래그 운영 스냅샷이다. */
export interface RaceOperationsSnapshot {
  flag: RaceFlag;
  damage: DamageSnapshot;
  pitStop: PitStopSnapshot;
}

/** 손상과 피트 상태의 기본 initial_assumption 값이다. */
export const DEFAULT_PIT_STOP_DURATION_SECONDS = 2.5;
export const DAMAGE_RETIREMENT_THRESHOLD = 0.95;

/** 레이스 운영 상태를 고정된 입력으로 갱신한다. */
export class RaceOperations {
  private damage: DamageSnapshot = createInitialDamage();
  private pitStop: PitStopSnapshot = createInitialPitStop();

  /** 손상·피트 상태를 그리드 초기값으로 복원한다. */
  reset(): void {
    this.damage = createInitialDamage();
    this.pitStop = createInitialPitStop();
  }

  /** 접촉 속도와 침투량을 이용해 차체·에어로·서스펜션 손상을 누적한다. */
  recordContact(impactSpeedMps: number, penetrationM = 0): DamageSnapshot {
    const safeImpactSpeedMps = Math.max(0, finiteOr(impactSpeedMps, 0));
    const safePenetrationM = Math.max(0, finiteOr(penetrationM, 0));
    // 충돌 속도와 겹침량을 함께 사용해 정지 상태의 겹침도 작은 손상으로 기록한다.
    const severity = clamp(safeImpactSpeedMps * 0.012 + safePenetrationM * 0.08, 0.01, 0.25);
    const bodyRatio = clamp(this.damage.bodyRatio + severity, 0, 1);
    const aeroRatio = clamp(this.damage.aeroRatio + severity * 0.72, 0, 1);
    const suspensionRatio = clamp(this.damage.suspensionRatio + severity * 0.86, 0, 1);
    const totalRatio = clamp(bodyRatio * 0.45 + aeroRatio * 0.3 + suspensionRatio * 0.25, 0, 1);
    this.damage = {
      bodyRatio,
      aeroRatio,
      suspensionRatio,
      totalRatio,
      performanceMultiplier: clamp(1 - totalRatio * 0.48, 0.35, 1),
      retired: totalRatio >= DAMAGE_RETIREMENT_THRESHOLD,
    };
    return { ...this.damage };
  }

  /** 피트 진입 시 타이어 교체가 끝날 때까지 물리 진행을 잠시 멈춘다. */
  beginPitStop(durationSeconds = DEFAULT_PIT_STOP_DURATION_SECONDS): boolean {
    if (this.damage.retired || this.pitStop.status === "servicing") return false;
    const safeDurationSeconds = Number.isFinite(durationSeconds)
      ? Math.max(0.1, durationSeconds)
      : DEFAULT_PIT_STOP_DURATION_SECONDS;
    this.pitStop = {
      status: "servicing",
      remainingSeconds: safeDurationSeconds,
      stopCount: this.pitStop.stopCount,
    };
    return true;
  }

  /** 한 fixed step의 피트 서비스 시간을 소진하고 완료 여부를 반환한다. */
  tick(dtSeconds: number): PitStopSnapshot {
    if (this.pitStop.status !== "servicing") return { ...this.pitStop };
    const safeDtSeconds = Number.isFinite(dtSeconds) && dtSeconds > 0 ? Math.min(dtSeconds, 0.1) : 1 / 120;
    const remainingSeconds = Math.max(0, this.pitStop.remainingSeconds - safeDtSeconds);
    this.pitStop = remainingSeconds <= 0
      ? {
          status: "completed",
          remainingSeconds: 0,
          stopCount: this.pitStop.stopCount + 1,
        }
      : {
          ...this.pitStop,
          remainingSeconds,
        };
    return { ...this.pitStop };
  }

  /** 차량별 플래그를 포함한 불변 스냅샷을 반환한다. */
  getSnapshot(flag: RaceFlag = "green"): RaceOperationsSnapshot {
    return {
      flag,
      damage: { ...this.damage },
      pitStop: { ...this.pitStop },
    };
  }

  /** 서비스 중인지 확인해 RaceSession이 주행 입력을 잠시 보류하게 한다. */
  isServicing(): boolean {
    return this.pitStop.status === "servicing";
  }
}

/** 운영 모듈의 초기 손상 상태를 생성한다. */
function createInitialDamage(): DamageSnapshot {
  return {
    bodyRatio: 0,
    aeroRatio: 0,
    suspensionRatio: 0,
    totalRatio: 0,
    performanceMultiplier: 1,
    retired: false,
  };
}

/** 운영 모듈의 초기 피트 상태를 생성한다. */
function createInitialPitStop(): PitStopSnapshot {
  return {
    status: "none",
    remainingSeconds: 0,
    stopCount: 0,
  };
}

/** NaN·Infinity가 운영 상태로 전파되지 않게 기본값으로 보정한다. */
function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** 운영 입력이 정해진 상태 범위를 벗어나지 않도록 제한한다. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
