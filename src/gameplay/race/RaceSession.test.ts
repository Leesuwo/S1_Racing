/**
 * M3B~M3D 다차량 세션의 그리드·결정성·트랙 리밋·타이어·운영 스냅샷·순위·리셋 경계를 검증한다.
 * Rapier 렌더링 장면과 분리된 VehicleSimulation fixed-step 계약만 검사한다.
 */
import { describe, expect, it } from "vitest";
import { neutralVehicleControlInput } from "../../game/input/VehicleControlInput";
import { createRaceDeterminismDigest, createRaceGrid, RaceSession } from "./RaceSession";
import { RapierMultiCarCollision } from "./RapierMultiCarCollision";

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
    expect(firstSnapshot.standings.every((participant) => participant.trackLimits.lapValid)).toBe(true);
    expect(firstSnapshot.contactCount).toBe(0);
    expect(createRaceDeterminismDigest(firstSnapshot)).toBe(createRaceDeterminismDigest(secondSnapshot));
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

  it("applies a planned compound change and holds the vehicle during pit service", () => {
    const session = new RaceSession(
      createRaceGrid(undefined, 2),
      undefined,
      2,
      2400,
      { startCompound: "medium", pitStopLap: 1, pitStopCompound: "hard" },
    );
    session.start();
    let sawServicing = false;
    let sawCompleted = false;

    for (let step = 0; step < 1800; step += 1) {
      const snapshot = session.step({ ...neutralVehicleControlInput(), throttle: 1 });
      const player = snapshot.standings.find((participant) => participant.kind === "player");
      if (player?.operations.pitStop.status === "servicing") sawServicing = true;
      if (player?.operations.pitStop.stopCount === 1) {
        sawCompleted = true;
        expect(player.tyreCondition.compound).toBe("hard");
        break;
      }
    }

    expect(sawServicing).toBe(true);
    expect(sawCompleted).toBe(true);
  });

  it("accepts the shared Rapier chassis world without moving ownership into the renderer", async () => {
    const grid = createRaceGrid(undefined, 2).map((participant) => ({
      ...participant,
      startPose: { ...participant.startPose, position: { x: -10, z: 10 } },
    }));
    const world = await RapierMultiCarCollision.create();
    try {
      const session = new RaceSession(grid, undefined, 1, 4);
      session.setCollisionWorld(world);
      session.start();
      const snapshot = session.step(neutralVehicleControlInput());
      expect(snapshot.contactCount).toBeGreaterThanOrEqual(1);
      expect(snapshot.standings.every((participant) => Number.isFinite(participant.positionM.x))).toBe(true);
    } finally {
      world.dispose();
    }
  });
});
