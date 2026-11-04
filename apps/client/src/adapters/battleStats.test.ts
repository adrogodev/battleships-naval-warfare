import type { ShotRecord } from "@battleships/shared";
import { describe, expect, it } from "vitest";
import { computeBattleStats } from "./battleStats";

const shot = (id: number, seat: 0 | 1, result: ShotRecord["result"], col = id): ShotRecord =>
  result === "sunk"
    ? { id, seat, coord: { col, row: 0 }, result, shipId: "destroyer" }
    : { id, seat, coord: { col, row: 0 }, result };

describe("computeBattleStats", () => {
  it("counts only the own seat's shots, accuracy, best streak and first sinking", () => {
    const log = [
      shot(0, 0, "hit"),
      shot(1, 1, "hit"),
      shot(2, 0, "sunk"),
      shot(3, 0, "miss"),
      shot(4, 1, "sunk"),
      shot(5, 0, "hit"),
    ];
    expect(
      computeBattleStats(log, { ownSeat: 0, startedAt: 1_000, endedAt: 4_500, now: 9_999 }),
    ).toEqual({
      shots: 4,
      hits: 3,
      accuracy: 0.75,
      maxStreak: 2,
      firstSinkTurn: 2,
      durationMs: 3_500,
    });
  });

  it("works for the other seat and measures an ongoing battle up to now", () => {
    const log = [shot(0, 0, "hit"), shot(1, 1, "miss"), shot(2, 1, "sunk")];
    const stats = computeBattleStats(log, {
      ownSeat: 1,
      startedAt: 1_000,
      endedAt: null,
      now: 2_000,
    });
    expect(stats).toMatchObject({ shots: 2, hits: 1, accuracy: 0.5, firstSinkTurn: 2 });
    expect(stats.durationMs).toBe(1_000);
  });

  it("is all zeros before the battle starts", () => {
    expect(computeBattleStats([], { ownSeat: 0, startedAt: null, endedAt: null, now: 5 })).toEqual({
      shots: 0,
      hits: 0,
      accuracy: 0,
      maxStreak: 0,
      firstSinkTurn: null,
      durationMs: 0,
    });
  });
});
