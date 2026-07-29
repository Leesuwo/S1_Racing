/**
 * M4A 다차량 충돌 세계의 공통 계약이다.
 * 레이스 세션은 차량의 입력·엔진 상태를 계속 소유하고, 구현체는 차체 형상과
 * 충돌 후 평면 포즈만 반환한다. 렌더러와 AI는 이 경계를 호출하지 않는다.
 */
import type { TrackPoint } from "../../tracks/TestTrack";

/** 공유 충돌 세계에 한 fixed step 동안 전달할 차체 상태다. 단위는 m, m/s, rad다. */
export interface RaceCollisionBodyInput {
  id: string;
  position: TrackPoint;
  velocity: TrackPoint;
  yawRad: number;
  yawRateRadS: number;
  massKg: number;
}

/** 충돌 세계가 물리 step 후 반환하는 차체 포즈다. */
export interface RaceCollisionBodyOutput {
  id: string;
  position: TrackPoint;
  velocity: TrackPoint;
  yawRad: number;
  yawRateRadS: number;
}

/** 실제 접촉 쌍을 레이스 운영·손상·플래그 계층에 전달하는 이벤트다. */
export interface RaceCollisionEvent {
  firstId: string;
  secondId: string;
  impactSpeedMps: number;
  penetrationM: number;
}

/** 한 fixed step의 차체 포즈와 접촉 이벤트 결과다. */
export interface RaceCollisionStepResult {
  bodies: readonly RaceCollisionBodyOutput[];
  contacts: readonly RaceCollisionEvent[];
}

/** RaceSession이 Rapier 또는 결정적 테스트 대체 구현을 주입하는 경계다. */
export interface RaceCollisionWorld {
  step(dtSeconds: number, bodies: readonly RaceCollisionBodyInput[]): RaceCollisionStepResult;
  reset(): void;
  dispose(): void;
}
