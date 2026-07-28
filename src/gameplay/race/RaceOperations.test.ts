/**
 * M3D 운영 계층의 손상 누적, 성능 저하, 피트 서비스 시간 경계를 검증한다.
 * 위치를 직접 변경하지 않는 순수 상태 전이만 검사한다.
 */
import { describe, expect, it } from "vitest";
import { RaceOperations } from "./RaceOperations";

describe("RaceOperations", () => {
  it("accumulates deterministic damage and reduces performance", () => {
    const first = new RaceOperations();
    const second = new RaceOperations();

    const firstDamage = first.recordContact(18, 0.2);
    const secondDamage = second.recordContact(18, 0.2);

    expect(firstDamage).toEqual(secondDamage);
    expect(firstDamage.totalRatio).toBeGreaterThan(0);
    expect(firstDamage.performanceMultiplier).toBeLessThan(1);
    expect(firstDamage.retired).toBe(false);
  });

  it("holds the car during pit service and completes one stop", () => {
    const operations = new RaceOperations();

    expect(operations.beginPitStop(0.12)).toBe(true);
    expect(operations.isServicing()).toBe(true);
    expect(operations.tick(1 / 120).status).toBe("servicing");
    expect(operations.tick(0.1).status).toBe("servicing");
    expect(operations.tick(0.02).status).toBe("completed");
    expect(operations.getSnapshot().pitStop.stopCount).toBe(1);
    expect(operations.isServicing()).toBe(false);
  });

  it("retires after repeated severe contacts and rejects a pit stop", () => {
    const operations = new RaceOperations();

    for (let index = 0; index < 10; index += 1) operations.recordContact(24, 1.5);

    expect(operations.getSnapshot().damage.retired).toBe(true);
    expect(operations.beginPitStop()).toBe(false);
  });
});
