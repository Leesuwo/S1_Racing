/**
 * M2C 퀄리파잉의 유효 랩·단계 컷·결정적 그리드 순서를 검증한다.
 * 실제 차량이나 브라우저 없이 시간 기록 경계만 검사해 규칙 회귀를 빠르게 잡는다.
 */
import { describe, expect, it } from "vitest";
import { createQualifyingGrid, QUALIFYING_RULESET, QualifyingSession } from "./QualifyingSession";

describe("QualifyingSession", () => {
  it("applies deterministic Q1, Q2, and Q3 cuts", () => {
    const session = new QualifyingSession(createQualifyingGrid());
    session.start();
    session.getSnapshot().activeParticipantIds.forEach((participantId, index) => {
      session.recordLap({ participantId, lapNumber: 1, lapTimeSeconds: 90 + index, valid: true });
    });
    const q1 = session.completePhase();

    expect(q1.phase).toBe("Q1");
    expect(q1.entrantCount).toBe(QUALIFYING_RULESET.q1Entrants);
    expect(q1.advanceCount).toBe(QUALIFYING_RULESET.q1Advance);
    expect(q1.eliminatedIds).toHaveLength(5);
    expect(session.getSnapshot().phase).toBe("Q2");
    expect(session.getSnapshot().activeParticipantIds).toHaveLength(15);

    session.getSnapshot().activeParticipantIds.forEach((participantId, index) => {
      session.recordLap({ participantId, lapNumber: 1, lapTimeSeconds: 91 + index * 0.1, valid: true });
    });
    const q2 = session.completePhase();
    expect(q2.eliminatedIds).toHaveLength(5);
    expect(session.getSnapshot().activeParticipantIds).toHaveLength(10);

    session.getSnapshot().activeParticipantIds.forEach((participantId, index) => {
      session.recordLap({ participantId, lapNumber: 1, lapTimeSeconds: 92 + index * 0.1, valid: true });
    });
    const q3 = session.completePhase();
    expect(q3.phase).toBe("Q3");
    expect(session.getSnapshot().status).toBe("complete");
    expect(session.getGridOrder()).toHaveLength(20);
  });

  it("does not allow an invalid lap to become the best time", () => {
    const session = new QualifyingSession(createQualifyingGrid());
    session.start();
    session.recordLap({ participantId: "player", lapNumber: 1, lapTimeSeconds: 60, valid: false });
    session.recordLap({ participantId: "player", lapNumber: 2, lapTimeSeconds: 100, valid: true });

    const player = session.getSnapshot().entries.find((entry) => entry.id === "player");
    expect(player?.bestLapTimeSeconds).toBe(100);
    expect(player?.validLapCount).toBe(1);
    expect(player?.invalidLapCount).toBe(1);
  });

  it("resets phase records and returns to Q1", () => {
    const session = new QualifyingSession(createQualifyingGrid());
    session.start();
    session.recordLap({ participantId: "player", lapNumber: 1, lapTimeSeconds: 100, valid: true });
    session.completePhase();
    session.reset();

    const snapshot = session.getSnapshot();
    expect(snapshot.status).toBe("ready");
    expect(snapshot.phase).toBe("Q1");
    expect(snapshot.activeParticipantIds).toHaveLength(20);
    expect(snapshot.phaseResults).toHaveLength(0);
  });
});
