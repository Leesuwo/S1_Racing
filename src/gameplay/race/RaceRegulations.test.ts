/** M4C 레이스 컨트롤 플래그·시간 패널티·레드 플래그 재시작 경계를 검증한다. */
import { describe, expect, it } from "vitest";
import { RaceRegulations } from "./RaceRegulations";

describe("RaceRegulations", () => {
  it("escalates a severe contact to safety car and returns to green deterministically", () => {
    const regulations = new RaceRegulations();
    expect(regulations.recordContact(9).raceControl).toBe("safety-car");
    expect(regulations.getSnapshot().safetyCarCount).toBe(1);
    expect(regulations.tick(5).raceControl).toBe("green");
  });

  it("accumulates pit penalties and supports a red-flag restart", () => {
    const regulations = new RaceRegulations();
    regulations.recordPitSpeedViolation();
    expect(regulations.getSnapshot().totalTimePenaltySeconds).toBe(5);
    expect(regulations.triggerRedFlag().raceControl).toBe("red");
    expect(regulations.restartFromRedFlag().raceControl).toBe("green");
  });
});
