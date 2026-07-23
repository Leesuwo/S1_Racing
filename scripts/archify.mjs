/**
 * 프로젝트 아키텍처 JSON을 검증하고 공유용 HTML 다이어그램으로 렌더링하는
 * 저장소 전용 보조 스크립트다.
 */
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

// 명령을 실행한 저장소를 상대 경로의 기준점으로 고정한다.
const repoRoot = process.cwd();
// Archify가 해석할 다이어그램 종류를 저장한다.
const diagramType = "architecture";
// 검증·렌더링의 원본 아키텍처 JSON 경로다.
const input = path.join(repoRoot, "docs/architecture/s1-racing-foundation.architecture.json");
// 검토·공유용으로 생성할 HTML 경로다.
const output = path.join(repoRoot, "docs/architecture/s1-racing-foundation.html");

// 로컬 환경마다 다를 수 있는 Archify 설치 위치를 우선순위대로 탐색한다.
const candidates = [
  process.env.ARCHIFY_HOME,
  path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "skills/archify"),
  path.join(os.homedir(), ".agents/skills/archify"),
].filter(Boolean);

// 실제 실행 파일이 존재하는 첫 번째 설치 위치를 선택한다.
const skillRoot = candidates.find((candidate) =>
  existsSync(path.join(candidate, "bin/archify.mjs")),
);

if (!skillRoot) {
  console.error("Archify를 찾을 수 없습니다. tt-a1i/archify 스킬을 전역 설치하거나 ARCHIFY_HOME을 지정하십시오.");
  process.exit(1);
}

// 선택한 Archify 설치의 CLI 진입점이다.
const cli = path.join(skillRoot, "bin/archify.mjs");

/**
 * Archify 하위 명령을 현재 저장소에서 실행하고 실패를 즉시 전달한다.
 * @param {string[]} args Archify에 넘길 하위 명령과 옵션 목록
 */
function run(args) {
  // 동기 실행으로 validate → render → check 순서를 보장한다.
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// 원본 JSON의 형식과 의존성을 먼저 검증한다.
run(["validate", diagramType, input, "--json"]);
// 검증된 원본을 HTML 산출물로 렌더링한다.
run(["render", diagramType, input, output]);
// 렌더링 결과가 공유 가능한 상태인지 최종 확인한다.
run(["check", output]);

console.log(`Architecture diagram verified: ${path.relative(repoRoot, output)}`);
