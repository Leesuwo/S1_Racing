import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { detectWebGL2, type WebGL2Support } from "./webgl2";

function FoundationScene() {
  return (
    <>
      <color attach="background" args={["#090b10"]} />
      <ambientLight intensity={1.2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]}>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color="#151b25" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.8, 0.45, 3.2]} />
        <meshStandardMaterial color="#cc334f" metalness={0.2} roughness={0.65} />
      </mesh>
    </>
  );
}

export function App() {
  const [webgl, setWebgl] = useState<WebGL2Support | null>(null);
  const [paused, setPaused] = useState(() => document.hidden);

  useEffect(() => {
    setWebgl(detectWebGL2());

    const handleVisibilityChange = () => {
      setPaused(document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PROJECT FOUNDATION / MILESTONE 0</p>
          <h1>S1 Racing</h1>
        </div>
        <span className={`status-chip ${paused ? "status-chip--paused" : ""}`}>
          {paused ? "PAUSED" : "READY"}
        </span>
      </header>

      <section className="simulation-panel" aria-label="S1 Racing foundation canvas">
        {webgl?.supported ? (
          <Canvas camera={{ position: [4, 3, 5], fov: 45 }} dpr={[1, 1.5]}>
            <FoundationScene />
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
        <div className="canvas-label">RENDERING SHELL / NO VEHICLE PHYSICS YET</div>
      </section>

      <section className="foundation-grid" aria-label="Milestone 0 status">
        <article>
          <span>RUNTIME</span>
          <strong>{webgl?.supported ? "WebGL2 available" : "Checking"}</strong>
        </article>
        <article>
          <span>PHYSICS</span>
          <strong>120 Hz contract</strong>
        </article>
        <article>
          <span>INPUT</span>
          <strong>VehicleControlInput</strong>
        </article>
        <article>
          <span>NEXT</span>
          <strong>Milestone 1A</strong>
        </article>
      </section>
    </main>
  );
}
