import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles.css";

// React 트리의 단일 진입점이다. StrictMode는 개발 중 effect 수명주기 오류를 드러내고,
// 실제 물리 생명주기는 각 컴포넌트의 정리 함수에서 멱등적으로 처리한다.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
