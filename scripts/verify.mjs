/**
 * 타입 검사, 테스트, 아키텍처 검증, 빌드, 브라우저 E2E를 동일한 순서로
 * 실행하여 프로젝트의 통합 완료 기준을 제공하는 검증 스크립트다.
 */
import { spawnSync } from "node:child_process";

// 각 항목은 사람이 읽을 검증명과 npm 실행 인자를 함께 가진다.
const checks = [
  ["타입 검사", ["run", "typecheck"]],
  ["단위 테스트", ["run", "test", "--", "--run"]],
  ["아키텍처 검증", ["run", "architecture:check"]],
  ["프로덕션 빌드", ["run", "build"]],
  ["브라우저 E2E", ["run", "test:e2e"]],
];

// 앞 단계가 실패하면 뒤 단계의 결과를 완료로 오인하지 않도록 즉시 중단한다.
for (const [label, npmArgs] of checks) {
  console.log(`\n[검증] ${label}`);
  // 플랫폼에 따라 npm 실행 파일을 셸을 통해 찾아야 하므로 Windows에서만 shell을 켠다.
  const result = spawnSync("npm", npmArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\n[검증 완료] typecheck, unit, architecture, build, E2E가 모두 통과했습니다.");
