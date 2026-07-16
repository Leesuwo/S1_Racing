import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const diagramType = "architecture";
const input = path.join(repoRoot, "docs/architecture/s1-racing-foundation.architecture.json");
const output = path.join(repoRoot, "docs/architecture/s1-racing-foundation.html");

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
