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
    description: "체크포인트·트랙 이탈·결정성 해시를 종합 평가한다.",
    maxSteps: 1_920,
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

/** 한 교육 에피소드의 UI·검증 지표다. 모든 거리는 m, 속도는 m/s, 시간은 s다. */
export interface AITrainingSnapshot {
  status: AITrainingStatus;
  scenario: AITrainingScenario;
  trackName: string;
  stepIndex: number;
  maxSteps: number;
  elapsedSeconds: number;
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
  private brakeOverspeedMps = 0;
  private inputChatterCount = 0;
  private previousInput: AITrainingInputSnapshot = { ...NEUTRAL_INPUT };
  private lastInput: AITrainingInputSnapshot = { ...NEUTRAL_INPUT };
  private hash = 2_166_136_261;
  private lastTarget: SingleOpponentAITarget;
  private message = "훈련 대기 · 시나리오를 선택하고 시작하십시오.";

  constructor(
    track: TestTrackDefinition = NORTHFIELD_GP_DATA,
    scenarioId: AITrainingScenarioId = "full-lap",
    aiConfig: SingleOpponentAIConfig = DEFAULT_SINGLE_OPPONENT_AI_CONFIG,
  ) {
    // 트랙과 시나리오를 먼저 고정해 시뮬레이션·AI·평가기가 같은 데이터를 읽게 한다.
    this.track = track;
    this.scenario = this.findScenario(scenarioId);
    this.aiConfig = { ...aiConfig };
    this.simulation = new VehicleSimulation(undefined, track, this.resolveScenarioStartPose(this.scenario));
    this.ai = new SingleOpponentAI(track, this.aiConfig);
    this.lastTarget = this.ai.getTarget(this.createAIState());
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
    this.brakeOverspeedMps = 0;
    this.inputChatterCount = 0;
    this.previousInput = { ...NEUTRAL_INPUT };
    this.lastInput = { ...NEUTRAL_INPUT };
    this.hash = 2_166_136_261;
    this.lastTarget = this.ai.getTarget(this.createAIState());
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
    const progressRatio = clamp(this.stepIndex / this.scenario.maxSteps, 0, 1);
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
      this.status = "completed";
      this.message = "시나리오 완료 · 결과 지표와 결정성 해시를 확인하십시오.";
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
    const speedError = current.speedMps - this.lastTarget.targetSpeedMps;
    const overspeedMps = Math.max(0, speedError);

    this.stepIndex += 1;
    this.elapsedSeconds += dtSeconds;
    this.lateralErrorSquaredSum += lateralError * lateralError;
    this.speedErrorSquaredSum += speedError * speedError;
    this.lateralErrorsM.push(Math.abs(lateralError));
    this.speedErrorsMps.push(Math.abs(speedError));
    this.maximumLateralErrorM = Math.max(this.maximumLateralErrorM, Math.abs(lateralError));
    this.brakeOverspeedMps = Math.max(this.brakeOverspeedMps, overspeedMps);
    if (!location.onTrack) this.offTrackCount += 1;
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
      this.status = "failed";
      this.message = "실패 · 유한하지 않은 물리 상태가 감지되었습니다.";
    } else if (this.stepIndex >= this.scenario.maxSteps) {
      this.status = "completed";
      this.message = "시나리오 완료 · 결과 지표와 결정성 해시를 확인하십시오.";
    }
  }

  /** 레이싱 라인 목표점과 현재 pose에서 최신 횡오차를 계산한다. */
  private currentLateralErrorM(): number {
    return lateralErrorM(this.simulation.current.position, this.lastTarget, this.simulation.current.yawRad);
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
