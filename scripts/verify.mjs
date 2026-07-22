import { spawnSync } from "node:child_process";

// CI와 로컬이 공유하는 순서다. 빠른 타입·단위 실패를 먼저 보여주고 최종 산출물 검사를 뒤에 둔다.
const checks = [
  ["타입 검사", ["run", "typecheck"]],
  ["단위 테스트", ["run", "test", "--", "--run"]],
  ["아키텍처 검증", ["run", "architecture:check"]],
  ["프로덕션 빌드", ["run", "build"]],
  ["브라우저 E2E", ["run", "test:e2e"]],
];

for (const [label, npmArgs] of checks) {
  console.log(`\n[검증] ${label}`);
  // spawnSync를 사용해 앞 단계가 통과한 경우에만 다음 단계로 넘어가는 단일 게이트를 만든다.
  const result = spawnSync("npm", npmArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\n[검증 완료] typecheck, unit, architecture, build, E2E가 모두 통과했습니다.");
