import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    reporters: ["default"],
    // Northfield 전체 랩·AI 후보 탐색·Rapier 안정화는 실제 fixed-step을 끝까지 실행하므로
    // 기본 5초 제한으로는 병렬 검증 환경에서 정상 시나리오를 실패로 오인할 수 있다.
    testTimeout: 30_000,
    // Rapier WASM과 120Hz 교육 루프를 여러 worker가 동시에 돌리면 CPU 경합으로
    // worker 상태 보고 자체가 지연된다. 완료 게이트는 한 파일씩 결정적으로 실행한다.
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
