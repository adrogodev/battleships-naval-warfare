import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogEntry } from "../adapters/localAiGame";
import { MOTION, REDUCED_MOTION } from "../theme/motion";
import { planShot, type ShotPhase, ShotQueue } from "./shotQueue";

const own = (id: number, result: LogEntry["result"]): LogEntry =>
  result === "sunk"
    ? { id, seat: 0, coord: { col: id, row: 0 }, result, shipId: "destroyer" }
    : { id, seat: 0, coord: { col: id, row: 0 }, result };
const enemy = (id: number): LogEntry => ({
  id,
  seat: 1,
  coord: { col: id, row: 9 },
  result: "miss",
});

describe("planShot", () => {
  it("follows aim/fire/suspense/result timings for an own shot", () => {
    expect(planShot(own(0, "miss"), MOTION)).toEqual([
      { phase: "fire", at: 0 },
      { phase: "suspense", at: 150 },
      { phase: "impact", at: 450 },
      { phase: "done", at: 700 },
    ]);
  });

  it("adds a dramatic pause before revealing a sunk ship", () => {
    expect(planShot(own(0, "sunk"), MOTION)).toEqual([
      { phase: "fire", at: 0 },
      { phase: "suspense", at: 150 },
      { phase: "impact", at: 450 },
      { phase: "sunk", at: 750 },
      { phase: "done", at: 1000 },
    ]);
  });

  it("keeps a whole own shot under 200 ms with reduced motion, sinking included", () => {
    for (const result of ["miss", "hit", "sunk"] as const) {
      const steps = planShot(own(0, result), REDUCED_MOTION);
      expect(steps.at(-1)?.at).toBeLessThan(200);
    }
  });

  it("plays incoming enemy shots without the fire phase", () => {
    const phases = planShot(enemy(0), MOTION).map((step) => step.phase);
    expect(phases).toEqual(["suspense", "impact", "done"]);
  });
});

describe("ShotQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reveals entries one after another, in order", () => {
    const seen: [number, ShotPhase][] = [];
    const queue = new ShotQueue({
      motion: () => MOTION,
      onPhase: (entry, phase) => seen.push([entry.id, phase]),
    });
    queue.sync([own(0, "miss"), enemy(1)]);
    expect(queue.getSnapshot().busy).toBe(true);
    expect(queue.getSnapshot().impacted).toBe(0);

    vi.advanceTimersByTime(450);
    expect(queue.getSnapshot().impacted).toBe(1);
    vi.advanceTimersByTime(250);
    expect(queue.getSnapshot().active?.entry.id).toBe(1);
    vi.advanceTimersByTime(700);

    expect(queue.getSnapshot()).toMatchObject({ busy: false, impacted: 2, active: null });
    expect(seen).toEqual([
      [0, "fire"],
      [0, "suspense"],
      [0, "impact"],
      [0, "done"],
      [1, "suspense"],
      [1, "impact"],
      [1, "done"],
    ]);
  });

  it("only reveals a sunk silhouette at the sunk phase", () => {
    const queue = new ShotQueue({ motion: () => MOTION });
    queue.sync([own(0, "sunk")]);
    vi.advanceTimersByTime(450);
    expect(queue.getSnapshot().impacted).toBe(1);
    expect(queue.getSnapshot().sunkRevealed.has(0)).toBe(false);
    vi.advanceTimersByTime(300);
    expect(queue.getSnapshot().sunkRevealed.has(0)).toBe(true);
  });

  it("ignores entries it already queued and notifies subscribers", () => {
    const queue = new ShotQueue({ motion: () => REDUCED_MOTION });
    let calls = 0;
    queue.subscribe(() => {
      calls++;
    });
    const log = [own(0, "hit")];
    queue.sync(log);
    queue.sync(log);
    vi.runAllTimers();
    expect(queue.getSnapshot().impacted).toBe(1);
    expect(calls).toBeGreaterThan(0);
  });

  it("adopts an existing history instantly (reconnect) and only animates new shots", () => {
    const seen: [number, ShotPhase][] = [];
    const queue = new ShotQueue({
      motion: () => MOTION,
      onPhase: (entry, phase) => seen.push([entry.id, phase]),
    });
    queue.adopt([own(0, "sunk"), enemy(1)]);
    expect(queue.getSnapshot()).toMatchObject({ busy: false, impacted: 2, active: null });
    expect(queue.getSnapshot().sunkRevealed.has(0)).toBe(true);
    expect(seen).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    queue.sync([own(0, "sunk"), enemy(1), own(2, "miss")]);
    expect(queue.getSnapshot().active?.entry.id).toBe(2);
  });

  it("can skip straight to the end and stops its timers on dispose", () => {
    const queue = new ShotQueue({ motion: () => MOTION });
    queue.sync([own(0, "sunk"), enemy(1)]);
    queue.skipAll();
    expect(queue.getSnapshot()).toMatchObject({ busy: false, impacted: 2 });
    expect(queue.getSnapshot().sunkRevealed.has(0)).toBe(true);
    queue.sync([own(0, "sunk"), enemy(1), own(2, "miss")]);
    queue.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
