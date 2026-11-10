import { describe, expect, it } from "vitest";
import { gameRecord } from "./testing";
import { xpForGame } from "./xp";

describe("experience per game", () => {
  it("adds participation, victory, accuracy and sinkings", () => {
    const xp = xpForGame(
      gameRecord({
        difficulty: "easy",
        won: true,
        stats: { ...gameRecord().stats, accuracy: 0.5 },
        enemyShipsSunk: ["destroyer", "submarine", "cruiser", "battleship", "carrier"],
      }),
    );
    expect(xp).toEqual({ participation: 20, victory: 100, accuracy: 25, sinkings: 75, total: 220 });
  });

  it("rewards a victory more on harder rivals and online", () => {
    const victory = (record: Parameters<typeof gameRecord>[0]) =>
      xpForGame(gameRecord(record)).victory;
    expect(victory({ mode: "ai", difficulty: "easy" })).toBe(100);
    expect(victory({ mode: "ai", difficulty: "normal" })).toBe(150);
    expect(victory({ mode: "ai", difficulty: "hard" })).toBe(200);
    expect(victory({ mode: "online", difficulty: null })).toBe(150);
  });

  it("gives no victory experience for a defeat", () => {
    const xp = xpForGame(
      gameRecord({
        won: false,
        stats: { ...gameRecord().stats, accuracy: 0.2 },
        enemyShipsSunk: ["destroyer"],
      }),
    );
    expect(xp).toEqual({ participation: 20, victory: 0, accuracy: 10, sinkings: 15, total: 45 });
  });

  it("gives no victory experience when the rival abandoned, keeping what the player earned", () => {
    const xp = xpForGame(
      gameRecord({
        mode: "online",
        difficulty: null,
        won: true,
        rivalForfeited: true,
        stats: { ...gameRecord().stats, accuracy: 0.4 },
        enemyShipsSunk: ["destroyer"],
      }),
    );
    expect(xp).toEqual({ participation: 20, victory: 0, accuracy: 20, sinkings: 15, total: 55 });
  });

  it("only keeps the sinkings when the player abandoned", () => {
    const xp = xpForGame(
      gameRecord({
        won: false,
        forfeited: true,
        stats: { ...gameRecord().stats, accuracy: 1 },
        enemyShipsSunk: ["destroyer"],
      }),
    );
    expect(xp).toEqual({ participation: 0, victory: 0, accuracy: 0, sinkings: 15, total: 15 });
  });
});
