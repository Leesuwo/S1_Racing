import { spawnSync } from "node:child_process";

const checks = [
  ["타입 검사", ["run", "typecheck"]],
  ["단위 테스트", ["run", "test", "--", "--run"]],
  ["아키텍처 검증", ["run", "architecture:check"]],
  ["프로덕션 빌드", ["run", "build"]],
  ["코드 리뷰", ["run", "review:code"]],
  ["최적화 리뷰", ["run", "review:performance"]],
  ["브라우저 E2E", ["run", "test:e2e"]],
];

for (const [label, npmArgs] of checks) {
  console.log(`\n[검증] ${label}`);
  const result = spawnSync("npm", npmArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\n[검증 완료] typecheck, unit, architecture, build, 코드·최적화 리뷰, E2E가 모두 통과했습니다.");
