import type { Coord, Difficulty, ShipId, ShotRecord } from "@battleships/shared";
import type { BattleStats } from "../adapters/battleStats";
import type { GameSnapshot } from "../adapters/localAiGame";

export type GameMode = "ai" | "online";

/** Everything progression needs from one finished game, from the player's point of view. */
export interface GameRecord {
  /** Unique per game: the record-once guard (see aiGameId / onlineGameId). */
  readonly id: string;
  readonly mode: GameMode;
  /** AI difficulty; null online. */
  readonly difficulty: Difficulty | null;
  readonly won: boolean;
  /** The player abandoned the battle. */
  readonly forfeited: boolean;
  readonly stats: BattleStats;
  /** The player's own shots, in order (heatmap). */
  readonly ownShots: readonly Coord[];
  /** Enemy ships the player sank, in sinking order. */
  readonly enemyShipsSunk: readonly ShipId[];
  readonly ownShipsLost: number;
  readonly fleetSize: number;
}

export interface GameMeta {
  readonly id: string;
  readonly mode: GameMode;
  readonly difficulty: Difficulty | null;
}

/** Builds the record from a finished snapshot (seat 0 is always the player in snapshots). */
export function gameRecordFromSnapshot(snapshot: GameSnapshot, meta: GameMeta): GameRecord {
  const { view, log, stats } = snapshot;
  const own = log.filter((entry) => entry.seat === 0);
  const won = view.winner === view.you;
  const fleetSize = view.rules.fleet.length;
  return {
    ...meta,
    won,
    forfeited: !won && view.ownSunk.length < fleetSize,
    stats,
    ownShots: own.map((entry) => entry.coord),
    enemyShipsSunk: own.flatMap((entry) =>
      entry.result === "sunk" && entry.shipId ? [entry.shipId] : [],
    ),
    ownShipsLost: view.ownSunk.length,
    fleetSize,
  };
}

let localGames = 0;

/** A fresh id for each local game, even when two games share a seed. */
export function aiGameId(seed: number): string {
  localGames++;
  return `ai:${seed}:${Date.now()}:${localGames}`;
}

/**
 * Online games are identified by room code plus a fingerprint of the full shot log: a reload of
 * the same finished game yields the same id (no double count), while a rematch in the same room
 * plays a different log. The client round counter is not used because a reload resets it.
 */
export function onlineGameId(roomCode: string, log: readonly ShotRecord[]): string {
  let hash = 0;
  for (const entry of log) {
    const text = `${entry.seat}${entry.coord.col},${entry.coord.row}${entry.result}${entry.shipId ?? ""};`;
    for (const char of text) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  }
  return `online:${roomCode}:${log.length}:${(hash >>> 0).toString(36)}`;
}
