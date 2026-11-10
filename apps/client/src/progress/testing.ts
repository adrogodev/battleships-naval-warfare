import type { GameRecord } from "./game";

/** A finished game record with sensible defaults, for tests. */
export function gameRecord(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    id: "game-1",
    mode: "ai",
    difficulty: "easy",
    won: true,
    forfeited: false,
    stats: {
      shots: 50,
      hits: 17,
      accuracy: 17 / 50,
      maxStreak: 3,
      firstSinkTurn: 10,
      durationMs: 120_000,
    },
    ownShots: [],
    enemyShipsSunk: ["destroyer", "submarine", "cruiser", "battleship", "carrier"],
    ownShipsLost: 2,
    fleetSize: 5,
    ...overrides,
  };
}
