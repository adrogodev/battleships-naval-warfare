import { describe, expect, it } from "vitest";
import { randomFleet } from "../board/placement";
import { createRng } from "../random/rng";
import { DEFAULT_RULES } from "../rules/rules";
import { createAi } from "./ai";
import { playGame, simulateGames, summarizeShots } from "./simulate";

describe("playGame", () => {
  it("fires until the defender fleet is sunk", () => {
    const shots = playGame({
      ai: createAi("easy"),
      rules: DEFAULT_RULES,
      defenderFleet: randomFleet(DEFAULT_RULES, createRng(1)),
      rng: createRng(2),
    });
    expect(shots).toBeGreaterThanOrEqual(17);
    expect(shots).toBeLessThanOrEqual(100);
  });
});

describe("summarizeShots", () => {
  it("computes mean, median, p90, min and max", () => {
    expect(summarizeShots([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])).toEqual({
      mean: 55,
      median: 55,
      p90: 90,
      min: 10,
      max: 100,
    });
    expect(summarizeShots([3, 1, 2])).toMatchObject({ median: 2, min: 1, max: 3 });
  });
});

describe("simulateGames", () => {
  it("is reproducible for a seed", () => {
    const a = simulateGames({ difficulty: "hard", games: 20, seed: 5 });
    const b = simulateGames({ difficulty: "hard", games: 20, seed: 5 });
    expect(a.shotsPerGame).toEqual(b.shotsPerGame);
    expect(a.mean).toBe(b.mean);
    expect(a.games).toBe(20);
    expect(a.shotsPerGame).toHaveLength(20);
  });

  it("ranks the difficulties: hard < normal < easy in mean shots", () => {
    const mean = (difficulty: "easy" | "normal" | "hard") =>
      simulateGames({ difficulty, games: 200, seed: 42 }).mean;
    const easy = mean("easy");
    const normal = mean("normal");
    const hard = mean("hard");
    expect(hard).toBeLessThan(normal);
    expect(normal).toBeLessThan(easy);
    // 600 full games take a few seconds; the default 5 s timeout is too tight on a busy machine.
  }, 30_000);
});
