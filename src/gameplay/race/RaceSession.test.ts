/**
 * M2B 다차량 세션의 그리드·결정성·순위·리셋 경계를 검증한다.
 * Rapier 렌더링 장면과 분리된 VehicleSimulation fixed-step 계약만 검사한다.
 */
import { describe, expect, it } from "vitest";
import { neutralVehicleControlInput } from "../../game/input/VehicleControlInput";
import { createRaceGrid, RaceSession } from "./RaceSession";

describe("RaceSession", () => {
  it("creates unique grid poses and keeps the requested participant count", () => {
    const grid = createRaceGrid(undefined, 6);
    const positions = grid.map((participant) => JSON.stringify(participant.startPose.position));

    expect(grid).toHaveLength(6);
    expect(new Set(positions).size).toBe(6);
    expect(grid[0]?.kind).toBe("player");
    expect(grid.slice(1).every((participant) => participant.kind === "ai")).toBe(true);
  });

  it("reproduces standings and finite fixed-step metrics for the same inputs", () => {
    const first = new RaceSession(createRaceGrid(undefined, 4), undefined, 1, 240);
    const second = new RaceSession(createRaceGrid(undefined, 4), undefined, 1, 240);
    first.start();
    second.start();

    for (let step = 0; step < 120; step += 1) {
      const input = neutralVehicleControlInput();
      first.step(input);
      second.step(input);
    }

    const firstSnapshot = first.getSnapshot();
    const secondSnapshot = second.getSnapshot();
    expect(firstSnapshot.standings.map((participant) => participant.id)).toEqual(
      secondSnapshot.standings.map((participant) => participant.id),
    );
    expect(firstSnapshot.standings.map((participant) => participant.raceDistanceM)).toEqual(
      secondSnapshot.standings.map((participant) => participant.raceDistanceM),
    );
    expect(firstSnapshot.maximumFixedStepDurationMs).toBeGreaterThanOrEqual(0);
    expect(firstSnapshot.standings.every((participant) => Number.isFinite(participant.speedMps))).toBe(true);
  });

  it("resets every vehicle to the same grid and clears the race clock", () => {
    const session = new RaceSession(createRaceGrid(undefined, 4), undefined, 1, 240);
    const initial = session.getSnapshot();
    session.start();
    session.advance(12, { ...neutralVehicleControlInput(), throttle: 1 });
    session.reset();
    const reset = session.getSnapshot();

    expect(reset.status).toBe("grid");
    expect(reset.stepIndex).toBe(0);
    expect(reset.elapsedSeconds).toBe(0);
    expect(reset.resetCount).toBe(1);
    expect(reset.standings.map((participant) => participant.positionM)).toEqual(
      initial.standings.map((participant) => participant.positionM),
    );
  });
});
