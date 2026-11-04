import { allCoords, type Coord, coordKey, isInBounds, neighbours } from "../board/coord";
import { shipCells, shipLength } from "../board/placement";
import type { CellMark } from "../game/game";
import type { PublicBoardView } from "../game/view";
import type { GameRules } from "../rules/rules";

/**
 * What can be deduced about a rival board from its public view alone.
 * Every AI difficulty builds on this; none of it needs hidden information.
 */
export interface BoardKnowledge {
  readonly boardSize: number;
  /** Shots already fired, keyed by coordKey (a Map copy of `view.shots`, cheaper to query). */
  readonly marks: ReadonlyMap<string, CellMark>;
  /** Cells of ships already sunk. */
  readonly sunk: ReadonlySet<string>;
  /** Hits that do not belong to a sunk ship yet, in row-major order. */
  readonly openHits: readonly Coord[];
  /**
   * Unshot cells that can never hold a ship: with the no-contact rule, every cell around a sunk
   * ship (sides and corners). Empty when the rule is off.
   */
  readonly excluded: ReadonlySet<string>;
}

export function analyseView(view: PublicBoardView, rules: GameRules): BoardKnowledge {
  const marks = new Map(Object.entries(view.shots));
  const sunkCells = view.sunkShips.flatMap((placement) =>
    shipCells(placement, shipLength(rules, placement.shipId) ?? 0),
  );
  const sunk = new Set(sunkCells.map(coordKey));
  const excluded = new Set<string>();
  if (rules.noContact) {
    for (const cell of sunkCells) {
      for (const n of neighbours(cell, view.boardSize)) {
        if (!marks.has(coordKey(n))) excluded.add(coordKey(n));
      }
    }
  }
  const openHits: Coord[] = [];
  for (const coord of allCoords(view.boardSize)) {
    const key = coordKey(coord);
    if (marks.get(key) === "hit" && !sunk.has(key)) openHits.push(coord);
  }
  return { boardSize: view.boardSize, marks, sunk, openHits, excluded };
}

/** Whether a cell is on the board, not shot yet and not ruled out by the no-contact rule. */
export function isCandidate(knowledge: BoardKnowledge, coord: Coord): boolean {
  const key = coordKey(coord);
  return (
    isInBounds(coord, knowledge.boardSize) &&
    !knowledge.marks.has(key) &&
    !knowledge.excluded.has(key)
  );
}

/** Every cell worth shooting at, in row-major order. */
export function candidateCells(knowledge: BoardKnowledge): Coord[] {
  return allCoords(knowledge.boardSize).filter((coord) => isCandidate(knowledge, coord));
}

/** Unshot cells, ignoring deductions, in row-major order. Never repeats a shot. */
export function unshotCells(view: PublicBoardView): Coord[] {
  const shot = new Set(Object.keys(view.shots));
  return allCoords(view.boardSize).filter((coord) => !shot.has(coordKey(coord)));
}
