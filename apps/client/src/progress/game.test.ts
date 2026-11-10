import { DEFAULT_RULES, type ShotRecord } from "@battleships/shared";
import { describe, expect, it } from "vitest";
import { computeBattleStats } from "../adapters/battleStats";
import type { GameSnapshot } from "../adapters/localAiGame";
import { fakeView } from "../multiplayer/testing/fakeSocket";
import { aiGameId, gameRecordFromSnapshot, onlineGameId } from "./game";

const log: ShotRecord[] = [
  { id: 0, seat: 0, coord: { col: 0, row: 0 }, result: "hit" },
  { id: 1, seat: 0, coord: { col: 1, row: 0 }, result: "sunk", shipId: "destroyer" },
  { id: 2, seat: 0, coord: { col: 5, row: 5 }, result: "miss" },
  { id: 3, seat: 1, coord: { col: 3, row: 3 }, result: "sunk", shipId: "submarine" },
  { id: 4, seat: 0, coord: { col: 9, row: 9 }, result: "sunk", shipId: "carrier" },
];

function snapshot(overrides: Partial<GameSnapshot["view"]> = {}): GameSnapshot {
  return {
    view: fakeView({ phase: "finished", winner: 0, ...overrides }),
    log,
    aiThinking: false,
    stats: computeBattleStats(log, { ownSeat: 0, startedAt: 0, endedAt: 1000, now: 1000 }),
    revealedEnemyFleet: null,
  };
}

describe("game record from a finished snapshot", () => {
  it("takes the result, the player's shots and the sinking order from the log", () => {
    const submarine = DEFAULT_RULES.fleet.find((ship) => ship.id === "submarine");
    if (!submarine) throw new Error("no submarine");
    const record = gameRecordFromSnapshot(snapshot({ ownSunk: [submarine] }), {
      id: "x",
      mode: "ai",
      difficulty: "hard",
    });
    expect(record).toMatchObject({
      id: "x",
      mode: "ai",
      difficulty: "hard",
      won: true,
      forfeited: false,
      ownShipsLost: 1,
      fleetSize: DEFAULT_RULES.fleet.length,
      enemyShipsSunk: ["destroyer", "carrier"],
    });
    expect(record.ownShots).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 5, row: 5 },
      { col: 9, row: 9 },
    ]);
    // Reuses the per-game stats of the adapter.
    expect(record.stats.shots).toBe(4);
  });

  it("marks a defeat with ships still afloat as the player's forfeit", () => {
    const record = gameRecordFromSnapshot(snapshot({ winner: 1, ownSunk: [] }), {
      id: "x",
      mode: "ai",
      difficulty: "easy",
    });
    expect(record.won).toBe(false);
    expect(record.forfeited).toBe(true);
  });

  it("marks a win with enemy ships still afloat as the rival's forfeit, and a full sinking not", () => {
    const meta = { id: "x", mode: "online", difficulty: null } as const;
    // The fixture log sinks only two enemy ships: the rival left before losing the rest.
    expect(gameRecordFromSnapshot(snapshot(), meta).rivalForfeited).toBe(true);

    const fullLog: ShotRecord[] = DEFAULT_RULES.fleet.map((ship, id) => ({
      id,
      seat: 0,
      coord: { col: id, row: 0 },
      result: "sunk",
      shipId: ship.id,
    }));
    const sunkAll: GameSnapshot = { ...snapshot(), log: fullLog };
    const record = gameRecordFromSnapshot(sunkAll, meta);
    expect(record.won).toBe(true);
    expect(record.rivalForfeited).toBe(false);
  });

  it("identifies an online game by room and shot log, so a reload does not count it twice", () => {
    expect(onlineGameId("ABC234", log)).toBe(onlineGameId("ABC234", [...log]));
    expect(onlineGameId("ABC234", log)).not.toBe(onlineGameId("XYZ987", log));
    // A rematch in the same room plays a different log.
    expect(onlineGameId("ABC234", log)).not.toBe(onlineGameId("ABC234", log.slice(0, 4)));
  });

  it("gives every local game a distinct id", () => {
    expect(aiGameId(42)).not.toBe(aiGameId(42));
  });
});
