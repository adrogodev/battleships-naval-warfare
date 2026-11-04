import { describe, expect, it, vi } from "vitest";
import { burstPreset, createFxBus } from "./bursts";

describe("burstPreset", () => {
  it("miss is a splash", () => {
    expect(burstPreset("miss", 10, 20).map((b) => b.kind)).toEqual(["splash"]);
  });

  it("hit is an explosion plus smoke", () => {
    expect(burstPreset("hit", 10, 20).map((b) => b.kind)).toEqual(["explosion", "smoke"]);
  });

  it("sunk is a bigger explosion plus debris and smoke", () => {
    const sunk = burstPreset("sunk", 10, 20);
    expect(sunk.map((b) => b.kind)).toEqual(["explosion", "debris", "smoke"]);
    const hitExplosion = burstPreset("hit")[0]?.count ?? 0;
    const sunkExplosion = sunk[0]?.count ?? 0;
    expect(sunkExplosion).toBeGreaterThan(hitExplosion);
  });

  it("places every burst at the given point", () => {
    for (const b of burstPreset("sunk", 7, 9)) {
      expect(b.x).toBe(7);
      expect(b.y).toBe(9);
    }
  });
});

describe("fxBus", () => {
  it("delivers bursts to subscribers until they unsubscribe", () => {
    const bus = createFxBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);
    bus.emit({ kind: "splash", x: 1, y: 2 });
    expect(listener).toHaveBeenCalledWith({ kind: "splash", x: 1, y: 2 });
    unsubscribe();
    bus.emit({ kind: "splash", x: 1, y: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
