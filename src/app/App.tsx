import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { BrowserVehicleInput } from "../game/input/BrowserVehicleInput";
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
  engineForceN: 0,
  wheelLoadsN: zeroWheelValues(),
  wheelCompressionM: zeroWheelValues(),
};

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString("ko-KR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function AppTelemetry({
  telemetry,
  suspensionTelemetry,
}: {
  telemetry: VehicleTelemetry;
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
            ? `${suspensionTelemetry.groundedWheelCount}/4 · ${formatNumber(suspensionTelemetry.chassisHeightM, 3)} m · 전륜 ${formatNumber(suspensionTelemetry.frontSteeringAngleRad * 180 / Math.PI, 1)}°`
            : "초기화 중"}
        </strong>
      </div>
    </div>
  );
}

export function App() {
  const [webgl, setWebgl] = useState<WebGL2Support | null>(null);
  const [paused, setPaused] = useState(() => document.hidden);
  const [telemetry, setTelemetry] = useState(INITIAL_TELEMETRY);
  const [suspensionTelemetry, setSuspensionTelemetry] = useState<RapierSuspensionTelemetry | null>(null);
  const input = useMemo(() => new BrowserVehicleInput(window), []);

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
          <p className="eyebrow">S1 RACING / 물리 프로토타입 v0.5</p>
          <h1>S1 Racing</h1>
          <p className="subtitle">고정 120Hz 차량 물리 테스트 트랙</p>
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
            <AppTelemetry telemetry={telemetry} suspensionTelemetry={suspensionTelemetry} />
            <div className="simulation-toolbar">
              <button type="button" onClick={() => input.requestPointerLock()}>
                마우스 조향 활성화
              </button>
              <span>R 리셋 · 클릭 변속 · W/S 가속·브레이크</span>
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
          <strong>W/S 가속·브레이크 · A/D 키보드 조향</strong>
        </div>
        <div>
          <span>마우스 조향</span>
          <strong>포인터 잠금 후 좌우 이동 · 좌클릭 업시프트 · 우클릭 다운시프트</strong>
        </div>
        <div>
          <span>물리 상태</span>
          <strong>Rapier 접지점 타이어 힘 + 4휠 레이캐스트 · 120Hz 고정 스텝</strong>
        </div>
      </section>
    </main>
  );
}
