/** 프로토타입 차량 물리의 결정성·가속·관성주행·공력·유한값 게이트를 검증한다. */
import { describe, expect, it } from "vitest";
import { runPhysicsValidation } from "./PhysicsValidation";

describe("Physics validation", () => {
  // 공개 검증 보고서의 모든 항목이 통과해야 다음 기능 단계로 넘어갈 수 있다.
  it("passes deterministic acceleration, coast-down, aero, and finite-state gates", () => {
    // 보고서 하나에 모든 검증 지표가 포함되어 있어 상태별 assertion을 반복하지 않는다.
    const report = runPhysicsValidation();

    expect(report.passed).toBe(true);
    expect(report.metrics.every((metric) => metric.passed)).toBe(true);
  });
});
