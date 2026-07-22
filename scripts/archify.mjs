import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

// 검증 명령은 저장소 루트에서 실행된다는 계약을 사용해 입력·출력 경로를 고정한다.
const repoRoot = process.cwd();
const diagramType = "architecture";
const input = path.join(repoRoot, "docs/architecture/s1-racing-foundation.architecture.json");
const output = path.join(repoRoot, "docs/architecture/s1-racing-foundation.html");

// 전역 설치 위치와 환경 변수 override를 순서대로 확인해 개발자별 설치 경로를 허용한다.
const candidates = [
  process.env.ARCHIFY_HOME,
  path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "skills/archify"),
  path.join(os.homedir(), ".agents/skills/archify"),
].filter(Boolean);

const skillRoot = candidates.find((candidate) =>
  existsSync(path.join(candidate, "bin/archify.mjs")),
);

if (!skillRoot) {
  console.error("Archify를 찾을 수 없습니다. tt-a1i/archify 스킬을 전역 설치하거나 ARCHIFY_HOME을 지정하십시오.");
  process.exit(1);
}

const cli = path.join(skillRoot, "bin/archify.mjs");

function run(args) {
  // Archify 각 단계의 stdout/stderr를 그대로 전달하고 하나라도 실패하면 즉시 중단한다.
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(["validate", diagramType, input, "--json"]);
run(["render", diagramType, input, output]);
run(["check", output]);

console.log(`Architecture diagram verified: ${path.relative(repoRoot, output)}`);
