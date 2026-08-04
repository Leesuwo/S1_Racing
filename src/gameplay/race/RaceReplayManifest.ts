/**
 * M6 독립 replay를 구성하는 차량·AI·트랙·운영 설정 manifest다.
 * digest 프레임만으로는 새 RaceSession을 만들 수 없으므로, 모든 실행 전제는 이 문서에
 * 명시적으로 고정하고 JSON 검증에서 누락을 거부한다.
 */
import type { VehicleSetupPresetId } from "../../game/physics/VehicleSetup";
import type { TyreCompound } from "../../game/physics/TyreCondition";
import type { RaceFuelPlan } from "./RaceFuel";

/** manifest 자체의 구조 호환성 버전이다. */
export const RACE_REPLAY_MANIFEST_VERSION = "s1-racing-race-manifest-v1" as const;

/** replay를 독립 재구성하는 데 필요한 한 참가자의 시작 정의다. */
export interface RaceReplayParticipantManifest {
  id: string;
  label: string;
  kind: "player" | "ai";
  gridSlot: number;
  startPositionM: { x: number; z: number };
  startYawRad: number;
  aiProfileId?: string;
  aiConfig?: Record<string, number | boolean | undefined>;
}

/** M6 replay가 저장하는 고정 실행 전제다. */
export interface RaceReplayManifest {
  schemaVersion: typeof RACE_REPLAY_MANIFEST_VERSION;
  trackId: "test-track-v1";
  trackName: string;
  vehicleDefinitionId: "s1-open-wheel-v1";
  rulesetVersion: "s1-race-regulations-v1";
  totalLaps: number;
  /** 세션이 종료로 수렴하는 fixed-step 상한이다. 독립 재생도 같은 종료 경계를 사용한다. */
  maxSteps: number;
  fixedStepHz: 120;
  sessionSeed: number;
  vehicleSetupId: VehicleSetupPresetId;
  /** 시작 타이어와 선택적 피트 교체는 digest와 결과에 영향을 주므로 명시적으로 보존한다. */
  tyrePlan: {
    startCompound: TyreCompound;
    pitStopLap?: number;
    pitStopCompound?: TyreCompound;
  };
  fuelPlan: RaceFuelPlan;
  participants: readonly RaceReplayParticipantManifest[];
}

/** FNV-1a로 manifest 내용을 정렬된 문자열에 고정한다. 보안 해시가 아닌 회귀 식별자다. */
export function createRaceReplayManifestDigest(manifest: RaceReplayManifest): string {
  const values = [
    manifest.schemaVersion,
    manifest.trackId,
    manifest.trackName,
    manifest.vehicleDefinitionId,
    manifest.rulesetVersion,
    String(manifest.totalLaps),
    String(manifest.maxSteps),
    String(manifest.fixedStepHz),
    String(manifest.sessionSeed),
    manifest.vehicleSetupId,
    manifest.tyrePlan.startCompound,
    String(manifest.tyrePlan.pitStopLap ?? ""),
    manifest.tyrePlan.pitStopCompound ?? "",
    manifest.fuelPlan.startFuelKg.toFixed(6),
    manifest.fuelPlan.pitRefuelKg.toFixed(6),
    manifest.fuelPlan.fullThrottleConsumptionKgPerSecond.toFixed(9),
    ...manifest.participants.flatMap((participant) => [
      participant.id,
      participant.label,
      participant.kind,
      String(participant.gridSlot),
      participant.startPositionM.x.toFixed(6),
      participant.startPositionM.z.toFixed(6),
      participant.startYawRad.toFixed(6),
      participant.aiProfileId ?? "",
      JSON.stringify(participant.aiConfig ?? {}),
    ]),
  ];
  let hash = 2166136261;
  values.join("|").split("").forEach((character) => {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  });
  return hash.toString(16).padStart(8, "0");
}

/** 외부 JSON이 독립 RaceSession 생성에 필요한 모든 manifest 필드를 갖췄는지 확인한다. */
export function validateRaceReplayManifest(value: unknown): asserts value is RaceReplayManifest {
  if (!value || typeof value !== "object") throw new Error("Replay manifest must be an object");
  const manifest = value as Partial<RaceReplayManifest>;
  if (manifest.schemaVersion !== RACE_REPLAY_MANIFEST_VERSION) throw new Error("Unsupported replay manifest version");
  if (manifest.trackId !== "test-track-v1" || typeof manifest.trackName !== "string" || manifest.trackName.length === 0) {
    throw new Error("Replay manifest track is invalid");
  }
  if (manifest.vehicleDefinitionId !== "s1-open-wheel-v1" || manifest.rulesetVersion !== "s1-race-regulations-v1") {
    throw new Error("Replay manifest vehicle or ruleset is unsupported");
  }
  const totalLaps = manifest.totalLaps;
  if (!Number.isInteger(totalLaps) || totalLaps === undefined || totalLaps < 1
    || !Number.isInteger(manifest.maxSteps) || manifest.maxSteps === undefined || manifest.maxSteps < 1
    || manifest.fixedStepHz !== 120) {
    throw new Error("Replay manifest session definition is invalid");
  }
  if (!Number.isInteger(manifest.sessionSeed)) throw new Error("Replay manifest seed is invalid");
  if (manifest.vehicleSetupId !== "low-downforce" && manifest.vehicleSetupId !== "balanced" && manifest.vehicleSetupId !== "high-downforce") {
    throw new Error("Replay manifest setup is invalid");
  }
  const tyrePlan = manifest.tyrePlan;
  const isTyreCompound = (compound: unknown): compound is TyreCompound => (
    compound === "soft" || compound === "medium" || compound === "hard"
  );
  if (!tyrePlan || !isTyreCompound(tyrePlan.startCompound)
    || (tyrePlan.pitStopLap !== undefined && (!Number.isInteger(tyrePlan.pitStopLap) || tyrePlan.pitStopLap < 1))
    || (tyrePlan.pitStopCompound !== undefined && !isTyreCompound(tyrePlan.pitStopCompound))) {
    throw new Error("Replay manifest tyre plan is invalid");
  }
  const fuelPlan = manifest.fuelPlan;
  if (!fuelPlan || !Number.isFinite(fuelPlan.startFuelKg) || !Number.isFinite(fuelPlan.pitRefuelKg) || !Number.isFinite(fuelPlan.fullThrottleConsumptionKgPerSecond)) {
    throw new Error("Replay manifest fuel plan is invalid");
  }
  if (!Array.isArray(manifest.participants) || manifest.participants.length < 2) throw new Error("Replay manifest participants are invalid");
  manifest.participants.forEach((participant) => {
    if (!participant || typeof participant.id !== "string" || typeof participant.label !== "string") throw new Error("Replay manifest participant is invalid");
    if (participant.kind !== "player" && participant.kind !== "ai") throw new Error("Replay manifest participant kind is invalid");
    if (!Number.isInteger(participant.gridSlot) || !participant.startPositionM || !Number.isFinite(participant.startPositionM.x)
      || !Number.isFinite(participant.startPositionM.z) || !Number.isFinite(participant.startYawRad)) {
      throw new Error("Replay manifest participant pose is invalid");
    }
  });
}
