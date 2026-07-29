/**
 * M4B 피트 레인 상태·속도 제한·자동 진입 제어 모듈이다.
 * 중심선과 폭은 TestTrackDefinition에서 읽고, 이 모듈은 차량 포즈를 직접 변경하지
 * 않고 VehicleControlInput만 반환한다. 실제 위치 이동은 VehicleSimulation이 수행한다.
 */
import type { VehicleControlInput } from "../../game/input/VehicleControlInput";
import { neutralVehicleControlInput } from "../../game/input/VehicleControlInput";
import {
  samplePitLaneLocation,
  type TestTrackDefinition,
  type TestTrackPitLane,
  type TrackPoint,
} from "../../tracks/TestTrack";

/** 피트 레인 진행 상태다. */
export type PitLaneStatus = "inactive" | "approach" | "in-lane" | "box" | "servicing" | "exiting" | "completed";

/** UI·규정·QA가 공유하는 피트 레인 상태다. 속도 단위는 m/s다. */
export interface PitLaneSnapshot {
  status: PitLaneStatus;
  requested: boolean;
  withinLane: boolean;
  speedLimitMps: number;
  speedMps: number;
  speedViolationMps: number;
  laneProgressM: number;
  laneLengthM: number;
  entryCount: number;
  speedViolationCount: number;
}

/** 한 fixed step의 상태 갱신 결과에서 새 속도 위반 이벤트를 분리한다. */
export interface PitLaneUpdateResult {
  snapshot: PitLaneSnapshot;
  speedViolationStarted: boolean;
  enteredBox: boolean;
  reachedExit: boolean;
}

/** 각도 차이를 -π..π 범위로 접는다. */
function normalizeAngle(angleRad: number): number {
  let normalized = angleRad;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

/** 입력을 정해진 범위로 제한하고 비유한 값은 안전한 기본값으로 바꾼다. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

/** 평면 벡터 내적을 계산한다. */
function dot(first: TrackPoint, second: TrackPoint): number {
  return first.x * second.x + first.z * second.z;
}

/** 중심선에서 누적 거리만큼 앞선 제어 목표점을 계산한다. */
function pointAtLaneDistance(pitLane: TestTrackPitLane, distanceM: number): { point: TrackPoint; yawRad: number } {
  const centerline = pitLane.centerline;
  if (centerline.length < 2) return { point: { x: 0, z: 0 }, yawRad: 0 };
  let remainingM = Math.max(0, distanceM);
  for (let index = 0; index < centerline.length - 1; index += 1) {
    const start = centerline[index]!;
    const end = centerline[index + 1]!;
    const deltaX = end.x - start.x;
    const deltaZ = end.z - start.z;
    const lengthM = Math.hypot(deltaX, deltaZ);
    if (remainingM <= lengthM || index === centerline.length - 2) {
      const ratio = lengthM > 0 ? Math.min(1, remainingM / lengthM) : 0;
      return {
        point: { x: start.x + deltaX * ratio, z: start.z + deltaZ * ratio },
        yawRad: Math.atan2(deltaX, -deltaZ),
      };
    }
    remainingM -= lengthM;
  }
  const last = centerline[centerline.length - 1]!;
  return { point: { ...last }, yawRad: 0 };
}

/** 피트 레인 진입부터 탈출까지를 결정론적으로 추적한다. */
export class PitLaneMonitor {
  private requested = false;
  private status: PitLaneStatus = "inactive";
  private previousWithinLane = false;
  private speedViolationActive = false;
  private entryCount = 0;
  private speedViolationCount = 0;
  private lastSnapshot: PitLaneSnapshot;

  constructor(private readonly track: TestTrackDefinition) {
    this.lastSnapshot = this.createSnapshot({ x: 0, z: 0 }, 0);
  }

  /** 전략이 지정한 랩에서 피트 진입을 예약한다. */
  request(): void {
    if (!this.track.pitLane || this.requested || this.status === "completed" || this.status === "servicing") return;
    this.requested = true;
    this.status = "approach";
  }

  /** 피트 서비스가 시작됐음을 기록해 속도 제한 상태와 분리한다. */
  markServicing(position: TrackPoint, speedMps: number): void {
    this.status = "servicing";
    this.lastSnapshot = this.createSnapshot(position, speedMps);
  }

  /** 서비스 종료 후 차량이 탈출 게이트까지 차선을 따라가게 한다. */
  markServiceCompleted(): void {
    if (this.status === "servicing") this.status = "exiting";
  }

  /** 현재 피트 레인 위치와 속도 제한을 fixed-step으로 갱신한다. */
  update(position: TrackPoint, velocity: TrackPoint, yawRad: number, servicing: boolean): PitLaneUpdateResult {
    const speedMps = Math.hypot(velocity.x, velocity.z);
    const location = samplePitLaneLocation(position, this.track);
    if (!this.requested || !location || !this.track.pitLane) {
      this.lastSnapshot = this.createSnapshot(position, speedMps, location);
      return { snapshot: this.lastSnapshot, speedViolationStarted: false, enteredBox: false, reachedExit: false };
    }

    const enteredLane = location.withinLane && !this.previousWithinLane;
    if (enteredLane) this.entryCount += 1;
    if (location.withinLane && this.status === "approach") this.status = "in-lane";
    if (location.insidePitBox && !servicing && (this.status === "approach" || this.status === "in-lane")) this.status = "box";
    if (servicing) this.status = "servicing";
    const speedViolationMps = location.withinLane
      ? Math.max(0, speedMps - this.track.pitLane.speedLimitMps)
      : 0;
    const speedViolationStarted = speedViolationMps > 0.5 && !this.speedViolationActive;
    if (speedViolationStarted) this.speedViolationCount += 1;
    this.speedViolationActive = speedViolationMps > 0.1;
    const reachedExit = this.status === "exiting"
      && Math.hypot(position.x - this.track.pitLane.exitGate.x, position.z - this.track.pitLane.exitGate.z) <= 2.5;
    if (reachedExit) {
      this.status = "completed";
      this.requested = false;
    }
    this.previousWithinLane = location.withinLane;
    this.lastSnapshot = this.createSnapshot(position, speedMps, location, speedViolationMps);
    return {
      snapshot: this.lastSnapshot,
      speedViolationStarted,
      enteredBox: location.insidePitBox && this.status === "box",
      reachedExit,
    };
  }

  /** 피트 요청 중인 차량에만 적용할 진입·차선 추종·속도 제한 입력을 생성한다. */
  createControlInput(position: TrackPoint, velocity: TrackPoint, yawRad: number): VehicleControlInput {
    const pitLane = this.track.pitLane;
    if (!pitLane || !this.requested || this.status === "servicing" || this.status === "completed") {
      return neutralVehicleControlInput();
    }
    const location = samplePitLaneLocation(position, this.track);
    const boxLocation = samplePitLaneLocation(pitLane.pitBox, this.track);
    const approachingBox = this.status === "box"
      // 차선에 들어온 뒤에는 한 번 박스를 지나쳐도 끝점으로 계속 진행하지 않도록 박스를 목표로 고정한다.
      || this.status === "in-lane"
      || Boolean(location?.withinLane && boxLocation && location.laneProgressM >= boxLocation.laneProgressM - 1);
    const targetDistanceM = location
      ? Math.min(location.laneLengthM, location.laneProgressM + 4)
      : 0;
    const nearEntryGate = Math.hypot(position.x - pitLane.entryGate.x, position.z - pitLane.entryGate.z) <= 2.8;
    const approachTarget = nearEntryGate
      ? pointAtLaneDistance(pitLane, 4)
      : {
          point: pitLane.entryGate,
          yawRad: pointAtLaneDistance(pitLane, 4).yawRad,
        };
    const target = approachingBox
      ? {
          point: pitLane.pitBox,
          // 박스를 지나친 경우에도 중심선의 고정 방향을 고집하지 않고 박스로 돌아서도록 한다.
          yawRad: Math.atan2(pitLane.pitBox.x - position.x, -(pitLane.pitBox.z - position.z)),
        }
      : location?.withinLane
        ? pointAtLaneDistance(pitLane, targetDistanceM)
        : approachTarget;
    const right = { x: Math.cos(yawRad), z: Math.sin(yawRad) };
    const error = { x: target.point.x - position.x, z: target.point.z - position.z };
    const headingErrorRad = normalizeAngle(target.yawRad - yawRad);
    const lateralErrorM = dot(error, right);
    const steering = clamp(headingErrorRad * 1.35 + Math.atan2(lateralErrorM, Math.max(1, Math.hypot(error.x, error.z))) * 1.8, -1, 1);
    const forward = { x: Math.sin(yawRad), z: -Math.cos(yawRad) };
    const forwardSpeedMps = dot(velocity, forward);
    // 박스 직전에는 완전히 정지시키기보다 회전 여유를 남겨 박스 중심으로 꺾은 뒤 멈춘다.
    const approachSpeedMps = location?.withinLane ? pitLane.speedLimitMps * 0.9 : 2;
    const targetSpeedMps = approachingBox ? 6 : approachSpeedMps;
    const overspeedMps = forwardSpeedMps - pitLane.speedLimitMps;
    const targetOverspeedMps = forwardSpeedMps - targetSpeedMps;
    return {
      steering,
      throttle: overspeedMps > 0 ? 0 : clamp((targetSpeedMps - forwardSpeedMps) * 0.18, 0, 0.4),
      brake: approachingBox
        ? clamp((forwardSpeedMps - targetSpeedMps) * 0.12, 0, 0.8)
        : clamp(targetOverspeedMps * 0.3, 0, 1),
      clutch: 0,
      shiftUp: false,
      shiftDown: false,
      overtakeMode: false,
      activeAero: false,
    };
  }

  /** 마지막 상태의 복사본을 반환한다. */
  getSnapshot(): PitLaneSnapshot {
    return { ...this.lastSnapshot };
  }

  /** 그리드 초기값으로 되돌린다. */
  reset(): void {
    this.requested = false;
    this.status = "inactive";
    this.previousWithinLane = false;
    this.speedViolationActive = false;
    this.entryCount = 0;
    this.speedViolationCount = 0;
    this.lastSnapshot = this.createSnapshot({ x: 0, z: 0 }, 0);
  }

  /** 현재 mutable 상태를 UI용 불변 스냅샷으로 만든다. */
  private createSnapshot(
    position: TrackPoint,
    speedMps: number,
    location = samplePitLaneLocation(position, this.track),
    speedViolationMps = 0,
  ): PitLaneSnapshot {
    return {
      status: this.status,
      requested: this.requested,
      withinLane: Boolean(location?.withinLane),
      speedLimitMps: this.track.pitLane?.speedLimitMps ?? 0,
      speedMps: Number.isFinite(speedMps) ? speedMps : 0,
      speedViolationMps: Number.isFinite(speedViolationMps) ? speedViolationMps : 0,
      laneProgressM: location?.laneProgressM ?? 0,
      laneLengthM: location?.laneLengthM ?? 0,
      entryCount: this.entryCount,
      speedViolationCount: this.speedViolationCount,
    };
  }
}
