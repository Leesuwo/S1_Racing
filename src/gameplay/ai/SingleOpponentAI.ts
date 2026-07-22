/**
 * 플레이어와 같은 VehicleControlInput 경계만 출력하는 결정적 단일 AI 제어기다.
 * 위치·속도·기어 상태를 직접 변경하지 않고, 트랙 데이터의 레이싱 라인과 목표 속도를
 * Pure Pursuit 및 속도 오차 제어로 입력 명령으로 변환한다.
 */
import type { VehicleControlInput } from "../../game/input/VehicleControlInput";
import {
  TEST_TRACK_DATA,
  type TestTrackDefinition,
  type TestTrackRacingLinePoint,
  type TrackPoint,
} from "../../tracks/TestTrack";

/** AI가 읽을 수 있는 차량 상태 스냅샷이다. 물리 상태를 직접 소유하지 않는다. */
export interface SingleOpponentAIState {
  position: TrackPoint;
  velocity: TrackPoint;
  yawRad: number;
  speedMps: number;
  forwardSpeedMps: number;
  rpm: number;
  gear: number;
  maxGear: number;
}

/** AI 조향·속도·변속 제어기의 단위가 명시된 튜닝 경계다. */
export interface SingleOpponentAIConfig {
  lookaheadM: number;
  lookaheadSpeedScale: number;
  brakeLookaheadM: number;
  headingGain: number;
  lateralGain: number;
  throttleGain: number;
  brakeGain: number;
  brakeDeadbandMps: number;
  upshiftRpm: number;
  downshiftRpm: number;
  shiftCooldownSeconds: number;
}

/** 현재 차량 상태에서 선택한 레이싱 라인 목표와 제동 미리보기다. */
export interface SingleOpponentAITarget {
  closestIndex: number;
  lookaheadIndex: number;
  brakeLookaheadIndex: number;
  targetPoint: TestTrackRacingLinePoint;
  targetSpeedMps: number;
  previewSpeedMps: number;
  brakePoint: boolean;
}

/**
 * M2A 초기 가정(initial_assumption) 튜닝값이다.
 * 거리 값은 m, 속도는 m/s, 회전 이득과 입력 이득은 무차원, RPM과 변속 쿨다운은 각각
 * engine rpm 및 s 단위다. 실제 차량 재현값이 아니며 simulation_required 상태다.
 */
export const DEFAULT_SINGLE_OPPONENT_AI_CONFIG: SingleOpponentAIConfig = {
  lookaheadM: 4.5,
  lookaheadSpeedScale: 0.18,
  brakeLookaheadM: 13,
  headingGain: 1.4,
  lateralGain: 1.8,
  throttleGain: 0.12,
  brakeGain: 0.16,
  brakeDeadbandMps: 1.5,
  upshiftRpm: 7_200,
  downshiftRpm: 2_000,
  shiftCooldownSeconds: 0.25,
};

/** 입력 제어값을 허용 범위로 제한해 NaN이 아닌 유한한 명령을 유지한다. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** 헤딩 오차를 -π부터 π까지로 접어 가장 짧은 회전 방향을 선택한다. */
function normalizeAngle(angleRad: number): number {
  // 헤딩 비교가 항상 최단 회전 경로를 사용하도록 정규화하는 임시 각도(rad)다.
  let normalized = angleRad;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

/** 레이싱 라인 인접 점 사이의 평면 거리(m)를 계산한다. */
function distanceBetween(a: TrackPoint, b: TrackPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** 외부 물리 스냅샷의 비유한 수치를 안전한 제어 입력 기본값으로 치환한다. */
function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * 데이터 정의 레이싱 라인을 따라 조향·가감속·변속 입력을 생성하는 순수 AI 컨트롤러다.
 * 반환값 외에는 차량 위치, 속도, 접지 상태를 변경하지 않는다.
 */
export class SingleOpponentAI {
  // 매 fixed step에서 레이싱 라인까지 누적 거리를 다시 계산하지 않도록 캐시한 세그먼트 길이(m)다.
  private readonly segmentLengths: readonly number[];
  // 변속 입력을 한 step만 내보내기 위해 유지하는 남은 쿨다운(s)이다.
  private shiftCooldownSeconds = 0;

  constructor(
    private readonly track: TestTrackDefinition = TEST_TRACK_DATA,
    private readonly config: SingleOpponentAIConfig = DEFAULT_SINGLE_OPPONENT_AI_CONFIG,
  ) {
    this.segmentLengths = track.racingLine.map((point, index) => (
      distanceBetween(point.position, track.racingLine[(index + 1) % track.racingLine.length].position)
    ));
  }

  /** 변속 쿨다운을 초기화하여 리셋 후 동일한 입력 시퀀스를 재현한다. */
  reset(): void {
    this.shiftCooldownSeconds = 0;
  }

  /** 현재 상태에서 조향 목표와 코너 진입 전 속도 미리보기를 계산한다. */
  getTarget(state: SingleOpponentAIState): SingleOpponentAITarget {
    // 트랙 정의의 폐곡선 레이싱 라인 참조다.
    const line = this.track.racingLine;
    if (line.length === 0) {
      throw new Error("SingleOpponentAI requires at least one racing-line point");
    }

    // 가장 가까운 라인 점은 현재 구간을 결정하고, 더 앞의 점은 코너 진입 전 속도 예측에만 사용한다.
    // 이렇게 하면 AI가 현재 점의 속도만 따라가며 제동을 늦추는 상태를 피할 수 있다.
    // 현재 위치에서 가장 가까운 라인 점의 인덱스이며 현재 코너 구간을 대표한다.
    const closestIndex = this.findClosestPointIndex(state.position);
    // 속도에 비례해 시야를 늘리는 조향 목표 거리(m)다.
    const lookaheadDistanceM = Math.max(
      0,
      this.config.lookaheadM + Math.max(0, finiteOr(state.speedMps, 0)) * this.config.lookaheadSpeedScale,
    );
    // 조향에 사용할 전방 목표점과 제동 판단용 미리보기 점의 인덱스다.
    const lookaheadIndex = this.advanceIndex(closestIndex, lookaheadDistanceM);
    const brakeLookaheadIndex = this.advanceIndex(closestIndex, Math.max(0, this.config.brakeLookaheadM));
    // 레이싱 라인에서 실제 조향 방향과 현재 목표 속도를 읽는 점들이다.
    const targetPoint = line[lookaheadIndex];
    const closestPoint = line[closestIndex];
    const previewPoint = line[brakeLookaheadIndex];

    return {
      closestIndex,
      lookaheadIndex,
      brakeLookaheadIndex,
      targetPoint,
      targetSpeedMps: Math.max(0, Math.min(closestPoint.targetSpeedMps, previewPoint.targetSpeedMps)),
      previewSpeedMps: Math.max(0, previewPoint.targetSpeedMps),
      brakePoint: Boolean(closestPoint.brakePoint || previewPoint.brakePoint),
    };
  }

  /** 한 fixed step에 적용할 VehicleControlInput을 결정한다. */
  update(state: SingleOpponentAIState, dtSeconds: number): VehicleControlInput {
    // 잘못된 프레임 dt를 고정 120Hz 간격으로 대체해 상태 전이를 유한하게 유지한다.
    const safeDtSeconds = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 1 / 120;
    this.shiftCooldownSeconds = Math.max(0, this.shiftCooldownSeconds - safeDtSeconds);
    // 현재 차량 상태에서 계산한 조향·속도 제어 목표다.
    const target = this.getTarget(state);
    // 목표점까지의 평면 오차(m)이며 프로젝트 좌표계의 x/z 성분이다.
    const dx = target.targetPoint.position.x - state.position.x;
    const dz = target.targetPoint.position.z - state.position.z;
    // 프로젝트 좌표계의 right 벡터(+X 오른쪽, +Y 위, -Z 전방)를 사용해 라인 횡오차의 부호를 유지한다.
    // 차량 기준 우측 방향 벡터로, 라인에서 벗어난 횡오차의 부호를 계산한다.
    const right = { x: Math.cos(state.yawRad), z: Math.sin(state.yawRad) };
    // 목표점을 향한 실제 평면 거리(m)이며 저속 0 나눗셈을 방지한다.
    const lookaheadDistanceM = Math.max(1, Math.hypot(dx, dz));
    // 차량 우측을 양수로 하는 레이싱 라인 횡오차(m)다.
    const lateralErrorM = dx * right.x + dz * right.z;
    // 현재 yaw에서 목표 yaw까지의 최단 헤딩 오차(rad)다.
    const headingErrorRad = normalizeAngle(target.targetPoint.yawRad - state.yawRad);
    // 헤딩·횡오차를 합친 정규화 조향 입력이다.
    const steering = clamp(
      headingErrorRad * this.config.headingGain
        + Math.atan2(lateralErrorM, lookaheadDistanceM) * this.config.lateralGain,
      -1,
      1,
    );

    // 후진 입력을 전진 제어기로 처리하지 않도록 음수 전진 속도를 0으로 제한한다.
    const forwardSpeedMps = Math.max(0, finiteOr(state.forwardSpeedMps, finiteOr(state.speedMps, 0)));
    // 목표 속도와 현재 속도의 차이(m/s)이며 양수일 때 가속 여유를 뜻한다.
    const speedErrorMps = target.targetSpeedMps - forwardSpeedMps;
    // 데드밴드를 제외하고 초과한 속도(m/s)이며 양수일 때 제동을 시작한다.
    const overspeedMps = forwardSpeedMps - target.targetSpeedMps - this.config.brakeDeadbandMps;
    // 목표 속도보다 빠른 경우에는 스로틀과 브레이크를 동시에 요청하지 않는다.
    // brakeDeadbandMps는 타깃 속도 주변의 입력 채터링을 막는 초기 가정이다.
    // 목표 속도 오차와 브레이크 진입점을 반영한 정규화 제동 입력이다.
    const brake = clamp(
      overspeedMps > 0
        ? overspeedMps * this.config.brakeGain + (target.brakePoint ? 0.08 : 0)
        : 0,
      0,
      1,
    );
    // 제동 중에는 구동 입력을 제거하고, 그 외에는 목표 속도 오차로 스로틀을 계산한다.
    const throttle = brake > 0
      ? 0
      : clamp(speedErrorMps * this.config.throttleGain, 0, 1);
    // RPM과 현재 기어에 따른 one-shot 변속 상승·하강 요청이다.
    const shiftUp = this.shiftCooldownSeconds <= 0
      && state.rpm >= this.config.upshiftRpm
      && state.gear < state.maxGear;
    const shiftDown = this.shiftCooldownSeconds <= 0
      && state.rpm <= this.config.downshiftRpm
      && state.gear > 1
      && target.targetSpeedMps > forwardSpeedMps + 4;

    if (shiftUp || shiftDown) {
      this.shiftCooldownSeconds = Math.max(0, this.config.shiftCooldownSeconds);
    }

    return {
      steering: Number.isFinite(steering) ? steering : 0,
      throttle: Number.isFinite(throttle) ? throttle : 0,
      brake: Number.isFinite(brake) ? brake : 0,
      clutch: 0,
      shiftUp,
      shiftDown,
      overtakeMode: false,
      activeAero: true,
    };
  }

  /** 현재 차량 위치와 유클리드 거리가 가장 작은 레이싱 라인 점을 선택한다. */
  private findClosestPointIndex(position: TrackPoint): number {
    // 현재까지 확인한 가장 가까운 점과 제곱거리(m²)를 저장한다.
    let closestIndex = 0;
    let closestDistanceSquared = Number.POSITIVE_INFINITY;

    this.track.racingLine.forEach((point, index) => {
      // 제곱근을 생략한 평면 거리 비교값(m²)이다.
      const distanceSquared = (point.position.x - position.x) ** 2
        + (point.position.z - position.z) ** 2;
      if (distanceSquared < closestDistanceSquared) {
        closestDistanceSquared = distanceSquared;
        closestIndex = index;
      }
    });

    return closestIndex;
  }

  /** 폐곡선 레이싱 라인에서 주어진 거리(m)만큼 앞선 점의 인덱스를 계산한다. */
  private advanceIndex(startIndex: number, distanceM: number): number {
    if (this.track.racingLine.length <= 1 || distanceM <= 0) {
      return startIndex;
    }

    // 레이싱 라인은 폐곡선이므로 마지막 점 이후 첫 점으로 순환한다. 유한한 guard는
    // 잘못된 0 길이 데이터가 들어와도 고정 스텝에서 무한 루프가 되지 않게 한다.
    // 현재 탐색 중인 라인 점과 남은 전진 거리(m), 무한 루프 방지 횟수다.
    let index = startIndex;
    let remainingM = distanceM;
    let guard = 0;
    while (remainingM > 0 && guard < this.track.racingLine.length * 2) {
      remainingM -= this.segmentLengths[index] ?? 0;
      index = (index + 1) % this.track.racingLine.length;
      guard += 1;
    }

    return index;
  }
}
