/**
 * 저장소의 자동 코드 리뷰 하네스다.
 * 정적 검사로만 판정할 수 있는 물리 경계·공백 오류·디버그 출력 회귀를 `npm run verify`에 포함한다.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** 재귀적으로 TypeScript 소스 파일을 수집한다. 테스트와 선언 파일은 production 경계 검사에서 제외한다. */
function collectTypeScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return entry.isFile() && /\.tsx?$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

/** 실패를 모아 한 번에 보고해 다음 수정에서 경계 위반을 빠뜨리지 않게 한다. */
const findings = [];

try {
  execFileSync("git", ["diff", "--check"], { stdio: "pipe" });
} catch (error) {
  findings.push(`공백 오류: ${String(error.stdout || error.message).trim()}`);
}

const domainDirectories = ["src/game", "src/gameplay", "src/tracks"];
const forbiddenRuntimeImports = /from\s+["'](?:react|three|@react-three\/fiber|zustand)["']/u;
for (const directory of domainDirectories) {
  for (const path of collectTypeScriptFiles(directory)) {
    const source = readFileSync(path, "utf8");
    if (forbiddenRuntimeImports.test(source)) {
      findings.push(`${relative(process.cwd(), path)}: 순수 도메인이 React·R3F·Three·Zustand를 직접 import합니다.`);
    }
  }
}

for (const path of collectTypeScriptFiles("src")) {
  const source = readFileSync(path, "utf8");
  if (/\bconsole\.(?:log|debug|info)\s*\(/u.test(source)) {
    findings.push(`${relative(process.cwd(), path)}: production 코드에 console 출력이 남아 있습니다.`);
  }
}

if (findings.length > 0) {
  console.error("[코드 리뷰 실패]");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log("[코드 리뷰 통과] 공백 오류, 순수 도메인 경계, production console 출력을 확인했습니다.");
