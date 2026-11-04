import {
  coordKey,
  type GameRules,
  neighbours,
  type Placement,
  type Seat,
  shipCells,
  shipLength,
} from "@battleships/shared";
import type { LogEntry } from "../adapters/localAiGame";

export interface BoardPresentation {
  /** Revealed shots on this board, keyed by coordKey. */
  readonly marks: ReadonlyMap<string, "miss" | "hit">;
  /** Sunk ships whose silhouette has been revealed. */
  readonly sunkShips: readonly Placement[];
  /** Unshot cells ruled out by the no-contact rule around revealed sunk ships. */
  readonly blocked: ReadonlySet<string>;
}

interface PresentBoardInput {
  readonly log: readonly LogEntry[];
  /** Seat that fired at this board: 0 for the radar, 1 for the own deck. */
  readonly seat: Seat;
  readonly impacted: number;
  readonly sunkRevealed: ReadonlySet<number>;
  /** Positions of ships sunk on this board (from the player's view). */
  readonly sunkPlacements: readonly Placement[];
  readonly rules: GameRules;
  readonly showBlocked: boolean;
}

/** What a board shows right now: the game result filtered by what the shot sequence revealed. */
export function presentBoard(input: PresentBoardInput): BoardPresentation {
  const marks = new Map<string, "miss" | "hit">();
  const sunkIds = new Set<string>();
  for (const entry of input.log.slice(0, input.impacted)) {
    if (entry.seat !== input.seat) continue;
    marks.set(coordKey(entry.coord), entry.result === "miss" ? "miss" : "hit");
    if (entry.result === "sunk" && entry.shipId && input.sunkRevealed.has(entry.id)) {
      sunkIds.add(entry.shipId);
    }
  }
  const sunkShips = input.sunkPlacements.filter((p) => sunkIds.has(p.shipId));

  const blocked = new Set<string>();
  if (input.showBlocked && input.rules.noContact) {
    for (const ship of sunkShips) {
      for (const cell of shipCells(ship, shipLength(input.rules, ship.shipId) ?? 0)) {
        for (const n of neighbours(cell, input.rules.boardSize)) {
          const key = coordKey(n);
          if (!marks.has(key)) blocked.add(key);
        }
      }
    }
  }
  return { marks, sunkShips, blocked };
}

/** Consecutive own hits (or sinkings) among the revealed entries. */
export function currentStreak(log: readonly LogEntry[], impacted: number): number {
  let streak = 0;
  for (const entry of log.slice(0, impacted)) {
    if (entry.seat !== 0) continue;
    streak = entry.result === "miss" ? 0 : streak + 1;
  }
  return streak;
}

/** Music layers in battle: 1 base, 2 when a fleet is down to two ships, 3 at the end game or on a streak. */
export function musicIntensity(state: {
  ownAfloat: number;
  enemyAfloat: number;
  streak: number;
}): 1 | 2 | 3 {
  const fewest = Math.min(state.ownAfloat, state.enemyAfloat);
  if (fewest <= 1 || state.streak >= 3) return 3;
  if (fewest <= 2) return 2;
  return 1;
}
