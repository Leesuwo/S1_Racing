/**
 * 주행 모드와 AI Training Lab을 선택하는 최상위 React 셸이다.
 * 물리·교육 상태는 각각 장면과 실행기가 소유하고, 이 컴포넌트는 읽기 전용 스냅샷과
 * 사용자 조작 명령만 연결한다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { zeroWheelValues } from "../game/physics/Suspension";
import type { RapierSuspensionTelemetry } from "../game/physics/RapierChassisSuspension";
import type { VehicleTelemetry } from "../game/physics/VehicleSimulation";
import { detectWebGL2, type WebGL2Support } from "./webgl2";
import { DrivingScene } from "./DrivingScene";
import { TrainingScene } from "./TrainingScene";

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
};

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

/** 플레이어 물리 지표와 AI 상대의 진행 상태를 표시하는 읽기 전용 HUD다. */
function AppTelemetry({
  telemetry,
  opponentTelemetry,
  suspensionTelemetry,
}: {
  telemetry: VehicleTelemetry;
  opponentTelemetry: VehicleTelemetry;
  suspensionTelemetry: RapierSuspensionTelemetry | null;
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
}: {
  result: AITrainingSearchResult & { applied: boolean; failure?: AITrainingFailure };
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
  const [mode, setMode] = useState<"training" | "drive">("training");
  // 플레이어 주행 모드의 마지막 텔레메트리 샘플이다.
  const [telemetry, setTelemetry] = useState(INITIAL_TELEMETRY);
  // AI 상대의 마지막 텔레메트리 샘플이다.
  const [opponentTelemetry, setOpponentTelemetry] = useState(INITIAL_TELEMETRY);
  // Rapier 접지 상태를 표시하는 읽기 전용 텔레메트리다.
  const [suspensionTelemetry, setSuspensionTelemetry] = useState<RapierSuspensionTelemetry | null>(null);
  // 브라우저 입력 어댑터는 앱 수명 동안 하나만 생성한다.
  const input = useMemo(() => new BrowserVehicleInput(window), []);
  // 입력 프리셋 select와 입력 어댑터의 현재 값을 동기화한다.
  const [inputPreset, setInputPreset] = useState<VehicleInputPresetId>(() => input.getPreset());
  // 교육 실행기는 React 렌더와 분리된 단일 mutable simulation owner다.
  const trainingRunner = useMemo(() => new AITrainingRunner(), []);
  // HUD에는 runner가 소유한 내부 객체가 아닌 복사된 스냅샷만 저장한다.
  const [trainingSnapshot, setTrainingSnapshot] = useState<AITrainingSnapshot>(
    () => trainingRunner.getSnapshot(),
  );
  // 후보 탐색이 끝난 뒤에도 기준·최고 설정 비교 결과를 화면에 보존한다.
  const [trainingSearchResult, setTrainingSearchResult] = useState<
    (AITrainingSearchResult & { applied: boolean; failure?: AITrainingFailure }) | null
  >(null);
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
    if (applied) trainingRunner.setAIConfig(result.best.config);
    setTrainingSearchResult({ ...result, applied, failure: completedSnapshot.failure });
    setTrainingSnapshot(trainingRunner.getSnapshot());
  }, [trainingRunner]);

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
  const selectMode = (nextMode: "training" | "drive") => {
    if (nextMode === "drive") trainingRunner.pause();
    setMode(nextMode);
    setTrainingSnapshot(trainingRunner.getSnapshot());
  };

  const trainingMode = mode === "training";

  return (
    <main className={"app-shell " + (trainingMode ? "app-shell--training" : "")}>
      <header className="topbar">
        <div>
          <p className="eyebrow">
            {trainingMode ? "S1 RACING / M2A-0 · AI TRAINING LAB" : "S1 RACING / MILESTONE 2A · 단일 AI 상대"}
          </p>
          <h1>{trainingMode ? "Training Lab" : "S1 Racing"}</h1>
          <p className="subtitle">
            {trainingMode
              ? "Northfield GP · AI의 레이싱 라인과 제동을 눈앞에서 관찰하는 120Hz 교육실"
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
              aria-selected={!trainingMode}
              className={!trainingMode ? "mode-switch__tab mode-switch__tab--active" : "mode-switch__tab"}
              onClick={() => selectMode("drive")}
            >
              주행 모드
            </button>
          </div>
          <span className={"status-chip " + (paused ? "status-chip--paused " : "") + (trainingMode ? "status-chip--training" : "")}>
            {trainingMode ? trainingStatusLabel(trainingSnapshot.status) : paused ? "일시정지" : "주행 준비"}
          </span>
        </div>
      </header>

      <section className={"simulation-panel " + (trainingMode ? "simulation-panel--training" : "")} aria-label={trainingMode ? "AI Training Lab 시뮬레이션" : "S1 Racing 주행 테스트"}>
        {webgl?.supported ? (
          <Canvas
            camera={trainingMode ? { position: [0, 30, 25], fov: 45 } : { position: [4, 4, 6], fov: 55 }}
            dpr={[1, 1.5]}
            shadows
            onCreated={({ gl }) => input.attach(gl.domElement)}
          >
            {trainingMode ? (
              <TrainingScene runner={trainingRunner} paused={paused} onSnapshot={handleTrainingSnapshot} />
            ) : (
              <DrivingScene
                input={input}
                paused={paused}
                onTelemetry={setTelemetry}
                onOpponentTelemetry={setOpponentTelemetry}
                onSuspensionTelemetry={setSuspensionTelemetry}
              />
            )}
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

        {webgl?.supported && !trainingMode && (
          <>
            <AppTelemetry
              telemetry={telemetry}
              opponentTelemetry={opponentTelemetry}
              suspensionTelemetry={suspensionTelemetry}
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
          {trainingMode ? "AI TRAINING LAB / NORTHFIELD GP PROTOTYPE" : "PHYSICS PROTOTYPE / TEST TRACK"}
        </div>
      </section>

      {trainingMode ? (
        <>
          <TrainingMetrics snapshot={trainingSnapshot} />
          {trainingSearchResult && (
            <TrainingSearchSummary result={trainingSearchResult} />
          )}
        </>
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
