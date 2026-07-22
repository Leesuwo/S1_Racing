import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { BrowserVehicleInput } from "../game/input/BrowserVehicleInput";
import { VEHICLE_INPUT_PRESETS, type VehicleInputPresetId } from "../game/input/InputPreset";
import { zeroWheelValues } from "../game/physics/Suspension";
import type { RapierSuspensionTelemetry } from "../game/physics/RapierChassisSuspension";
import type { VehicleTelemetry } from "../game/physics/VehicleSimulation";
import { detectWebGL2, type WebGL2Support } from "./webgl2";
import { DrivingScene } from "./DrivingScene";

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

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString("ko-KR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
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
        <div className="rpm-bar" aria-label={`RPM ${formatNumber(telemetry.rpm)}`}>
          <span style={{ width: `${rpmRatio * 100}%` }} />
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
            ? `유효 · ${formatNumber(telemetry.distanceToBoundaryM, 1)} m`
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
            ? `${suspensionTelemetry.groundedWheelCount}/4 · ${formatNumber(suspensionTelemetry.chassisHeightM, 3)} m · 공력 ${formatNumber(suspensionTelemetry.downforceN)} N`
            : "초기화 중"}
        </strong>
      </div>
    </div>
  );
}

/** WebGL 지원 상태, 플레이어 HUD와 단일 AI 상대 상태를 조합하는 앱 셸이다. */
export function App() {
  const [webgl, setWebgl] = useState<WebGL2Support | null>(null);
  const [paused, setPaused] = useState(() => document.hidden);
  const [telemetry, setTelemetry] = useState(INITIAL_TELEMETRY);
  const [opponentTelemetry, setOpponentTelemetry] = useState(INITIAL_TELEMETRY);
  const [suspensionTelemetry, setSuspensionTelemetry] = useState<RapierSuspensionTelemetry | null>(null);
  const input = useMemo(() => new BrowserVehicleInput(window), []);
  const [inputPreset, setInputPreset] = useState<VehicleInputPresetId>(() => input.getPreset());

  useEffect(() => {
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">S1 RACING / MILESTONE 2A · 단일 AI 상대</p>
          <h1>S1 Racing</h1>
          <p className="subtitle">공유 VehicleControlInput과 120Hz 물리로 주행하는 AI 상대</p>
        </div>
        <span className={`status-chip ${paused ? "status-chip--paused" : ""}`}>
          {paused ? "일시정지" : "주행 준비"}
        </span>
      </header>

      <section className="simulation-panel" aria-label="S1 Racing 주행 테스트">
        {webgl?.supported ? (
          <Canvas
            camera={{ position: [4, 4, 6], fov: 55 }}
            dpr={[1, 1.5]}
            shadows
            onCreated={({ gl }) => input.attach(gl.domElement)}
          >
          <DrivingScene
            input={input}
            paused={paused}
            onTelemetry={setTelemetry}
            onOpponentTelemetry={setOpponentTelemetry}
            onSuspensionTelemetry={setSuspensionTelemetry}
          />
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

        {webgl?.supported && (
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
        <div className="canvas-label">PHYSICS PROTOTYPE / TEST TRACK</div>
      </section>

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
              ? `${formatNumber(suspensionTelemetry.chassisHeightM, 3)} m`
              : "초기화 중"}
          </strong>
        </article>
        <article>
          <span>전륜 조향각</span>
          <strong>
            {suspensionTelemetry
              ? `${formatNumber(suspensionTelemetry.frontSteeringAngleRad * 180 / Math.PI, 1)}°`
              : "초기화 중"}
          </strong>
        </article>
        <article>
          <span>타이어 최대 슬립</span>
          <strong>
            {suspensionTelemetry
              ? `${formatNumber(suspensionTelemetry.maximumSlipRatio * 100, 1)}%`
              : "초기화 중"}
          </strong>
        </article>
        <article>
          <span>타이어 최대 슬립각</span>
          <strong>
            {suspensionTelemetry
              ? `${formatNumber(suspensionTelemetry.maximumSlipAngleRad * 180 / Math.PI, 1)}°`
              : "초기화 중"}
          </strong>
        </article>
        <article>
          <span>타이어 그립 사용률</span>
          <strong>
            {suspensionTelemetry
              ? `${formatNumber(suspensionTelemetry.maximumFrictionUsage * 100, 0)}%`
              : "초기화 중"}
          </strong>
        </article>
      </section>

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
    </main>
  );
}
