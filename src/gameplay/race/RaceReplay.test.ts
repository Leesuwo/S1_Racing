/** M5~M6 리플레이의 입력·digest 재생, manifest 독립 실행, JSON 변조 검출 경계를 검증한다. */
import { describe, expect, it } from "vitest";
import { neutralVehicleControlInput } from "../../game/input/VehicleControlInput";
import {
  parseRaceReplay,
  RaceReplayRecorder,
  serializeRaceReplay,
  verifyRaceReplay,
  verifyRaceReplayIndependently,
} from "./RaceReplay";
import { createRaceGrid, RaceSession } from "./RaceSession";

describe("RaceReplay", () => {
  /** 같은 순수 RaceSession을 기록·재생해 step별 digest가 일치하는지 확인한다. */
  it("replays the same fixed-step inputs with identical digests", () => {
    const recordedSession = new RaceSession(createRaceGrid(undefined, 4), undefined, 1, 240);
    const recorder = new RaceReplayRecorder(recordedSession.getSnapshot(), recordedSession.getReplayManifest());
    recordedSession.start();

    for (let step = 0; step < 120; step += 1) {
      const input = {
        ...neutralVehicleControlInput(),
        throttle: step < 80 ? 1 : 0.25,
        steering: step % 40 < 20 ? 0.08 : -0.08,
      };
      recorder.recordStep(input, recordedSession.step(input));
    }
    const recording = recorder.finish(recordedSession.getSnapshot());
    const replaySession = new RaceSession(createRaceGrid(undefined, 4), undefined, 1, 240);

    const result = verifyRaceReplay(replaySession, recording);

    expect(result).toEqual({
      matched: true,
      frameCount: 120,
      finalDigest: recording.finalDigest,
    });
    expect(verifyRaceReplayIndependently(recording)).toEqual(result);
  });

  /** 저장 파일이 보존되고 입력을 바꾸면 정확한 fixed-step에서 검증이 멈추는지 확인한다. */
  it("round-trips JSON and rejects a tampered frame", () => {
    const session = new RaceSession(createRaceGrid(undefined, 2), undefined, 1, 240);
    const recorder = new RaceReplayRecorder(session.getSnapshot(), session.getReplayManifest());
    session.start();
    const input = { ...neutralVehicleControlInput(), throttle: 1 };
    recorder.recordStep(input, session.step(input));
    const recording = recorder.finish(session.getSnapshot());
    const parsed = parseRaceReplay(serializeRaceReplay(recording));
    const tampered = {
      ...parsed,
      frames: parsed.frames.map((frame) => ({ ...frame, input: { ...frame.input, steering: 0.5 } })),
    };
    const replaySession = new RaceSession(createRaceGrid(undefined, 2), undefined, 1, 240);

    expect(parsed).toEqual(recording);
    expect(verifyRaceReplay(replaySession, tampered).mismatch?.reason).toBe("step-digest");
    expect(verifyRaceReplay(new RaceSession(createRaceGrid(undefined, 2), undefined, 1, 240), recording).matched).toBe(true);
  });

  /** M6 manifest는 타이어·연료·세션 종료 경계까지 보존해 새 세션에서 다시 실행할 수 있어야 한다. */
  it("preserves tyre, fuel, and fixed-step limits in the independent manifest", () => {
    const session = new RaceSession(
      createRaceGrid(undefined, 2),
      undefined,
      2,
      360,
      { startCompound: "soft", pitStopLap: 1, pitStopCompound: "hard" },
      { vehicleSetupId: "high-downforce", fuelPlan: { startFuelKg: 7, pitRefuelKg: 3, fullThrottleConsumptionKgPerSecond: 0.05 } },
    );
    const manifest = session.getReplayManifest();

    expect(manifest).toMatchObject({
      maxSteps: 360,
      vehicleSetupId: "high-downforce",
      tyrePlan: { startCompound: "soft", pitStopLap: 1, pitStopCompound: "hard" },
      fuelPlan: { startFuelKg: 7, pitRefuelKg: 3 },
    });
    const recorder = new RaceReplayRecorder(session.getSnapshot(), manifest);
    session.start();
    const input = { ...neutralVehicleControlInput(), throttle: 0.5 };
    recorder.recordStep(input, session.step(input));
    expect(verifyRaceReplayIndependently(recorder.finish(session.getSnapshot())).matched).toBe(true);
  });
});
