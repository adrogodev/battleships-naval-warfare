import { describe, expect, it } from "vitest";
import { applyGame, averageAccuracy, EMPTY_PROGRESS, HEATMAP_SIZE } from "./progress";
import { RANKS } from "./ranks";
import { gameRecord } from "./testing";

const stats = gameRecord().stats;

describe("player progress aggregation", () => {
  it("counts games and wins by mode and difficulty", () => {
    let progress = EMPTY_PROGRESS;
    const games = [
      gameRecord({ id: "a", mode: "ai", difficulty: "easy", won: true }),
      gameRecord({ id: "b", mode: "ai", difficulty: "hard", won: false }),
      gameRecord({ id: "c", mode: "ai", difficulty: "hard", won: true }),
      gameRecord({ id: "d", mode: "online", difficulty: null, won: true }),
      gameRecord({ id: "e", mode: "online", difficulty: null, won: false }),
    ];
    for (const game of games) progress = applyGame(progress, game).progress;
    expect(progress.games).toBe(5);
    expect(progress.wins).toBe(3);
    expect(progress.byMode.ai.easy).toEqual({ played: 1, won: 1 });
    expect(progress.byMode.ai.normal).toEqual({ played: 0, won: 0 });
    expect(progress.byMode.ai.hard).toEqual({ played: 2, won: 1 });
    expect(progress.byMode.online).toEqual({ played: 2, won: 1 });
  });

  it("averages accuracy over the games with shots", () => {
    let progress = EMPTY_PROGRESS;
    expect(averageAccuracy(progress)).toBeNull();
    progress = applyGame(
      progress,
      gameRecord({ id: "a", stats: { ...stats, accuracy: 0.4 } }),
    ).progress;
    progress = applyGame(
      progress,
      gameRecord({ id: "b", stats: { ...stats, accuracy: 0.6 } }),
    ).progress;
    progress = applyGame(
      progress,
      gameRecord({
        id: "c",
        forfeited: true,
        won: false,
        stats: { ...stats, shots: 0, accuracy: 0 },
      }),
    ).progress;
    expect(averageAccuracy(progress)).toBeCloseTo(0.5);
  });

  it("keeps the best streak and the shortest victory in shots", () => {
    let progress = EMPTY_PROGRESS;
    expect(progress.shortestWinShots).toBeNull();
    progress = applyGame(
      progress,
      gameRecord({ id: "a", won: true, stats: { ...stats, shots: 60, maxStreak: 4 } }),
    ).progress;
    progress = applyGame(
      progress,
      gameRecord({ id: "b", won: true, stats: { ...stats, shots: 48, maxStreak: 2 } }),
    ).progress;
    // A short defeat is not a victory.
    progress = applyGame(
      progress,
      gameRecord({ id: "c", won: false, stats: { ...stats, shots: 20, maxStreak: 6 } }),
    ).progress;
    expect(progress.shortestWinShots).toBe(48);
    expect(progress.bestStreak).toBe(6);
  });

  it("counts the player's own shots on a 10×10 heatmap", () => {
    const progress = applyGame(
      EMPTY_PROGRESS,
      gameRecord({
        ownShots: [
          { col: 2, row: 6 },
          { col: 2, row: 6 },
          { col: 9, row: 9 },
          { col: 12, row: 0 },
        ],
      }),
    ).progress;
    expect(progress.heatmap).toHaveLength(HEATMAP_SIZE * HEATMAP_SIZE);
    expect(progress.heatmap[6 * HEATMAP_SIZE + 2]).toBe(2);
    expect(progress.heatmap[99]).toBe(1);
    expect(progress.heatmap.reduce((sum, value) => sum + value, 0)).toBe(3);
  });

  it("reports experience gained, promotion and newly completed challenges", () => {
    const first = applyGame(EMPTY_PROGRESS, gameRecord({ id: "a", won: true }));
    expect(first.report).not.toBeNull();
    expect(first.report?.xp.total).toBeGreaterThan(0);
    expect(first.progress.xp).toBe(first.report?.xp.total);
    expect(first.report?.rankBefore.index).toBe(0);
    expect(first.report?.rankUp).toBe(first.progress.xp >= (RANKS[1]?.minXp ?? 0));
    expect(first.report?.newChallenges).toContain("first-victory");
    expect(first.progress.completed).toContain("first-victory");

    const second = applyGame(first.progress, gameRecord({ id: "b", won: true }));
    // A completed challenge is only new once.
    expect(second.report?.newChallenges).not.toContain("first-victory");
    expect(second.progress.completed.filter((id) => id === "first-victory")).toHaveLength(1);
  });

  it("flags a promotion when the experience crosses a threshold", () => {
    const threshold = RANKS[1]?.minXp ?? 0;
    const start = { ...EMPTY_PROGRESS, xp: threshold - 1 };
    const result = applyGame(
      start,
      gameRecord({ id: "a", won: false, forfeited: true, enemyShipsSunk: ["destroyer"] }),
    );
    expect(result.report?.rankUp).toBe(true);
    expect(result.report?.rankAfter.index).toBe(1);
  });

  it("records each game only once (same id)", () => {
    const once = applyGame(EMPTY_PROGRESS, gameRecord({ id: "same" }));
    const twice = applyGame(once.progress, gameRecord({ id: "same" }));
    expect(twice.report).toBeNull();
    expect(twice.progress).toBe(once.progress);
    expect(twice.progress.games).toBe(1);
  });

  it("only remembers the most recent game ids", () => {
    let progress = EMPTY_PROGRESS;
    for (let index = 0; index < 80; index++) {
      progress = applyGame(progress, gameRecord({ id: `g${index}` })).progress;
    }
    expect(progress.recentGameIds.length).toBeLessThanOrEqual(50);
    expect(progress.recentGameIds).toContain("g79");
  });
});
