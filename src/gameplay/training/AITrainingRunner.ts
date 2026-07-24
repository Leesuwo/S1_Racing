/**
 * 브라우저 UI에서 관찰할 수 있는 결정적 AI 교육 에피소드 실행기다.
 * AI는 VehicleControlInput만 생성하고 VehicleSimulation이 위치·속도·기어 상태를 소유한다.
 * 초기 교육은 신경망 학습이 아니라 120Hz 반복 주행과 텔레메트리 평가를 사용한다.
 */
import type { VehicleControlInput } from "../../game/input/VehicleControlInput";
import { VehicleSimulation, type VehicleRenderSnapshot } from "../../game/physics/VehicleSimulation";
import { NORTHFIELD_GP_DATA } from "../../tracks/NorthfieldGP";
import {
  isInsideCheckpoint,
  sampleTestTrackLocation,
  type TestTrackDefinition,
  type TrackPoint,
} from "../../tracks/TestTrack";
import {
  DEFAULT_SINGLE_OPPONENT_AI_CONFIG,
  SingleOpponentAI,
  type SingleOpponentAIConfig,
  type SingleOpponentAITarget,
} from "../ai/SingleOpponentAI";

/** UI에서 선택할 수 있는 결정적 교육 시나리오다. */
export type AITrainingScenarioId = "acceleration" | "braking" | "high-speed" | "low-speed-exit" | "full-lap";

/** 시나리오 선택지의 이름·설명·실행 길이를 데이터로 고정한다. */
export interface AITrainingScenario {
  id: AITrainingScenarioId;
  label: string;
  description: string;
  maxSteps: number;
  /** 독립 구간 평가를 시작할 레이싱 라인 점 ID이며, 없는 트랙에서는 startPose로 대체한다. */
  startPointId?: string;
}

/** 실제 주행과 평가 화면이 공유하는 시나리오 목록이다. */
export const AI_TRAINING_SCENARIOS: readonly AITrainingScenario[] = [
  {
    id: "acceleration",
    label: "직선 가속",
    description: "스로틀·변속과 목표 속도 추종을 관찰한다.",
    maxSteps: 480,
  },
  {
    id: "braking",
    label: "강제동 진입",
    description: "브레이크 마커 앞의 속도 예측과 제동을 관찰한다.",
    maxSteps: 840,
    startPointId: "northfield-heavy-brake",
  },
  {
    id: "high-speed",
    label: "고속 복합 코너",
    description: "레이싱 라인 횡오차와 Pure Pursuit 조향을 관찰한다.",
    maxSteps: 1_080,
    startPointId: "northfield-fast-entry",
  },
  {
    id: "low-speed-exit",
    label: "저속 탈출",
    description: "저속 에이펙스 이후 트랙션·변속·탈출 가속을 관찰한다.",
    maxSteps: 840,
    startPointId: "northfield-low-apex",
  },
  {
    id: "full-lap",
    label: "전체 랩",
    description: "결승선 재통과까지 체크포인트·트랙 이탈·결정성 해시를 종합 평가한다.",
    // 대형 교육 트랙의 물리 시간 60 s 상한이다. 전체 랩은 이 시간보다 먼저 결승선을 통과해야 한다.
    maxSteps: 7_200,
  },
];

/** 교육 실행기의 상태 전이로, UI 버튼과 평가 종료 사유가 공유한다. */
export type AITrainingStatus = "idle" | "running" | "paused" | "completed" | "failed";

/** 입력과 현재 목표를 HUD에 표시하기 위한 유한한 제어 명령 스냅샷이다. */
export interface AITrainingInputSnapshot {
  steering: number;
  throttle: number;
  brake: number;
  shiftUp: boolean;
  shiftDown: boolean;
}

/** 맵 이탈처럼 에피소드를 즉시 끝내는 실패 원인과 다음 튜닝에 전달할 관찰값이다. */
export interface AITrainingFailure {
  reason: "off-track" | "non-finite" | "time-limit";
  stepIndex: number;
  elapsedSeconds: number;
  position: TrackPoint;
  speedMps: number;
  lateralErrorM: number;
  distanceToBoundaryM: number;
  sectionLabel: string;
  input: AITrainingInputSnapshot;
}

/** 한 교육 에피소드의 UI·검증 지표다. 모든 거리는 m, 속도는 m/s, 시간은 s다. */
export interface AITrainingSnapshot {
  status: AITrainingStatus;
  scenario: AITrainingScenario;
  trackName: string;
  stepIndex: number;
  maxSteps: number;
  elapsedSeconds: number;
  /** 출발선부터 현재 차량 위치까지 누적한 실제 레이싱 라인 진행 거리(m)다. */
  lapProgressM: number;
  /** 폐곡선 레이싱 라인의 전체 길이(m)다. */
  trackLengthM: number;
  progressRatio: number;
  speedMps: number;
  targetSpeedMps: number;
  speedErrorMps: number;
  speedErrorRmsMps: number;
  speedErrorP95Mps: number;
  lateralErrorM: number;
  lateralErrorRmsM: number;
  lateralErrorP95M: number;
  maximumLateralErrorM: number;
  bodySlipAngleRad: number;
  maximumBodySlipAngleRad: number;
  brakeOverspeedMps: number;
  offTrackCount: number;
  checkpointIndex: number;
  checkpointCount: number;
  totalCheckpointCount: number;
  inputChatterCount: number;
  brakePoint: boolean;
  targetPoint: TrackPoint;
  currentPosition: TrackPoint;
  input: AITrainingInputSnapshot;
  /** 실패한 에피소드에서만 보존하는 문제 위치·상태 스냅샷이다. */
  failure?: AITrainingFailure;
  determinismHash: string;
  message: string;
}

/** 평가기·HUD가 상태를 안정적으로 초기화할 때 사용하는 중립 입력이다. */
const NEUTRAL_INPUT: AITrainingInputSnapshot = {
  steering: 0,
  throttle: 0,
  brake: 0,
  shiftUp: false,
  shiftDown: false,
};

/** 진행률·오차·입력을 화면 표시 범위로 제한한다. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** 월드 외곽 맵 경계까지의 signed 거리(m)로, 음수는 차량이 실제 맵 밖에 있음을 뜻한다. */
function distanceToMapBoundaryM(position: TrackPoint, track: TestTrackDefinition): number {
  const { minX, maxX, minZ, maxZ } = track.outerBounds;
  const outsideX = Math.max(minX - position.x, 0, position.x - maxX);
  const outsideZ = Math.max(minZ - position.z, 0, position.z - maxZ);
  if (outsideX > 0 || outsideZ > 0) return -Math.hypot(outsideX, outsideZ);
  return Math.min(position.x - minX, maxX - position.x, position.z - minZ, maxZ - position.z);
}

/** 레이싱 라인 폐곡선의 누적 길이·세그먼트 길이를 캐시하는 실제 진행률 계산 데이터다. */
interface RacingLineDistanceMap {
  segmentLengthsM: readonly number[];
  cumulativeStartsM: readonly number[];
  totalLengthM: number;
}

/** 두 평면 지점 사이의 거리를 계산한다. */
function distanceM(first: TrackPoint, second: TrackPoint): number {
  return Math.hypot(second.x - first.x, second.z - first.z);
}

/** 폐곡선 레이싱 라인을 거리 좌표로 바꿔 시각·체크포인트와 독립적인 연속 진행률을 만든다. */
function createRacingLineDistanceMap(track: TestTrackDefinition): RacingLineDistanceMap {
  const segmentLengthsM = track.racingLine.map((point, index) => (
    distanceM(point.position, track.racingLine[(index + 1) % track.racingLine.length]?.position ?? point.position)
  ));
  const cumulativeStartsM: number[] = [];
  let totalLengthM = 0;

  segmentLengthsM.forEach((segmentLengthM) => {
    cumulativeStartsM.push(totalLengthM);
    totalLengthM += segmentLengthM;
  });

  return { segmentLengthsM, cumulativeStartsM, totalLengthM };
}

/** 차량 위치를 가장 가까운 레이싱 라인 선분에 투영해 출발선 기준 거리(m)를 계산한다. */
function projectRacingLineDistanceM(
  position: TrackPoint,
  track: TestTrackDefinition,
  distanceMap: RacingLineDistanceMap,
): number {
  const line = track.racingLine;
  if (line.length < 2 || distanceMap.totalLengthM <= 0) return 0;

  let closestDistanceSquared = Number.POSITIVE_INFINITY;
  let closestDistanceM = 0;
  line.forEach((start, index) => {
    const end = line[(index + 1) % line.length] ?? start;
    const deltaX = end.position.x - start.position.x;
    const deltaZ = end.position.z - start.position.z;
    const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
    const ratio = lengthSquared > 0
      ? clamp(((position.x - start.position.x) * deltaX + (position.z - start.position.z) * deltaZ) / lengthSquared, 0, 1)
      : 0;
    const projectedX = start.position.x + deltaX * ratio;
    const projectedZ = start.position.z + deltaZ * ratio;
    const distanceSquared = (position.x - projectedX) ** 2 + (position.z - projectedZ) ** 2;

    if (distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = distanceSquared;
      closestDistanceM = (distanceMap.cumulativeStartsM[index] ?? 0)
        + (distanceMap.segmentLengthsM[index] ?? 0) * ratio;
    }
  });

  return closestDistanceM;
}

/** 폐곡선의 0 m 경계를 지날 때도 전진·후진의 가장 짧은 실제 이동량(m)을 반환한다. */
export function signedTrackDeltaM(previousDistanceM: number, nextDistanceM: number, trackLengthM: number): number {
  if (trackLengthM <= 0) return 0;
  let deltaM = nextDistanceM - previousDistanceM;
  if (deltaM > trackLengthM * 0.5) deltaM -= trackLengthM;
  if (deltaM < -trackLengthM * 0.5) deltaM += trackLengthM;
  return deltaM;
}

/** 두 평면 위치 사이의 signed 횡오차를 계산한다. 차량 오른쪽이 양수다. */
function lateralErrorM(position: TrackPoint, target: SingleOpponentAITarget, yawRad: number): number {
  const right = { x: Math.cos(yawRad), z: Math.sin(yawRad) };
  return (target.targetPoint.position.x - position.x) * right.x
    + (target.targetPoint.position.z - position.z) * right.z;
}

/** 부동소수점 상태를 양자화해 동일 실행 비교용 해시 입력을 만든다. */
function quantize(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1_000) : 0;
}

/** 간단한 FNV-1a 누적 해시로 긴 텔레메트리 배열을 짧은 결정성 토큰으로 만든다. */
function appendHash(hash: number, values: readonly number[]): number {
  let next = hash >>> 0;
  values.forEach((value) => {
    const quantized = quantize(value);
    next ^= quantized & 0xff;
    next = Math.imul(next, 16_777_619) >>> 0;
    next ^= (quantized >>> 8) & 0xff;
    next = Math.imul(next, 16_777_619) >>> 0;
  });
  return next >>> 0;
}

/** 누적된 절대 오차 배열에서 평가용 백분위 지표를 계산한다. */
function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}

/** 부동소수점 해시를 UI에서 비교 가능한 8자리 hexadecimal 문자열로 표시한다. */
function formatHash(hash: number): string {
  return hash.toString(16).padStart(8, "0");
}

/** 교육 실행기 내부 상태를 관리하고 UI에는 복사된 스냅샷만 제공한다. */
export class AITrainingRunner {
  /** 모든 시나리오가 읽는 트랙 데이터의 단일 원본이다. */
  readonly track: TestTrackDefinition;
  /** 물리 입력과 상태를 소유하는 동일한 차량 시뮬레이션 경계다. */
  simulation: VehicleSimulation;
  /** 플레이어와 같은 입력 경계만 생성하는 결정적 AI다. */
  /** 현재 에피소드에서 평가할 설정을 적용한 AI 제어기다. */
  ai: SingleOpponentAI;
  /** 파라미터 탐색 결과와 재실행 조건을 연결하는 현재 AI 설정 스냅샷이다. */
  private aiConfig: SingleOpponentAIConfig;

  private scenario: AITrainingScenario;
  private status: AITrainingStatus = "idle";
  private stepIndex = 0;
  private elapsedSeconds = 0;
  private offTrackCount = 0;
  private checkpointIndex = 0;
  private checkpointCount = 0;
  private lateralErrorSquaredSum = 0;
  private speedErrorSquaredSum = 0;
  private lateralErrorsM: number[] = [];
  private speedErrorsMps: number[] = [];
  private maximumLateralErrorM = 0;
  /** 차체 전방 대비 실제 속도 벡터의 최대 편차(rad)이며, AI 평가와 HUD가 공유한다. */
  private maximumBodySlipAngleRad = 0;
  private brakeOverspeedMps = 0;
  private inputChatterCount = 0;
  private previousInput: AITrainingInputSnapshot = { ...NEUTRAL_INPUT };
  private lastInput: AITrainingInputSnapshot = { ...NEUTRAL_INPUT };
  private hash = 2_166_136_261;
  private lastTarget: SingleOpponentAITarget;
  /** 레이싱 라인의 길이 좌표 캐시로 매 step에서 진행률만 위해 선분 길이를 다시 만들지 않는다. */
  private readonly racingLineDistanceMap: RacingLineDistanceMap;
  /** 출발선부터 현재 차량까지의 부호 있는 누적 주행 거리(m)다. 후진하면 감소한다. */
  private lapProgressM = 0;
  /** 직전 fixed step의 레이싱 라인 투영 거리(m)다. 폐곡선 경계에서 방향을 판별하는 기준이다. */
  private previousProjectedDistanceM = 0;
  /** 맵 이탈 등 종료 시점의 관찰값을 다음 자동 튜닝 결과에 전달하는 불변 스냅샷이다. */
  private failure: AITrainingFailure | undefined;
  private message = "훈련 대기 · 시나리오를 선택하고 시작하십시오.";

  constructor(
    track: TestTrackDefinition = NORTHFIELD_GP_DATA,
    scenarioId: AITrainingScenarioId = "full-lap",
    aiConfig: SingleOpponentAIConfig = DEFAULT_SINGLE_OPPONENT_AI_CONFIG,
  ) {
    // 트랙과 시나리오를 먼저 고정해 시뮬레이션·AI·평가기가 같은 데이터를 읽게 한다.
    this.track = track;
    this.racingLineDistanceMap = createRacingLineDistanceMap(track);
    this.scenario = this.findScenario(scenarioId);
    this.aiConfig = { ...aiConfig };
    this.simulation = new VehicleSimulation(undefined, track, this.resolveScenarioStartPose(this.scenario));
    this.ai = new SingleOpponentAI(track, this.aiConfig);
    this.lastTarget = this.ai.getTarget(this.createAIState());
    this.previousProjectedDistanceM = projectRacingLineDistanceM(
      this.simulation.current.position,
      this.track,
      this.racingLineDistanceMap,
    );
  }

  /** 현재 시나리오를 반환해 select와 실행 결과가 같은 값을 표시하게 한다. */
  getScenario(): AITrainingScenario {
    return this.scenario;
  }

  /** 현재 실행기의 AI 설정을 복사해 평가 결과와 함께 저장할 수 있게 한다. */
  getAIConfig(): SingleOpponentAIConfig {
    return { ...this.aiConfig };
  }

  /** 새 설정을 적용하고 동일한 초기 상태에서 다시 교육할 수 있게 한다. */
  setAIConfig(aiConfig: SingleOpponentAIConfig): void {
    this.aiConfig = { ...aiConfig };
    this.ai = new SingleOpponentAI(this.track, this.aiConfig);
    this.reset();
  }

  /** 현재 시나리오를 바꾸고 즉시 이전 에피소드의 물리·평가 상태를 폐기한다. */
  setScenario(scenarioId: AITrainingScenarioId): void {
    this.scenario = this.findScenario(scenarioId);
    this.simulation = new VehicleSimulation(
      undefined,
      this.track,
      this.resolveScenarioStartPose(this.scenario),
    );
    this.reset();
  }

  /** 실행 상태를 시작으로 전환한다. 이미 완료된 실행은 reset 이후 시작한다. */
  start(): void {
    if (this.status === "completed" || this.status === "failed") {
      this.reset();
    }
    this.status = "running";
    this.message = "AI 교육 실행 중 · VehicleControlInput을 물리에 전달하는 중입니다.";
  }

  /** UI에서 교육 실행을 멈추되 현재 시뮬레이션 상태와 해시는 보존한다. */
  pause(): void {
    if (this.status === "running") {
      this.status = "paused";
      this.message = "일시정지 · 현재 상태에서 한 스텝씩 관찰할 수 있습니다.";
    }
  }

  /** 물리와 평가 상태를 초기 포즈로 되돌리고 실행을 대기 상태로 만든다. */
  reset(): void {
    this.simulation.reset();
    this.ai.reset();
    this.status = "idle";
    this.stepIndex = 0;
    this.elapsedSeconds = 0;
    this.offTrackCount = 0;
    this.checkpointIndex = 0;
    this.checkpointCount = 0;
    this.lateralErrorSquaredSum = 0;
    this.speedErrorSquaredSum = 0;
    this.lateralErrorsM = [];
    this.speedErrorsMps = [];
    this.maximumLateralErrorM = 0;
    this.maximumBodySlipAngleRad = 0;
    this.brakeOverspeedMps = 0;
    this.inputChatterCount = 0;
    this.previousInput = { ...NEUTRAL_INPUT };
    this.lastInput = { ...NEUTRAL_INPUT };
    this.hash = 2_166_136_261;
    this.lastTarget = this.ai.getTarget(this.createAIState());
    this.lapProgressM = 0;
    this.failure = undefined;
    this.previousProjectedDistanceM = projectRacingLineDistanceM(
      this.simulation.current.position,
      this.track,
      this.racingLineDistanceMap,
    );
    this.message = "훈련 대기 · 시나리오를 선택하고 시작하십시오.";
  }

  /** UI의 한 스텝 버튼으로 실행할 수 있는 단일 120Hz 물리·AI 평가 스텝이다. */
  stepOnce(): AITrainingSnapshot {
    if (this.status === "completed" || this.status === "failed") {
      this.reset();
    }
    if (this.status === "idle") {
      this.status = "paused";
      this.message = "수동 스텝 · 시작 버튼을 누르면 연속 교육을 실행합니다.";
    }
    this.stepFixed();
    return this.getSnapshot();
  }

  /** 한 렌더 프레임에서 제한된 fixed step을 실행해 UI가 관찰 가능한 속도로 진행한다. */
  advance(maxSteps = 4): AITrainingSnapshot {
    if (this.status === "running") {
      const safeSteps = Math.max(1, Math.min(12, Math.floor(maxSteps)));
      for (let index = 0; index < safeSteps; index += 1) {
        this.stepFixed();
        if (this.status !== "running") break;
      }
    }
    return this.getSnapshot();
  }

  /** AI 차량을 Three.js가 보간해 표시할 평면 스냅샷을 반환한다. */
  getRenderSnapshot(alpha = 1): VehicleRenderSnapshot {
    return this.simulation.getRenderSnapshot(alpha);
  }

  /** React가 렌더링할 값은 내부 객체와 분리해 외부 mutation을 차단한다. */
  getSnapshot(): AITrainingSnapshot {
    const current = this.simulation.current;
    const location = sampleTestTrackLocation(current.position, this.track);
    const targetSpeedMps = this.lastTarget.targetSpeedMps;
    // 전체 랩의 퍼센트는 실제 위치를 레이싱 라인에 투영한 거리이며, 후진하면 누적 거리도 감소한다.
    const progressRatio = this.scenario.id === "full-lap"
      // 결승선 체크포인트 통과로 완주가 확정되면 반경 안 투영 위치와 무관하게 100%를 표시한다.
      ? (this.status === "completed" ? 1 : clamp(
        this.lapProgressM / Math.max(1, this.racingLineDistanceMap.totalLengthM),
        0,
        1,
      ))
      : clamp(this.stepIndex / this.scenario.maxSteps, 0, 1);
    // 완료·실패 결과는 트랙 위치 경고보다 우선해 HUD가 최종 상태를 숨기지 않게 한다.
    const displayMessage = this.status === "completed" || this.status === "failed"
      ? this.message
      : location.onTrack
        ? this.message
        : "트랙 이탈 감지 · 평가 지표에 반영되었습니다.";

    return {
      status: this.status,
      scenario: { ...this.scenario },
      trackName: this.track.name,
      stepIndex: this.stepIndex,
      maxSteps: this.scenario.maxSteps,
      elapsedSeconds: this.elapsedSeconds,
      lapProgressM: this.lapProgressM,
      trackLengthM: this.racingLineDistanceMap.totalLengthM,
      progressRatio,
      speedMps: current.speedMps,
      targetSpeedMps,
      speedErrorMps: current.speedMps - targetSpeedMps,
      speedErrorRmsMps: Math.sqrt(this.speedErrorSquaredSum / Math.max(1, this.stepIndex)),
      speedErrorP95Mps: percentile(this.speedErrorsMps, 0.95),
      lateralErrorM: this.currentLateralErrorM(),
      lateralErrorRmsM: Math.sqrt(this.lateralErrorSquaredSum / Math.max(1, this.stepIndex)),
      lateralErrorP95M: percentile(this.lateralErrorsM, 0.95),
      maximumLateralErrorM: this.maximumLateralErrorM,
      bodySlipAngleRad: this.currentBodySlipAngleRad(),
      maximumBodySlipAngleRad: this.maximumBodySlipAngleRad,
      brakeOverspeedMps: this.brakeOverspeedMps,
      offTrackCount: this.offTrackCount,
      checkpointIndex: this.checkpointIndex,
      checkpointCount: this.checkpointCount,
      totalCheckpointCount: this.track.checkpoints.length,
      inputChatterCount: this.inputChatterCount,
      brakePoint: this.lastTarget.brakePoint,
      targetPoint: { ...this.lastTarget.targetPoint.position },
      currentPosition: { ...current.position },
      input: { ...this.lastInput },
      failure: this.failure && {
        ...this.failure,
        position: { ...this.failure.position },
        input: { ...this.failure.input },
      },
      determinismHash: formatHash(this.hash),
      message: displayMessage,
    };
  }

  /** 현재 차량 상태를 AI 입력 계약에 맞는 읽기 전용 상태로 투영한다. */
  private createAIState() {
    return {
      ...this.simulation.current,
      maxGear: this.simulation.config.gearRatios.length,
    };
  }

  /** 고정된 120Hz 간격으로 AI 입력·차량 물리·평가 지표를 한 번 갱신한다. */
  private stepFixed(): void {
    if (this.stepIndex >= this.scenario.maxSteps) {
      this.finishAtStepLimit();
      return;
    }

    const dtSeconds = 1 / 120;
    const state = this.createAIState();
    const input = this.ai.update(state, dtSeconds);
    this.lastTarget = this.ai.getTarget(state);
    this.previousInput = this.lastInput;
    this.lastInput = this.toInputSnapshot(input);
    this.updateInputChatter(this.lastInput);
    this.simulation.step(input, dtSeconds);

    const current = this.simulation.current;
    const location = sampleTestTrackLocation(current.position, this.track);
    const lateralError = this.currentLateralErrorM();
    const bodySlipAngleRad = this.currentBodySlipAngleRad();
    const speedError = current.speedMps - this.lastTarget.targetSpeedMps;
    const overspeedMps = Math.max(0, speedError);

    this.stepIndex += 1;
    this.elapsedSeconds += dtSeconds;
    this.lateralErrorSquaredSum += lateralError * lateralError;
    this.speedErrorSquaredSum += speedError * speedError;
    this.lateralErrorsM.push(Math.abs(lateralError));
    this.speedErrorsMps.push(Math.abs(speedError));
    this.maximumLateralErrorM = Math.max(this.maximumLateralErrorM, Math.abs(lateralError));
    this.maximumBodySlipAngleRad = Math.max(this.maximumBodySlipAngleRad, Math.abs(bodySlipAngleRad));
    this.brakeOverspeedMps = Math.max(this.brakeOverspeedMps, overspeedMps);
    if (!location.onTrack) this.offTrackCount += 1;
    this.updateLapProgress(current.position);
    this.advanceCheckpoint(current.position);
    this.hash = appendHash(this.hash, [
      current.position.x,
      current.position.z,
      current.speedMps,
      current.yawRad,
      this.lastInput.steering,
      this.lastInput.throttle,
      this.lastInput.brake,
    ]);

    if (!Number.isFinite(current.speedMps) || !Number.isFinite(current.position.x)) {
      this.failEpisode("non-finite", current.position, lateralError, location.distanceToBoundaryM, "물리 상태");
    } else if (distanceToMapBoundaryM(current.position, this.track) < 0) {
      // 도로 리밋 경고와 달리 월드 맵 밖은 복구 가능한 주행 상태가 아니므로 즉시 실패 사례로 고정한다.
      this.failEpisode("off-track", current.position, lateralError, distanceToMapBoundaryM(current.position, this.track), "맵 외곽");
    } else if (this.isFullLapComplete()) {
      this.status = "completed";
      this.message = "전체 랩 완료 · 결승선 재통과와 모든 체크포인트를 확인했습니다.";
    } else if (this.stepIndex >= this.scenario.maxSteps) {
      this.finishAtStepLimit();
    }
  }

  /** 현재 투영 위치와 직전 투영 위치의 부호 있는 차이를 누적해 실제 트랙 진행률을 갱신한다. */
  private updateLapProgress(position: TrackPoint): void {
    if (this.scenario.id !== "full-lap") return;

    const projectedDistanceM = projectRacingLineDistanceM(position, this.track, this.racingLineDistanceMap);
    const deltaM = signedTrackDeltaM(
      this.previousProjectedDistanceM,
      projectedDistanceM,
      this.racingLineDistanceMap.totalLengthM,
    );
    this.lapProgressM += deltaM;
    this.previousProjectedDistanceM = projectedDistanceM;
  }

  /** 전체 랩은 마지막 결승선 체크포인트까지 순서대로 통과해야 완료된다. */
  private isFullLapComplete(): boolean {
    return this.scenario.id === "full-lap" && this.checkpointIndex >= this.track.checkpoints.length;
  }

  /** 시간 상한은 구간 시나리오의 완료 조건이지만 전체 랩에서는 미완주 실패 조건이다. */
  private finishAtStepLimit(): void {
    if (this.scenario.id === "full-lap") {
      this.status = "failed";
      this.message = "전체 랩 미완주 · 시간 상한 전에 결승선에 도달하지 못했습니다.";
      this.failure = {
        reason: "time-limit",
        stepIndex: this.stepIndex,
        elapsedSeconds: this.elapsedSeconds,
        position: { ...this.simulation.current.position },
        speedMps: this.simulation.current.speedMps,
        lateralErrorM: this.currentLateralErrorM(),
        distanceToBoundaryM: distanceToMapBoundaryM(this.simulation.current.position, this.track),
        sectionLabel: "시간 상한",
        input: { ...this.lastInput },
      };
      return;
    }

    this.status = "completed";
    this.message = "시나리오 완료 · 결과 지표와 결정성 해시를 확인하십시오.";
  }

  /** 실패 시점의 관찰값을 복사해 자동 튜닝과 HUD가 이후 물리 변형 없이 같은 문제를 설명하게 한다. */
  private failEpisode(
    reason: AITrainingFailure["reason"],
    position: TrackPoint,
    lateralErrorM: number,
    distanceToBoundaryM: number,
    sectionLabel: string,
  ): void {
    this.status = "failed";
    this.failure = {
      reason,
      stepIndex: this.stepIndex,
      elapsedSeconds: this.elapsedSeconds,
      position: { ...position },
      speedMps: this.simulation.current.speedMps,
      lateralErrorM,
      distanceToBoundaryM,
      sectionLabel,
      input: { ...this.lastInput },
    };
    this.message = reason === "off-track"
      ? "트랙 이탈 실패 · 맵 경계를 벗어나 에피소드를 즉시 종료하고 실패 사례를 저장했습니다."
      : "실패 · 유한하지 않은 물리 상태가 감지되어 실패 사례를 저장했습니다.";
  }

  /** 레이싱 라인 목표점과 현재 pose에서 최신 횡오차를 계산한다. */
  private currentLateralErrorM(): number {
    return lateralErrorM(this.simulation.current.position, this.lastTarget, this.simulation.current.yawRad);
  }

  /** 차체 축 대비 실제 속도 벡터의 편차(rad)를 계산해 드리프트 판정과 HUD를 같은 값으로 유지한다. */
  private currentBodySlipAngleRad(): number {
    return Math.atan2(
      this.simulation.current.lateralSpeedMps,
      Math.max(0.5, Math.abs(this.simulation.current.forwardSpeedMps)),
    );
  }

  /** 체크포인트가 순서대로 통과된 경우에만 평가 진행도를 증가시킨다. */
  private advanceCheckpoint(position: TrackPoint): void {
    const nextCheckpoint = this.track.checkpoints[this.checkpointIndex];
    if (!nextCheckpoint || !isInsideCheckpoint(position, nextCheckpoint)) return;
    this.checkpointIndex = Math.min(this.track.checkpoints.length, this.checkpointIndex + 1);
    this.checkpointCount += 1;
  }

  /** 스로틀·브레이크·조향 방향이 급변한 횟수를 교육 지표에 누적한다. */
  private updateInputChatter(input: AITrainingInputSnapshot): void {
    const pedalChanged = Math.abs(input.throttle - this.previousInput.throttle) > 0.2
      || Math.abs(input.brake - this.previousInput.brake) > 0.2;
    const steeringChanged = Math.sign(input.steering) !== Math.sign(this.previousInput.steering)
      && Math.abs(input.steering - this.previousInput.steering) > 0.35;
    if (pedalChanged || steeringChanged) this.inputChatterCount += 1;
  }

  /** 전체 입력 계약에서 HUD에 필요한 조작 필드만 복사한다. */
  private toInputSnapshot(input: VehicleControlInput): AITrainingInputSnapshot {
    return {
      steering: input.steering,
      throttle: input.throttle,
      brake: input.brake,
      shiftUp: input.shiftUp,
      shiftDown: input.shiftDown,
    };
  }

  /** 잘못된 시나리오 ID를 전체 랩으로 안전하게 대체한다. */
  private findScenario(scenarioId: AITrainingScenarioId): AITrainingScenario {
    return AI_TRAINING_SCENARIOS.find((scenario) => scenario.id === scenarioId)
      ?? AI_TRAINING_SCENARIOS[AI_TRAINING_SCENARIOS.length - 1];
  }

  /** 시나리오 전용 레이싱 라인 점을 찾고, 다른 트랙에서는 기본 시작 포즈를 보존한다. */
  private resolveScenarioStartPose(scenario: AITrainingScenario): TestTrackDefinition["startPose"] {
    const startPoint = scenario.startPointId
      ? this.track.racingLine.find((point) => point.id === scenario.startPointId)
      : undefined;
    return startPoint
      ? { position: { ...startPoint.position }, yawRad: startPoint.yawRad }
      : { position: { ...this.track.startPose.position }, yawRad: this.track.startPose.yawRad };
  }
}
