/**
 * 주행 모드와 AI Training Lab을 선택하는 최상위 React 셸이다.
 * 물리·교육 상태는 각각 장면과 실행기가 소유하고, 이 컴포넌트는 읽기 전용 스냅샷과
 * 사용자 조작 명령만 연결한다.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { BrowserVehicleInput } from "../game/input/BrowserVehicleInput";
import { VEHICLE_INPUT_PRESETS, type VehicleInputPresetId } from "../game/input/InputPreset";
import {
  AI_TRAINING_SCENARIOS,
  AITrainingRunner,
  type AITrainingScenarioId,
  type AITrainingFailure,
  type AITrainingSnapshot,
} from "../gameplay/training/AITrainingRunner";
import {
  searchAITrainingConfig,
  type AITrainingSearchResult,
} from "../gameplay/training/AITrainingEvaluator";
import type { SingleOpponentAIConfig } from "../gameplay/ai/SingleOpponentAI";
import {
  createAITrainingResultDocument,
  serializeAITrainingResult,
} from "../gameplay/training/AITrainingResult";
import { zeroWheelValues } from "../game/physics/Suspension";
import type { RapierSuspensionTelemetry } from "../game/physics/RapierChassisSuspension";
import type { VehicleTelemetry } from "../game/physics/VehicleSimulation";
import { createInitialTyreCondition, getTyreConditionSnapshot, type TyreConditionSnapshot } from "../game/physics/TyreCondition";
import { TrackLimitsMonitor, type TrackLimitsSnapshot } from "../gameplay/race/TrackLimits";
import { detectWebGL2, type WebGL2Support } from "./webgl2";
import {
  DESIGN_STUDIO_PAINTS,
  type DesignStudioPaintId,
  type DesignStudioView,
} from "./DesignStudioConfig";
import {
  RaceWeekendSession,
  type RaceStrategy,
  type RaceWeekendSnapshot,
  type TyreCompound,
} from "../gameplay/race/RaceWeekendSession";
import { parseRaceReplay, serializeRaceReplay } from "../gameplay/race/RaceReplay";

/**
 * 각 WebGL 모드는 선택 시점에만 내려받는다. 초기 Training 화면이 Race Weekend의 Rapier와
 * 디자인 스튜디오의 OrbitControls를 함께 파싱하지 않도록 해 첫 진입 정지 시간을 줄인다.
 */
const DrivingScene = lazy(async () => ({ default: (await import("./DrivingScene")).DrivingScene }));
const TrainingScene = lazy(async () => ({ default: (await import("./TrainingScene")).TrainingScene }));
const RaceWeekendScene = lazy(async () => ({ default: (await import("./RaceWeekendScene")).RaceWeekendScene }));
const DesignStudioScene = lazy(async () => ({ default: (await import("./DesignStudioScene")).DesignStudioScene }));
const DesignStudioPanel = lazy(async () => ({ default: (await import("./DesignStudioPanel")).DesignStudioPanel }));
const RaceWeekendPanel = lazy(async () => ({ default: (await import("./RaceWeekendPanel")).RaceWeekendPanel }));

/** M3B 타이어 HUD가 물리 초기화 전에도 유한한 상태를 표시하도록 하는 시작값이다. */
const INITIAL_TYRE_CONDITION: TyreConditionSnapshot = getTyreConditionSnapshot(createInitialTyreCondition());

/** WebGL 초기화 전후의 일반 주행 HUD가 사용할 유한한 중립 텔레메트리다. */
const INITIAL_TELEMETRY: VehicleTelemetry = {
  speedKmh: 0,
  rpm: 900,
  redlineRpm: 8_000,
  gear: 1,
  throttle: 0,
  brake: 0,
  steering: 0,
  surface: "asphalt",
  lateralG: 0,
  downforceN: 0,
  dragForceN: 0,
  engineForceN: 0,
  engineTorqueNm: 0,
  driveTorqueNm: 0,
  engineBrakeTorqueNm: 0,
  wheelLoadsN: zeroWheelValues(),
  wheelCompressionM: zeroWheelValues(),
  trackSectionId: "start-straight",
  trackSectionLabel: "스타트 직선",
  onTrack: true,
  distanceToBoundaryM: 4,
  tyreCondition: INITIAL_TYRE_CONDITION,
};

/** M3A 트랙 리밋 HUD가 WebGL 초기화 전에도 유한한 값을 표시하도록 하는 시작 상태다. */
const INITIAL_TRACK_LIMITS: TrackLimitsSnapshot = new TrackLimitsMonitor().getSnapshot();

/** 속도·RPM·힘처럼 단위가 있는 HUD 숫자를 한국어 로케일로 표시한다. */
function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString("ko-KR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

/** 교육 실행기의 상태를 UI에서 짧은 상태명으로 표시한다. */
function trainingStatusLabel(status: AITrainingSnapshot["status"]): string {
  const labels: Record<AITrainingSnapshot["status"], string> = {
    idle: "대기",
    running: "교육 중",
    paused: "일시정지",
    completed: "완료",
    failed: "실패",
  };
  return labels[status];
}

/** 레이스 주말 단계 상태를 헤더 칩에서 짧게 표시한다. */
function weekendStatusLabel(snapshot: RaceWeekendSnapshot): string {
  if (snapshot.stage === "practice") return "연습 준비";
  if (snapshot.stage === "qualifying") return snapshot.status === "complete" ? "퀄리파잉 완료" : "퀄리파잉 진행";
  if (snapshot.stage === "race") return snapshot.status === "running" ? "레이스 진행 중" : "레이스 대기";
  return "결과 확인";
}

/** 플레이어 물리 지표와 AI 상대의 진행 상태를 표시하는 읽기 전용 HUD다. */
function AppTelemetry({
  telemetry,
  opponentTelemetry,
  suspensionTelemetry,
  trackLimits,
  opponentTrackLimits,
}: {
  telemetry: VehicleTelemetry;
  opponentTelemetry: VehicleTelemetry;
  suspensionTelemetry: RapierSuspensionTelemetry | null;
  trackLimits: TrackLimitsSnapshot;
  opponentTrackLimits: TrackLimitsSnapshot;
}) {
  // redline 대비 현재 RPM을 0..1 바 너비로 변환한다.
  const rpmRatio = Math.min(1, telemetry.rpm / telemetry.redlineRpm);

  return (
    <div className="telemetry-hud" aria-label="차량 텔레메트리">
      <div className="speed-readout">
        <strong>{formatNumber(telemetry.speedKmh)}</strong>
        <span>km/h</span>
      </div>
      <div className="gear-readout">
        <span>GEAR</span>
        <strong>{telemetry.gear}</strong>
      </div>
      <div className="rpm-readout">
        <div className="rpm-label">
          <span>RPM</span>
          <span>{formatNumber(telemetry.rpm)}</span>
        </div>
        <div className="rpm-bar" aria-label={"RPM " + formatNumber(telemetry.rpm)}>
          <span style={{ width: String(rpmRatio * 100) + "%" }} />
        </div>
      </div>
      <div className="surface-readout">
        <span>노면</span>
        <strong>{telemetry.surface === "asphalt" ? "아스팔트" : "잔디"}</strong>
      </div>
      <div className="surface-readout">
        <span>트랙 구간</span>
        <strong>{telemetry.trackSectionLabel}</strong>
      </div>
      <div className="surface-readout">
        <span>트랙 경계</span>
        <strong className={telemetry.onTrack ? "track-status--valid" : "track-status--off"}>
          {telemetry.onTrack
            ? "유효 · " + formatNumber(telemetry.distanceToBoundaryM, 1) + " m"
            : "이탈 · 리셋 권장"}
        </strong>
      </div>
      <div className="surface-readout">
        <span>트랙 리밋</span>
        <strong className={trackLimits.lapValid ? "track-status--valid" : "track-status--off"}>
          {trackLimits.violationCount}회 · 패널티 {formatNumber(trackLimits.penaltySeconds, 2)} s
        </strong>
      </div>
      <div className="surface-readout">
        <span>타이어 상태</span>
        <strong>
          {telemetry.tyreCondition.compound.toUpperCase()} · {formatNumber(telemetry.tyreCondition.averageTemperatureC, 0)} °C ·
          {" "}{formatNumber(telemetry.tyreCondition.averageWearRatio * 100, 1)}% 마모
        </strong>
      </div>
      <div className="surface-readout ai-readout">
        <span>AI 상대</span>
        <strong>{formatNumber(opponentTelemetry.speedKmh)} km/h · {opponentTelemetry.trackSectionLabel}</strong>
      </div>
      <div className="wheel-load-readout">
        <span>휠 하중 / N</span>
        <div>
          <b>FL {formatNumber(telemetry.wheelLoadsN.frontLeft)}</b>
          <b>FR {formatNumber(telemetry.wheelLoadsN.frontRight)}</b>
          <b>RL {formatNumber(telemetry.wheelLoadsN.rearLeft)}</b>
          <b>RR {formatNumber(telemetry.wheelLoadsN.rearRight)}</b>
        </div>
      </div>
      <div className="surface-readout">
        <span>Rapier 접지</span>
        <strong>
          {suspensionTelemetry
            ? String(suspensionTelemetry.groundedWheelCount) + "/4 · "
              + formatNumber(suspensionTelemetry.chassisHeightM, 3) + " m · 공력 "
              + formatNumber(suspensionTelemetry.downforceN) + " N"
            : "초기화 중"}
        </strong>
      </div>
      <div className="surface-readout">
        <span>벽·연석 접촉</span>
        <strong>
          {suspensionTelemetry
            ? "벽 " + suspensionTelemetry.wallContactCount + " · 연석 " + suspensionTelemetry.curbContactCount
            : "초기화 중"}
        </strong>
      </div>
      <div className="surface-readout ai-readout">
        <span>AI 트랙 리밋</span>
        <strong>{opponentTrackLimits.violationCount}회 · {opponentTrackLimits.lapValid ? "유효" : "무효"}</strong>
      </div>
    </div>
  );
}
/** AI 교육 상태·진행률·현재 목표를 장면 위에 겹쳐 표시한다. */
function TrainingOverlay({ snapshot }: { snapshot: AITrainingSnapshot }) {
  return (
    <div className="training-overlay" aria-label="AI 교육 상태">
      <div className="training-overlay__kicker">LIVE EPISODE / 120 HZ</div>
      <div className="training-overlay__heading">
        <div>
          <span>AI TRAINING LAB</span>
          <strong>{snapshot.scenario.label}</strong>
        </div>
        <b className={"training-state training-state--" + snapshot.status}>
          {trainingStatusLabel(snapshot.status)}
        </b>
      </div>
      <div
        className="training-progress"
        aria-label={(snapshot.scenario.id === "full-lap" ? "실제 트랙 진행률 " : "교육 진행률 ")
          + Math.round(snapshot.progressRatio * 100) + "%"}
      >
        <span style={{ width: String(snapshot.progressRatio * 100) + "%" }} />
      </div>
      <div className="training-overlay__row">
        <span>{snapshot.scenario.id === "full-lap" ? "실제 트랙 진행" : snapshot.trackName}</span>
        <b>{Math.round(snapshot.progressRatio * 100)}%</b>
      </div>
      {snapshot.scenario.id === "full-lap" && (
        <>
          <div className="training-lap-distance" aria-label="실제 트랙 진행 거리">
            <span>{formatNumber(Math.max(0, snapshot.lapProgressM), 1)} m / {formatNumber(snapshot.trackLengthM, 1)} m</span>
            <span>역주행 시 진행률 감소</span>
          </div>
          <div className="training-start-finish" aria-label="출발선과 도착선">
            <span><b>START</b> 출발선</span>
            <i aria-hidden="true" />
            <span><b>FINISH</b> 결승선 재통과</span>
          </div>
        </>
      )}
      <p>{snapshot.message}</p>
    </div>
  );
}

/** AI 교육의 제어 입력과 평가 지표를 읽기 쉬운 카드 그리드로 표시한다. */
function TrainingMetrics({ snapshot }: { snapshot: AITrainingSnapshot }) {
  return (
    <section className="training-dashboard" aria-label="AI 교육 지표">
      <div className="training-dashboard__header">
        <div>
          <span className="section-kicker">OBSERVABILITY / RUN METRICS</span>
          <h2>교육 주행을 관찰하십시오</h2>
        </div>
        <span className="training-integrity">VehicleControlInput → VehicleSimulation</span>
      </div>
      <div className="training-metric-grid">
        <article className="training-metric training-metric--primary">
          <span>현재 속도</span>
          <strong>{formatNumber(snapshot.speedMps * 3.6, 1)} <small>km/h</small></strong>
          <em>목표 {formatNumber(snapshot.targetSpeedMps * 3.6, 1)} km/h</em>
        </article>
        <article className="training-metric">
          <span>속도 오차</span>
          <strong>{formatNumber(snapshot.speedErrorMps * 3.6, 1)} <small>km/h</small></strong>
          <em>RMS {formatNumber(snapshot.speedErrorRmsMps * 3.6, 1)} · P95 {formatNumber(snapshot.speedErrorP95Mps * 3.6, 1)} km/h</em>
        </article>
        <article className="training-metric">
          <span>횡오차 RMS</span>
          <strong>{formatNumber(snapshot.lateralErrorRmsM, 2)} <small>m</small></strong>
          <em>P95 {formatNumber(snapshot.lateralErrorP95M, 2)} · 최대 {formatNumber(snapshot.maximumLateralErrorM, 2)} m</em>
        </article>
        <article className="training-metric">
          <span>차체 슬립</span>
          <strong>{formatNumber(Math.abs(snapshot.bodySlipAngleRad) * 180 / Math.PI, 1)} <small>°</small></strong>
          <em>최대 {formatNumber(snapshot.maximumBodySlipAngleRad * 180 / Math.PI, 1)}° · 한계 3.4°</em>
        </article>
        <article className="training-metric">
          <span>트랙 이탈</span>
          <strong>{formatNumber(snapshot.offTrackCount)} <small>회</small></strong>
          <em>{snapshot.checkpointIndex}/{snapshot.totalCheckpointCount} checkpoint · 통과 {snapshot.checkpointCount}</em>
        </article>
        <article className="training-metric">
          <span>제어 채터링</span>
          <strong>{formatNumber(snapshot.inputChatterCount)} <small>회</small></strong>
          <em>조향 {formatNumber(snapshot.input.steering, 2)} · 스로틀 {formatNumber(snapshot.input.throttle, 2)}</em>
        </article>
        <article className="training-metric training-metric--hash">
          <span>결정성 해시</span>
          <strong>{snapshot.determinismHash}</strong>
          <em>{formatNumber(snapshot.elapsedSeconds, 2)} s · step {snapshot.stepIndex}/{snapshot.maxSteps}</em>
        </article>
      </div>
    </section>
  );
}

/** 완료된 에피소드 뒤에 결정적으로 비교한 후보 설정의 자동 적용 결과다. */
function TrainingSearchSummary({
  result,
  onSave,
}: {
  result: AITrainingSearchResult & {
    applied: boolean;
    failure?: AITrainingFailure;
    completedSnapshot: AITrainingSnapshot;
  };
  onSave: () => void;
}) {
  // 낮을수록 좋은 점수의 기준 대비 개선률을 0% 아래로 내려가지 않게 표시한다.
  const improvementRatio = result.baseline.totalScore > 0
    ? Math.max(0, (result.baseline.totalScore - result.best.totalScore) / result.baseline.totalScore)
    : 0;

  return (
    <section className="training-search" aria-label="AI 파라미터 학습 결과">
      <div className="training-search__header">
        <div>
          <span className="section-kicker">AUTOMATIC TUNING / CONFIG UPDATE</span>
          <h2>{result.applied ? "개선 설정을 자동 적용했습니다" : "현재 설정을 유지했습니다"}</h2>
        </div>
      </div>
      <div className="training-search__grid">
        <article>
          <span>기준 점수</span>
          <strong>{formatNumber(result.baseline.totalScore, 1)}</strong>
          <em>현재 기본 설정</em>
        </article>
        <article className="training-search__best">
          <span>최고 점수</span>
          <strong>{formatNumber(result.best.totalScore, 1)}</strong>
          <em>{formatNumber(improvementRatio * 100, 1)}% 개선 · 트랙 이탈 {formatNumber(result.best.offTrackCount)}회</em>
        </article>
        <article>
          <span>탐색 후보</span>
          <strong>{formatNumber(result.candidates.length)} <small>개</small></strong>
          <em>동일 시나리오·동일 물리 조건</em>
        </article>
      </div>
      <p className="training-search__note">
        {result.applied
          ? "완료된 교육 뒤에 현재 설정보다 낮은 점수의 후보만 자동 적용했습니다. 다음 교육은 이 설정을 사용합니다."
          : "완료된 교육 뒤에 현재 설정보다 낮은 점수의 후보가 없어 기존 설정을 유지했습니다."}
      </p>
      <p className="training-search__config">
        최고 설정 · lookahead {formatNumber(result.best.config.lookaheadM, 1)} m · heading {formatNumber(result.best.config.headingGain, 2)} · lateral {formatNumber(result.best.config.lateralGain, 2)} · corner {formatNumber(result.best.config.cornerSpeedScale, 2)}
      </p>
      <button
        type="button"
        className="training-button training-button--save"
        onClick={onSave}
      >
        결과 JSON 저장
      </button>
      {result.failure?.reason === "off-track" && (
        <p className="training-search__failure" aria-label="맵 이탈 학습 사례">
          실패 사례 반영 · {result.failure.sectionLabel}에서 경계 {formatNumber(Math.abs(result.failure.distanceToBoundaryM), 2)} m 초과 · 속도 {formatNumber(result.failure.speedMps * 3.6, 1)} km/h · 횡오차 {formatNumber(Math.abs(result.failure.lateralErrorM), 2)} m
        </p>
      )}
    </section>
  );
}

/** 교육 시나리오·에피소드 시작·수동 관찰을 조작하는 Training Lab 컨트롤 바다. */
function TrainingControls({
  runner,
  snapshot,
  onSnapshot,
  onStart,
}: {
  runner: AITrainingRunner;
  snapshot: AITrainingSnapshot;
  onSnapshot: (nextSnapshot: AITrainingSnapshot) => void;
  onStart: () => void;
}) {
  // 버튼 동작 뒤 장면의 다음 10Hz 샘플을 기다리지 않고 HUD를 즉시 동기화한다.
  const refresh = () => onSnapshot(runner.getSnapshot());
  const isRunning = snapshot.status === "running";

  return (
    <div className="training-controls" aria-label="AI 교육 조작">
      <label className="training-scenario-control">
        <span>교육 시나리오</span>
        <select
          aria-label="교육 시나리오"
          value={snapshot.scenario.id}
          onChange={(event) => {
            runner.setScenario(event.target.value as AITrainingScenarioId);
            refresh();
          }}
        >
          {AI_TRAINING_SCENARIOS.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>{scenario.label}</option>
          ))}
        </select>
      </label>
      <div className="training-button-group">
        <button
          type="button"
          className="training-button training-button--primary"
          onClick={onStart}
        >
          {isRunning ? "훈련 일시정지" : "훈련 시작"}
        </button>
        <button type="button" className="training-button" onClick={() => onSnapshot(runner.stepOnce())}>
          한 스텝
        </button>
        <button
          type="button"
          className="training-button training-button--quiet"
          onClick={() => {
            runner.reset();
            refresh();
          }}
        >
          훈련 리셋
        </button>
      </div>
      <div className="training-control-note">
        <span>관찰 포인트</span>
        <strong>{snapshot.brakePoint ? "BRAKE · amber / APEX · violet / target · cyan" : "APEX · violet / BRAKE · amber / target · cyan"}</strong>
      </div>
    </div>
  );
}

/** 브라우저 기능, 모드 전환, 플레이어·AI·교육 화면을 조합하는 앱 셸이다. */
export function App() {
  // WebGL 초기화 전에는 null로 두어 환경 확인 화면을 표시한다.
  const [webgl, setWebgl] = useState<WebGL2Support | null>(null);
  // Page Visibility 상태는 두 장면의 일시정지 경계가 공유한다.
  const [paused, setPaused] = useState(() => document.hidden);
  // 현재 사용자가 보고 있는 장면 모드이며 교육실을 기본 화면으로 연다.
  const [mode, setMode] = useState<"training" | "drive" | "weekend" | "design">("training");
  // 디자인 검토 장면은 물리와 무관한 UI 상태만 보유한다.
  const [designPaintId, setDesignPaintId] = useState<DesignStudioPaintId>("crimson");
  const [designView, setDesignView] = useState<DesignStudioView>("hero");
  const [designSteeringAngleDeg, setDesignSteeringAngleDeg] = useState(0);
  const [designAutoRotate, setDesignAutoRotate] = useState(true);
  // 플레이어 주행 모드의 마지막 텔레메트리 샘플이다.
  const [telemetry, setTelemetry] = useState(INITIAL_TELEMETRY);
  // AI 상대의 마지막 텔레메트리 샘플이다.
  const [opponentTelemetry, setOpponentTelemetry] = useState(INITIAL_TELEMETRY);
  // Rapier 접지 상태를 표시하는 읽기 전용 텔레메트리다.
  const [suspensionTelemetry, setSuspensionTelemetry] = useState<RapierSuspensionTelemetry | null>(null);
  // 플레이어·AI의 트랙 리밋 이벤트와 현재 랩 유효성을 표시하는 읽기 전용 스냅샷이다.
  const [trackLimits, setTrackLimits] = useState<TrackLimitsSnapshot>(INITIAL_TRACK_LIMITS);
  const [opponentTrackLimits, setOpponentTrackLimits] = useState<TrackLimitsSnapshot>(INITIAL_TRACK_LIMITS);
  // 브라우저 입력 어댑터는 앱 수명 동안 하나만 생성한다.
  const input = useMemo(() => new BrowserVehicleInput(window), []);
  // 입력 프리셋 select와 입력 어댑터의 현재 값을 동기화한다.
  const [inputPreset, setInputPreset] = useState<VehicleInputPresetId>(() => input.getPreset());
  // 교육 실행기는 React 렌더와 분리된 단일 mutable simulation owner다.
  const trainingRunner = useMemo(() => new AITrainingRunner(), []);
  // 주행 모드의 AI는 Training Lab에서 마지막으로 적용된 설정을 읽고, 없으면 기본 설정을 사용한다.
  const [opponentAIConfig, setOpponentAIConfig] = useState<SingleOpponentAIConfig>(
    () => trainingRunner.getAIConfig(),
  );
  // HUD에는 runner가 소유한 내부 객체가 아닌 복사된 스냅샷만 저장한다.
  const [trainingSnapshot, setTrainingSnapshot] = useState<AITrainingSnapshot>(
    () => trainingRunner.getSnapshot(),
  );
  // 후보 탐색이 끝난 뒤에도 기준·최고 설정 비교 결과를 화면에 보존한다.
  const [trainingSearchResult, setTrainingSearchResult] = useState<
    (AITrainingSearchResult & {
      applied: boolean;
      failure?: AITrainingFailure;
      completedSnapshot: AITrainingSnapshot;
    }) | null
  >(null);
  // M2B~M3D 세션은 React 렌더와 분리된 하나의 mutable owner로 유지한다.
  const raceWeekendSession = useMemo(() => new RaceWeekendSession(), []);
  // 주말 패널은 세션 내부 객체가 아니라 복사된 스냅샷만 구독한다.
  const [raceWeekendSnapshot, setRaceWeekendSnapshot] = useState<RaceWeekendSnapshot>(
    () => raceWeekendSession.getSnapshot(),
  );
  // replay JSON 파싱·트랙 호환성 오류를 Race Weekend 조작 패널에 표시한다.
  const [raceReplayError, setRaceReplayError] = useState<string | null>(null);
  // 새 에피소드가 끝난 뒤에만 한 번 자동 튜닝하도록 시작·일시정지·HUD 콜백 사이의 의도를 보존한다.
  const automaticTuningPendingRef = useRef(false);

  // 완료된 시나리오만 다시 평가해 사용자가 실제로 실행한 구간의 설정 개선 여부를 결정한다.
  const completeAutomaticTuning = useCallback((completedSnapshot: AITrainingSnapshot) => {
    const result = searchAITrainingConfig({
      baseConfig: trainingRunner.getAIConfig(),
      scenarioIds: [completedSnapshot.scenario.id],
      maxCandidates: 14,
    });
    const applied = result.best.totalScore < result.baseline.totalScore;
    if (applied) {
      trainingRunner.setAIConfig(result.best.config);
      // 다음 주행 세션에도 같은 설정을 전달해 교육 결과와 실제 상대의 제어값이 갈라지지 않게 한다.
      setOpponentAIConfig(result.best.config);
    }
    setTrainingSearchResult({
      ...result,
      applied,
      failure: completedSnapshot.failure,
      completedSnapshot,
    });
    setTrainingSnapshot(trainingRunner.getSnapshot());
  }, [trainingRunner]);

  // 저장 시점의 UTC만 파일 메타데이터에 기록하고, 평가 수치·설정·해시는 완료 스냅샷에서 복사한다.
  const saveTrainingResult = useCallback(() => {
    if (!trainingSearchResult) return;

    // 결과 문서는 현재 UI 상태와 분리된 복사본이어야 자동 적용 후에도 원본 근거를 보존한다.
    const document = createAITrainingResultDocument({
      result: trainingSearchResult,
      completedSnapshot: trainingSearchResult.completedSnapshot,
      applied: trainingSearchResult.applied,
      savedAtUtc: new Date().toISOString(),
    });
    // Blob은 서버 저장 없이 브라우저가 즉시 다운로드할 수 있는 파일 경계다.
    const blob = new Blob([serializeAITrainingResult(document)], { type: "application/json" });
    // 임시 object URL은 클릭이 끝난 뒤 해제해 세션마다 메모리가 누적되지 않게 한다.
    const url = URL.createObjectURL(blob);
    // 실제 파일 다운로드를 발생시키는 일회성 앵커 요소다.
    const anchor = window.document.createElement("a");
    // 시나리오와 저장 시각을 파일명에 넣어 여러 평가 결과를 구분한다.
    const timestamp = document.savedAtUtc.replace(/[:.]/g, "-");
    anchor.href = url;
    anchor.download = "s1-racing-ai-training-" + document.scenario.id + "-" + timestamp + ".json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [trainingSearchResult]);

  // R3F가 10Hz로 전달한 종료 스냅샷을 감지해, 주행 완료 뒤에만 후보 평가를 실행한다.
  const handleTrainingSnapshot = useCallback((snapshot: AITrainingSnapshot) => {
    setTrainingSnapshot(snapshot);
    if (
      automaticTuningPendingRef.current
      && (snapshot.status === "completed" || snapshot.status === "failed")
    ) {
      automaticTuningPendingRef.current = false;
      completeAutomaticTuning(snapshot);
    }
  }, [completeAutomaticTuning]);

  // 새 교육은 먼저 현재 설정으로 에피소드를 끝까지 실행하고, 종료 콜백에서만 자동 튜닝을 예약한다.
  const startTraining = useCallback(() => {
    const currentStatus = trainingRunner.getSnapshot().status;
    if (currentStatus === "running") {
      trainingRunner.pause();
      setTrainingSnapshot(trainingRunner.getSnapshot());
      return;
    }

    // 일시정지 재개는 같은 에피소드의 연속이므로 튜닝 예약을 유지한 채 물리 실행만 이어간다.
    if (currentStatus !== "paused") {
      automaticTuningPendingRef.current = true;
      setTrainingSearchResult(null);
    }

    trainingRunner.start();
    setTrainingSnapshot(trainingRunner.getSnapshot());
  }, [trainingRunner]);

  // 레이스 장면이 10Hz로 전달한 스냅샷을 패널 상태로 복사한다.
  const handleRaceWeekendSnapshot = useCallback((snapshot: RaceWeekendSnapshot) => {
    setRaceWeekendSnapshot(snapshot);
  }, []);

  // 버튼 한 번으로 Practice 완료와 결정적 Q1/Q2/Q3 기록을 실행한다.
  const runWeekendQualifying = useCallback(() => {
    setRaceReplayError(null);
    setRaceWeekendSnapshot(raceWeekendSession.runDeterministicQualifying());
  }, [raceWeekendSession]);

  // 시작 타이어를 바꿀 때 피트 타이어가 같아지는 경우 다른 컴파운드로 함께 조정한다.
  const selectWeekendTyre = useCallback((compound: TyreCompound) => {
    raceWeekendSession.selectTyre(compound);
    const nextSnapshot = raceWeekendSession.getSnapshot();
    if (nextSnapshot.strategy.pitStopCompound === compound) {
      const fallbackCompound = (["soft", "medium", "hard"] as const).find((candidate) => candidate !== compound) ?? "medium";
      raceWeekendSession.setStrategy({
        ...nextSnapshot.strategy,
        pitStopCompound: fallbackCompound,
      });
    }
    setRaceWeekendSnapshot(raceWeekendSession.getSnapshot());
  }, [raceWeekendSession]);

  // 화면의 전략 select는 순수 세션 검증을 통과한 경우에만 상태를 갱신한다.
  const updateWeekendStrategy = useCallback((strategy: RaceStrategy) => {
    raceWeekendSession.setStrategy(strategy);
    setRaceWeekendSnapshot(raceWeekendSession.getSnapshot());
  }, [raceWeekendSession]);

  // 퀄리파잉 결과가 확정된 뒤 순서를 레이스 그리드에 반영한다.
  const startWeekendRace = useCallback(() => {
    setRaceReplayError(null);
    setRaceWeekendSnapshot(raceWeekendSession.beginRace());
  }, [raceWeekendSession]);

  // 주말의 모든 단계와 차량을 초기 그리드로 되돌린다.
  const resetWeekend = useCallback(() => {
    raceWeekendSession.reset();
    setRaceReplayError(null);
    setRaceWeekendSnapshot(raceWeekendSession.getSnapshot());
  }, [raceWeekendSession]);

  // 완료된 RaceSession의 fixed-step 입력과 digest를 버전 있는 JSON 파일로 저장한다.
  const saveWeekendReplay = useCallback(() => {
    const recording = raceWeekendSession.getReplayRecording();
    if (!recording) return;
    const blob = new Blob([serializeRaceReplay(recording)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    const safeTrackName = recording.metadata.trackName.toLowerCase().replace(/[^a-z0-9]+/gu, "-");
    anchor.href = url;
    anchor.download = "s1-racing-replay-" + safeTrackName + "-" + recording.frames.length + "-steps.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [raceWeekendSession]);

  // 사용자가 불러온 replay는 현재 Race Weekend의 트랙·랩·그리드 계약과 먼저 대조한다.
  const loadWeekendReplay = useCallback(async (file: File) => {
    try {
      const recording = parseRaceReplay(await file.text());
      raceWeekendSession.loadReplay(recording);
      setRaceReplayError(null);
      setRaceWeekendSnapshot(raceWeekendSession.getSnapshot());
    } catch (error) {
      setRaceReplayError(error instanceof Error ? error.message : "Replay JSON을 불러오지 못했습니다.");
    }
  }, [raceWeekendSession]);

  useEffect(() => {
    // 브라우저 입력과 WebGL 지원을 초기화하고 visibility 리스너를 등록한다.
    input.connect();
    setWebgl(detectWebGL2());

    const handleVisibilityChange = () => {
      setPaused(document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      input.dispose();
    };
  }, [input]);

  // 모드를 바꾸기 전에 교육을 멈춰 다시 돌아왔을 때 같은 상태를 관찰할 수 있게 한다.
  const selectMode = (nextMode: "training" | "drive" | "weekend" | "design") => {
    if (nextMode !== "training") trainingRunner.pause();
    setMode(nextMode);
    setTrainingSnapshot(trainingRunner.getSnapshot());
    if (nextMode === "weekend") setRaceWeekendSnapshot(raceWeekendSession.getSnapshot());
  };

  const trainingMode = mode === "training";
  const weekendMode = mode === "weekend";
  const designMode = mode === "design";
  const drivingMode = mode === "drive";
  const designPaint = DESIGN_STUDIO_PAINTS[designPaintId];

  return (
    <main className={"app-shell " + (trainingMode ? "app-shell--training" : weekendMode ? "app-shell--weekend" : designMode ? "app-shell--design" : "")}>
      <header className="topbar">
        <div>
          <p className="eyebrow">
            {trainingMode
              ? "S1 RACING / M2A-0 · AI TRAINING LAB"
              : weekendMode
                ? "S1 RACING / M2B → M3D · RACE WEEKEND"
                : designMode
                  ? "S1 RACING / DESIGN REVIEW · 2012 OPEN-WHEEL"
                : "S1 RACING / MILESTONE 2A · 단일 AI 상대"}
          </p>
          <h1>{trainingMode ? "Training Lab" : weekendMode ? "Race Weekend" : designMode ? "Car Design" : "S1 Racing"}</h1>
          <p className="subtitle">
            {trainingMode
              ? "Northfield GP · AI의 레이싱 라인과 제동을 눈앞에서 관찰하는 120Hz 교육실"
              : weekendMode
                ? "다차량 그리드 · 유효 랩 퀄리파잉 · 최소 피트 전략을 하나의 결정적 흐름으로 검증"
                : designMode
                  ? "S1 2012 Open-Wheel · 노즈·콕핏·사이드포드·리어 에어로를 독립적으로 검토"
                : "공유 VehicleControlInput과 120Hz 물리로 주행하는 AI 상대"}
          </p>
        </div>
        <div className="topbar__actions">
          <div className="mode-switch" role="tablist" aria-label="실행 모드">
            <button
              type="button"
              role="tab"
              aria-selected={trainingMode}
              className={trainingMode ? "mode-switch__tab mode-switch__tab--active" : "mode-switch__tab"}
              onClick={() => selectMode("training")}
            >
              AI 교육
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={drivingMode}
              className={drivingMode ? "mode-switch__tab mode-switch__tab--active" : "mode-switch__tab"}
              onClick={() => selectMode("drive")}
            >
              주행 모드
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={weekendMode}
              className={weekendMode ? "mode-switch__tab mode-switch__tab--active" : "mode-switch__tab"}
              onClick={() => selectMode("weekend")}
            >
              레이스 주말
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={designMode}
              className={designMode ? "mode-switch__tab mode-switch__tab--active" : "mode-switch__tab"}
              onClick={() => selectMode("design")}
            >
              차 디자인
            </button>
          </div>
          <span className={"status-chip " + (paused ? "status-chip--paused " : "") + (trainingMode ? "status-chip--training" : weekendMode ? "status-chip--weekend" : designMode ? "status-chip--design" : "")}>
            {trainingMode ? trainingStatusLabel(trainingSnapshot.status) : weekendMode ? weekendStatusLabel(raceWeekendSnapshot) : designMode ? "검토 준비" : paused ? "일시정지" : "주행 준비"}
          </span>
        </div>
      </header>

      <section className={"simulation-panel " + (trainingMode ? "simulation-panel--training" : weekendMode ? "simulation-panel--weekend" : designMode ? "simulation-panel--design" : "")} aria-label={trainingMode ? "AI Training Lab 시뮬레이션" : weekendMode ? "레이스 주말 시뮬레이션" : designMode ? "차량 디자인 3D 검토" : "S1 Racing 주행 테스트"}>
        {webgl?.supported ? (
          <Canvas
            camera={trainingMode ? { position: [0, 30, 25], fov: 45 } : weekendMode ? { position: [0, 8, 16], fov: 55 } : designMode ? { position: [5.4, 2.9, 6.4], fov: 38 } : { position: [4, 4, 6], fov: 55 }}
            // 게임 물리와 입력 반응성을 우선해 고밀도 화면에서도 fill-rate와 shadow map을 제한한다.
            dpr={[1, 1.25]}
            shadows="basic"
            gl={{ antialias: false, powerPreference: "high-performance" }}
            onCreated={({ gl }) => input.attach(gl.domElement)}
          >
            <Suspense fallback={null}>
              {trainingMode ? (
                <TrainingScene runner={trainingRunner} paused={paused} onSnapshot={handleTrainingSnapshot} />
              ) : designMode ? (
                <DesignStudioScene
                  bodyColor={designPaint.bodyColor}
                  accentColor={designPaint.accentColor}
                  emissiveColor={designPaint.emissiveColor}
                  view={designView}
                  steeringAngleRad={designSteeringAngleDeg * Math.PI / 180}
                  autoRotate={designAutoRotate}
                />
              ) : weekendMode ? (
                <RaceWeekendScene
                  session={raceWeekendSession}
                  input={input}
                  paused={paused}
                  onSnapshot={handleRaceWeekendSnapshot}
                />
              ) : (
                <DrivingScene
                  input={input}
                  paused={paused}
                  opponentAIConfig={opponentAIConfig}
                  onTelemetry={setTelemetry}
                  onOpponentTelemetry={setOpponentTelemetry}
                  onSuspensionTelemetry={setSuspensionTelemetry}
                  onTrackLimits={(player, opponent) => {
                    setTrackLimits(player);
                    setOpponentTrackLimits(opponent);
                  }}
                />
              )}
            </Suspense>
          </Canvas>
        ) : webgl ? (
          <div className="error-panel" role="alert">
            <h2>WebGL2를 사용할 수 없습니다.</h2>
            <p>{webgl.reason}</p>
            <p>WebGL2를 지원하는 최신 데스크톱 브라우저에서 다시 시도하십시오.</p>
          </div>
        ) : (
          <div className="loading-panel" role="status">렌더링 환경을 확인하는 중입니다.</div>
        )}

        {webgl?.supported && trainingMode && (
          <>
            <TrainingOverlay snapshot={trainingSnapshot} />
            <TrainingControls
              runner={trainingRunner}
              snapshot={trainingSnapshot}
              onSnapshot={handleTrainingSnapshot}
              onStart={startTraining}
            />
          </>
        )}

        {webgl?.supported && drivingMode && (
          <>
            <AppTelemetry
              telemetry={telemetry}
              opponentTelemetry={opponentTelemetry}
              suspensionTelemetry={suspensionTelemetry}
              trackLimits={trackLimits}
              opponentTrackLimits={opponentTrackLimits}
            />
            <div className="simulation-toolbar">
              <label className="input-preset-control">
                <span>입력 프리셋</span>
                <select
                  aria-label="입력 프리셋"
                  value={inputPreset}
                  onChange={(event) => {
                    const preset = event.target.value as VehicleInputPresetId;
                    input.setPreset(preset);
                    setInputPreset(preset);
                  }}
                >
                  {VEHICLE_INPUT_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.label}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => input.requestPointerLock()}>
                마우스 조향 활성화
              </button>
              <button type="button" onClick={() => input.requestReset()}>
                트랙 시작점으로 리셋
              </button>
              <span>R 리셋 · 클릭/범퍼 변속 · W/S 또는 페달</span>
            </div>
          </>
        )}
        <div className="canvas-label">
          {trainingMode ? "AI TRAINING LAB / NORTHFIELD GP PROTOTYPE" : weekendMode ? "RACE WEEKEND / MULTI-CAR PROTOTYPE" : designMode ? "DESIGN REVIEW / S1 2012 OPEN-WHEEL" : "PHYSICS PROTOTYPE / TEST TRACK"}
        </div>
      </section>

      {designMode ? (
        <DesignStudioPanel
          paintId={designPaintId}
          view={designView}
          steeringAngleDeg={designSteeringAngleDeg}
          autoRotate={designAutoRotate}
          onPaintChange={setDesignPaintId}
          onViewChange={setDesignView}
          onSteeringChange={setDesignSteeringAngleDeg}
          onAutoRotateChange={setDesignAutoRotate}
        />
      ) : trainingMode ? (
        <>
          <TrainingMetrics snapshot={trainingSnapshot} />
          {trainingSearchResult && (
            <TrainingSearchSummary result={trainingSearchResult} onSave={saveTrainingResult} />
          )}
        </>
      ) : weekendMode ? (
        <RaceWeekendPanel
          snapshot={raceWeekendSnapshot}
          onRunQualifying={runWeekendQualifying}
          onStartRace={startWeekendRace}
          onReset={resetWeekend}
          onSelectTyre={selectWeekendTyre}
          onStrategy={updateWeekendStrategy}
          onSaveReplay={saveWeekendReplay}
          onLoadReplay={loadWeekendReplay}
          replayError={raceReplayError}
        />
      ) : (
        <section className="telemetry-grid" aria-label="차량 상태">
          <article>
            <span>속도</span>
            <strong>{formatNumber(telemetry.speedKmh)} km/h</strong>
          </article>
          <article>
            <span>횡가속도</span>
            <strong>{telemetry.lateralG.toFixed(2)} G</strong>
          </article>
          <article>
            <span>다운포스</span>
            <strong>{formatNumber(telemetry.downforceN)} N</strong>
          </article>
          <article>
            <span>구동력</span>
            <strong>{formatNumber(telemetry.engineForceN)} N</strong>
          </article>
          <article>
            <span>엔진 브레이크</span>
            <strong>{formatNumber(telemetry.engineBrakeTorqueNm)} N·m</strong>
          </article>
          <article>
            <span>항력</span>
            <strong>{formatNumber(telemetry.dragForceN)} N</strong>
          </article>
          <article>
            <span>서스펜션 압축</span>
            <strong>{formatNumber(Math.max(...Object.values(telemetry.wheelCompressionM)) * 1000)} mm</strong>
          </article>
          <article>
            <span>Rapier 차체 높이</span>
            <strong>
              {suspensionTelemetry
                ? formatNumber(suspensionTelemetry.chassisHeightM, 3) + " m"
                : "초기화 중"}
            </strong>
          </article>
          <article>
            <span>전륜 조향각</span>
            <strong>
              {suspensionTelemetry
                ? formatNumber(suspensionTelemetry.frontSteeringAngleRad * 180 / Math.PI, 1) + "°"
                : "초기화 중"}
            </strong>
          </article>
          <article>
            <span>타이어 최대 슬립</span>
            <strong>
              {suspensionTelemetry
                ? formatNumber(suspensionTelemetry.maximumSlipRatio * 100, 1) + "%"
                : "초기화 중"}
            </strong>
          </article>
          <article>
            <span>타이어 최대 슬립각</span>
            <strong>
              {suspensionTelemetry
                ? formatNumber(suspensionTelemetry.maximumSlipAngleRad * 180 / Math.PI, 1) + "°"
                : "초기화 중"}
            </strong>
          </article>
          <article>
            <span>타이어 그립 사용률</span>
            <strong>
              {suspensionTelemetry
                ? formatNumber(suspensionTelemetry.maximumFrictionUsage * 100, 0) + "%"
              : "초기화 중"}
            </strong>
          </article>
          <article>
            <span>트랙 리밋 위반</span>
            <strong>{trackLimits.violationCount}회 · 패널티 {formatNumber(trackLimits.penaltySeconds, 2)} s</strong>
          </article>
          <article>
            <span>벽·연석 접촉</span>
            <strong>
              {suspensionTelemetry
                ? "벽 " + suspensionTelemetry.wallContactCount + " · 연석 " + suspensionTelemetry.curbContactCount
                : "초기화 중"}
            </strong>
          </article>
        </section>
      )}

      {trainingMode ? (
        <section className="control-panel training-context" aria-label="AI 교육 설명">
          <div>
            <span>교육 경계</span>
            <strong>AI는 입력만 생성하고 차량 위치·속도는 VehicleSimulation이 계산합니다.</strong>
          </div>
          <div>
            <span>현재 관찰</span>
            <strong>cyan 선은 레이싱 라인, 링은 AI의 현재 목표점, amber는 제동 미리보기입니다.</strong>
          </div>
          <div>
            <span>다음 단계</span>
            <strong>결정성 평가 후 동일한 설정을 단일 AI 레이스 세션에 연결합니다.</strong>
          </div>
        </section>
      ) : weekendMode ? (
        <section className="control-panel weekend-context" aria-label="레이스 주말 구현 경계">
          <div>
            <span>M2B · 다차량</span>
            <strong>모든 차량은 동일한 VehicleSimulation과 120Hz fixed-step을 사용하며 기본 순위·리셋을 결정적으로 계산합니다.</strong>
          </div>
          <div>
            <span>M2C · 퀄리파잉</span>
            <strong>{raceWeekendSnapshot.rulesetVersion} · 유효 랩만 반영 · Q1 20→15 · Q2 15→10 · Q3 10</strong>
          </div>
          <div>
            <span>M2D · 전략 경계</span>
            <strong>시작 컴파운드·열화·피트 서비스·손상·플래그를 같은 120Hz RaceSession 스냅샷으로 검증합니다.</strong>
          </div>
        </section>
      ) : designMode ? (
        <section className="control-panel design-context" aria-label="차량 디자인 구현 경계">
          <div>
            <span>렌더 경계</span>
            <strong>이 화면은 LowPolyCar의 읽기 전용 외관만 표시하며 물리 포즈·입력·AI 상태를 변경하지 않습니다.</strong>
          </div>
          <div>
            <span>2012 기준</span>
            <strong>스텝 노즈 · 다층 프런트 윙 · 오픈 콕핏 · 언더컷 사이드포드 · 코크 보틀 리어</strong>
          </div>
          <div>
            <span>검토 조작</span>
            <strong>드래그 회전 · 휠 줌 · 시점 프리셋 · 앞바퀴 조향 미리보기</strong>
          </div>
        </section>
      ) : (
        <section className="control-panel" aria-label="조작 안내">
          <div>
            <span>기본 조작</span>
            <strong>프리셋 선택 · W/S 가속·브레이크 · A/D 키보드 조향</strong>
          </div>
          <div>
            <span>마우스 조향</span>
            <strong>포인터 잠금 후 좌우 이동 · 좌클릭 업시프트 · 우클릭 다운시프트</strong>
          </div>
          <div>
            <span>물리 상태</span>
            <strong>데이터 기반 구간·노면·브레이크 마커 · 120Hz 고정 스텝</strong>
          </div>
        </section>
      )}
    </main>
  );
}
