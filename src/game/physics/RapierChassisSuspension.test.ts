import { describe, expect, it } from "vitest";
import { RapierChassisSuspension } from "./RapierChassisSuspension";

describe("RapierChassisSuspension", () => {
  it("settles a dynamic chassis on four raycast suspension contacts", async () => {
    const rig = await RapierChassisSuspension.create();

    for (let step = 0; step < 960; step += 1) {
      rig.step(1 / 120);
    }

    const snapshot = rig.getSnapshot();
    const contacts = rig.getWheelContacts();

    expect(snapshot.position.y).toBeGreaterThan(0.35);
    expect(snapshot.position.y).toBeLessThan(0.65);
    expect(Math.abs(snapshot.linearVelocity.y)).toBeLessThan(0.2);
    expect(Object.values(contacts).every((contact) => contact.grounded)).toBe(true);
    expect(Object.values(contacts).every((contact) => contact.suspensionForceN > 0)).toBe(true);

    rig.syncPlanarPosition({ x: 12, z: -4 });
    rig.step(1 / 120);
    expect(rig.getSnapshot().position.x).toBeCloseTo(12, 4);
    expect(rig.getSnapshot().position.z).toBeCloseTo(-4, 4);

    rig.dispose();
  });
});
