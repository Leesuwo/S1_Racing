/**
 * React 애플리케이션의 브라우저 진입점이다. 렌더링 루트와 전역 스타일을
 * 연결하고 개발 중 StrictMode 검사를 활성화한다.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles.css";

// HTML 셸의 root 요소에 애플리케이션을 연결한다.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
