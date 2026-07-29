/**
 * M5 결정적 레이스 리플레이의 순수 데이터·검증 경계다.
 * React, R3F, Rapier 장면을 참조하지 않고 RaceSession의 120Hz 입력과 digest만 기록해
 * 같은 초기 상태에서 동일한 물리·운영 결과가 재생되는지를 검증한다.
 */
import type { VehicleControlInput } from "../../game/input/VehicleControlInput";
import {
  createRaceDeterminismDigest,
  type RaceSession,
  type RaceSessionSnapshot,
} from "./RaceSession";

/** 저장 파일과 메모리 구조가 호환되는지 판별하는 M5 replay schema 버전이다. */
export const RACE_REPLAY_SCHEMA_VERSION = "s1-racing-replay-v1" as const;

/** 물리 도메인이 목표로 하는 fixed-step 주파수(Hz)다. */
export const RACE_REPLAY_FIXED_STEP_HZ = 120 as const;

/** 리플레이 캡처의 현재 UI 상태다. */
export type RaceReplayStatus = "idle" | "recording" | "ready" | "loaded";

/** 리플레이 검증이 아직 실행되지 않았거나 성공·실패한 상태다. */
export type RaceReplayVerificationStatus = "not-run" | "passed" | "failed";

/** 한 fixed-step에 플레이어가 생성한 입력과 그 직후의 결정성 digest다. */
export interface RaceReplayFrame {
  /** 1부터 시작하는 RaceSession fixed-step 번호다. */
  stepIndex: number;
  /** 해당 step에서 RaceSession에 전달된 입력의 복사본이다. */
  input: VehicleControlInput;
  /** 입력 적용 직후 RaceSession 상태의 기준 digest다. */
  digest: string;
}

/** 재생 세션을 구성할 때 필요한 결정성 계약 메타데이터다. */
export interface RaceReplayMetadata {
  /** 저장 포맷의 호환성 버전이다. */
  schemaVersion: typeof RACE_REPLAY_SCHEMA_VERSION;
  /** 입력을 기록한 트랙 데이터 이름이다. */
  trackName: string;
  /** 레이스가 완료해야 하는 랩 수다. */
  totalLaps: number;
  /** 레코딩 당시 참가 차량 수다. */
  participantCount: number;
  /** 기록과 재생이 공유해야 하는 fixed-step 주파수다. */
  fixedStepHz: typeof RACE_REPLAY_FIXED_STEP_HZ;
  /** 레이스 시작 직전 grid snapshot의 digest다. */
  initialDigest: string;
}

/** 입력 프레임과 시작·종료 상태를 묶은 저장 가능한 replay 문서다. */
export interface RaceReplayRecording {
  metadata: RaceReplayMetadata;
  frames: readonly RaceReplayFrame[];
  finalDigest: string;
  finalStatus: RaceSessionSnapshot["status"];
}

/** 화면이 리플레이 캡처·저장 상태를 표시하기 위한 읽기 전용 스냅샷이다. */
export interface RaceReplaySnapshot {
  status: RaceReplayStatus;
  frameCount: number;
  fixedStepHz: typeof RACE_REPLAY_FIXED_STEP_HZ;
  initialDigest?: string;
  finalDigest?: string;
  verification: RaceReplayVerificationStatus;
  mismatchStepIndex?: number;
}

/** 재생 중 처음 발견한 불일치와 기대·실제 digest를 설명한다. */
export interface RaceReplayMismatch {
  stepIndex: number;
  expectedDigest: string;
  actualDigest: string;
  reason: "metadata" | "initial-digest" | "step-digest" | "final-digest";
}

/** 한 replay 문서의 재생 결과다. 첫 불일치 이후에는 추가 상태를 추측하지 않는다. */
export interface RaceReplayVerificationResult {
  matched: boolean;
  frameCount: number;
  finalDigest: string;
  mismatch?: RaceReplayMismatch;
}

/** 입력을 안전하게 복사해 외부 변경이 과거 프레임을 바꾸지 않게 한다. */
function cloneInput(input: VehicleControlInput): VehicleControlInput {
  return {
    steering: input.steering,
    throttle: input.throttle,
    brake: input.brake,
    clutch: input.clutch,
    shiftUp: input.shiftUp,
    shiftDown: input.shiftDown,
    overtakeMode: input.overtakeMode,
    activeAero: input.activeAero,
  };
}

/** replay 입력이 유한한 수치와 프로젝트 입력 범위를 유지하는지 확인한다. */
function validateInput(input: VehicleControlInput, label: string): void {
  const analogValues = [input.steering, input.throttle, input.brake, input.clutch];
  if (analogValues.some((value) => !Number.isFinite(value) || value < -1 || value > 1)) {
    throw new Error(label + " contains an analog value outside -1..1");
  }
}

/** replay frame이 fixed-step 순서를 보존하는지 확인한다. */
function validateFrame(frame: RaceReplayFrame, expectedStepIndex: number): void {
  if (!Number.isInteger(frame.stepIndex) || frame.stepIndex !== expectedStepIndex) {
    throw new Error("Replay frame stepIndex must increase from 1 without gaps");
  }
  validateInput(frame.input, "Replay frame input");
  if (!/^[0-9a-f]{8}$/u.test(frame.digest)) throw new Error("Replay frame digest must be an 8-character hexadecimal string");
}

/** RaceSession 시작 상태에서 M5 metadata를 구성한다. */
function createMetadata(snapshot: RaceSessionSnapshot): RaceReplayMetadata {
  return {
    schemaVersion: RACE_REPLAY_SCHEMA_VERSION,
    trackName: snapshot.trackName,
    totalLaps: snapshot.totalLaps,
    participantCount: snapshot.participantCount,
    fixedStepHz: RACE_REPLAY_FIXED_STEP_HZ,
    initialDigest: createRaceDeterminismDigest(snapshot),
  };
}

/** RaceSession fixed-step 입력을 replay 문서로 누적하는 순수 recorder다. */
export class RaceReplayRecorder {
  private readonly metadata: RaceReplayMetadata;
  private readonly frames: RaceReplayFrame[] = [];
  private status: RaceReplayStatus = "recording";
  private finalDigest: string | undefined;
  private finalStatus: RaceSessionSnapshot["status"] | undefined;

  /** grid 상태를 시작점으로 하는 새 recorder를 만든다. */
  constructor(initialSnapshot: RaceSessionSnapshot) {
    if (initialSnapshot.status !== "grid") throw new Error("Replay recording must start from a grid snapshot");
    this.metadata = createMetadata(initialSnapshot);
  }

  /** 한 fixed-step 입력과 직후 snapshot digest를 기록한다. */
  recordStep(input: VehicleControlInput, snapshot: RaceSessionSnapshot): void {
    if (this.status !== "recording") throw new Error("Replay recorder is not recording");
    const stepIndex = this.frames.length + 1;
    validateInput(input, "Replay input");
    if (snapshot.stepIndex !== stepIndex) throw new Error("Replay snapshot stepIndex does not match the recorded frame");
    const digest = createRaceDeterminismDigest(snapshot);
    this.frames.push({ stepIndex, input: cloneInput(input), digest });
  }

  /** 레이스 종료 snapshot을 저장하고 immutable recording으로 닫는다. */
  finish(snapshot: RaceSessionSnapshot): RaceReplayRecording {
    if (this.status !== "recording") throw new Error("Replay recorder is already finalized");
    this.finalDigest = createRaceDeterminismDigest(snapshot);
    this.finalStatus = snapshot.status;
    this.status = "ready";
    return this.getRecording();
  }

  /** 현재 캡처 상태를 UI에 표시한다. */
  getSnapshot(): RaceReplaySnapshot {
    return {
      status: this.status,
      frameCount: this.frames.length,
      fixedStepHz: this.metadata.fixedStepHz,
      initialDigest: this.metadata.initialDigest,
      finalDigest: this.finalDigest,
      verification: "not-run",
    };
  }

  /** 완료된 recording을 외부 mutation 없이 반환한다. */
  getRecording(): RaceReplayRecording {
    if (this.status !== "ready" || !this.finalDigest || !this.finalStatus) {
      throw new Error("Replay recording is not finalized");
    }
    return {
      metadata: { ...this.metadata },
      frames: this.frames.map((frame) => ({ ...frame, input: cloneInput(frame.input) })),
      finalDigest: this.finalDigest,
      finalStatus: this.finalStatus,
    };
  }
}

/** replay 문서를 사람이 읽고 파일로 저장할 수 있는 안정적인 JSON으로 직렬화한다. */
export function serializeRaceReplay(recording: RaceReplayRecording): string {
  validateRaceReplayRecording(recording);
  return JSON.stringify(recording, null, 2);
}

/** JSON 문자열을 검증된 replay 문서로 파싱한다. */
export function parseRaceReplay(serialized: string): RaceReplayRecording {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error("Replay JSON is not valid JSON");
  }
  validateRaceReplayRecording(parsed);
  return parsed;
}

/** 외부에서 읽은 unknown 값이 M5 replay 계약을 모두 만족하는지 확인한다. */
export function validateRaceReplayRecording(value: unknown): asserts value is RaceReplayRecording {
  if (!value || typeof value !== "object") throw new Error("Replay document must be an object");
  const recording = value as Partial<RaceReplayRecording> & { metadata?: Partial<RaceReplayMetadata> };
  const metadata = recording.metadata;
  if (!metadata || metadata.schemaVersion !== RACE_REPLAY_SCHEMA_VERSION) throw new Error("Unsupported replay schema version");
  if (typeof metadata.trackName !== "string" || metadata.trackName.length === 0) throw new Error("Replay trackName is required");
  if (!Number.isInteger(metadata.totalLaps) || metadata.totalLaps < 1) throw new Error("Replay totalLaps is invalid");
  if (!Number.isInteger(metadata.participantCount) || metadata.participantCount < 2) throw new Error("Replay participantCount is invalid");
  if (metadata.fixedStepHz !== RACE_REPLAY_FIXED_STEP_HZ) throw new Error("Replay fixedStepHz is unsupported");
  if (typeof metadata.initialDigest !== "string" || !/^[0-9a-f]{8}$/u.test(metadata.initialDigest)) throw new Error("Replay initialDigest is invalid");
  if (!Array.isArray(recording.frames)) throw new Error("Replay frames must be an array");
  recording.frames.forEach((frame, index) => validateFrame(frame, index + 1));
  if (typeof recording.finalDigest !== "string" || !/^[0-9a-f]{8}$/u.test(recording.finalDigest)) throw new Error("Replay finalDigest is invalid");
  if (recording.finalStatus !== "finished" && recording.finalStatus !== "running" && recording.finalStatus !== "paused" && recording.finalStatus !== "grid") {
    throw new Error("Replay finalStatus is invalid");
  }
}

/** 같은 grid·설정에서 replay 입력을 재생하고 첫 digest 불일치를 반환한다. */
export function verifyRaceReplay(
  session: RaceSession,
  recording: RaceReplayRecording,
): RaceReplayVerificationResult {
  validateRaceReplayRecording(recording);
  const initialSnapshot = session.getSnapshot();
  const expectedMetadata = recording.metadata;
  const metadataMatches = initialSnapshot.trackName === expectedMetadata.trackName
    && initialSnapshot.totalLaps === expectedMetadata.totalLaps
    && initialSnapshot.participantCount === expectedMetadata.participantCount;
  if (!metadataMatches) {
    return {
      matched: false,
      frameCount: 0,
      finalDigest: createRaceDeterminismDigest(initialSnapshot),
      mismatch: {
        stepIndex: 0,
        expectedDigest: expectedMetadata.initialDigest,
        actualDigest: createRaceDeterminismDigest(initialSnapshot),
        reason: "metadata",
      },
    };
  }

  const initialDigest = createRaceDeterminismDigest(initialSnapshot);
  if (initialDigest !== expectedMetadata.initialDigest) {
    return {
      matched: false,
      frameCount: 0,
      finalDigest: initialDigest,
      mismatch: {
        stepIndex: 0,
        expectedDigest: expectedMetadata.initialDigest,
        actualDigest: initialDigest,
        reason: "initial-digest",
      },
    };
  }

  session.start();
  for (const frame of recording.frames) {
    const snapshot = session.step(frame.input);
    const actualDigest = createRaceDeterminismDigest(snapshot);
    if (actualDigest !== frame.digest) {
      return {
        matched: false,
        frameCount: frame.stepIndex,
        finalDigest: actualDigest,
        mismatch: {
          stepIndex: frame.stepIndex,
          expectedDigest: frame.digest,
          actualDigest,
          reason: "step-digest",
        },
      };
    }
  }

  const finalSnapshot = session.getSnapshot();
  const finalDigest = createRaceDeterminismDigest(finalSnapshot);
  if (finalDigest !== recording.finalDigest) {
    return {
      matched: false,
      frameCount: recording.frames.length,
      finalDigest,
      mismatch: {
        stepIndex: finalSnapshot.stepIndex,
        expectedDigest: recording.finalDigest,
        actualDigest: finalDigest,
        reason: "final-digest",
      },
    };
  }
  return { matched: true, frameCount: recording.frames.length, finalDigest };
}

/** 완료된 recording을 UI용 loaded 상태로 변환한다. */
export function getLoadedReplaySnapshot(recording: RaceReplayRecording): RaceReplaySnapshot {
  validateRaceReplayRecording(recording);
  return {
    status: "loaded",
    frameCount: recording.frames.length,
    fixedStepHz: recording.metadata.fixedStepHz,
    initialDigest: recording.metadata.initialDigest,
    finalDigest: recording.finalDigest,
    verification: "not-run",
  };
}
