/**
 * M2D 주말 단계 전이와 전략 입력 경계를 검증한다.
 * 타이어 열·마모나 실제 피트 애니메이션이 아니라, 이번 마일스톤의 규칙 계약만 검사한다.
 */
import { describe, expect, it } from "vitest";
import { RaceWeekendSession } from "./RaceWeekendSession";

describe("RaceWeekendSession", () => {
  it("runs practice, qualifying cuts, and starts a race from the final grid", () => {
    const weekend = new RaceWeekendSession(undefined, 6, 2);
    const initial = weekend.getSnapshot();

    expect(initial.stage).toBe("practice");
    expect(initial.practiceCompleted).toBe(false);

    const qualifying = weekend.runDeterministicQualifying();
    expect(qualifying.stage).toBe("qualifying");
    expect(qualifying.status).toBe("complete");
    expect(qualifying.qualifying.phaseResults.map((result) => result.phase)).toEqual(["Q1", "Q2", "Q3"]);
    expect(qualifying.qualifying.activeParticipantIds).toHaveLength(10);

    const race = weekend.beginRace();
    expect(race.stage).toBe("race");
    expect(race.status).toBe("running");
    expect(race.race.participantCount).toBe(6);
    expect(race.race.standings[0]?.position).toBe(1);
  });

  it("enforces a different compound and a valid minimum pit-stop lap", () => {
    const weekend = new RaceWeekendSession(undefined, 6, 3);

    weekend.selectTyre("soft");
    expect(() => weekend.setStrategy({ startCompound: "medium", pitStopLap: 2, pitStopCompound: "hard" })).toThrow();
    expect(() => weekend.setStrategy({ startCompound: "soft", pitStopLap: 3, pitStopCompound: "hard" })).toThrow();
    expect(() => weekend.setStrategy({ startCompound: "soft", pitStopLap: 2, pitStopCompound: "soft" })).toThrow();

    weekend.setStrategy({ startCompound: "soft", pitStopLap: 2, pitStopCompound: "medium" });
    expect(weekend.getSnapshot().strategy).toEqual({
      startCompound: "soft",
      pitStopLap: 2,
      pitStopCompound: "medium",
    });
  });

  it("resets every weekend stage and race clock", () => {
    const weekend = new RaceWeekendSession(undefined, 6, 2);
    weekend.runDeterministicQualifying();
    weekend.beginRace();
    weekend.reset();

    const reset = weekend.getSnapshot();
    expect(reset.stage).toBe("practice");
    expect(reset.status).toBe("ready");
    expect(reset.qualifying.phase).toBe("Q1");
    expect(reset.race.status).toBe("grid");
    expect(reset.race.stepIndex).toBe(0);
  });
});
