import { allCoords, type Coord, coordKey } from "../board/coord";
import { type Placement, randomFleet, shipCells, shipLength } from "../board/placement";
import type { PublicBoardView } from "../game/view";
import { pickOne, type Rng } from "../random/rng";
import type { GameRules } from "../rules/rules";
import type { AiPlayer } from "./ai";
import { analyseView, candidateCells, unshotCells } from "./knowledge";

/**
 * Weight of a ship position that covers `n` open hits: OPEN_HIT_WEIGHT ** n. A position that
 * explains more of the hits already seen is more likely to be the real one, so it scores higher.
 */
export const OPEN_HIT_WEIGHT = 5;

/**
 * Probability (density) map of the rival board, indexed `map[row][col]`.
 *
 * For each remaining ship and each orientation and bow, a position counts when all its cells are
 * on the board, none is a miss or part of a sunk ship and, with the no-contact rule, none touches a
 * sunk ship. With the no-contact rule a position is also discarded when it touches an open hit it
 * does not cover (that hit belongs to another ship, which could not be in contact).
 * While open hits exist, only positions covering at least one of them count, weighted by
 * OPEN_HIT_WEIGHT ** (open hits covered). Each counted position adds its weight to its unshot
 * cells; already-shot cells always stay at 0. Uses only the public view and the public rules.
 */
export function densityMap(view: PublicBoardView, rules: GameRules): number[][] {
  const size = view.boardSize;
  const knowledge = analyseView(view, rules);
  // Flat grid (index row * size + col) of what each cell can still be.
  const state = new Uint8Array(size * size);
  for (const coord of allCoords(size)) {
    const key = coordKey(coord);
    const mark = knowledge.marks.get(key);
    const index = coord.row * size + coord.col;
    if (mark === "miss" || knowledge.sunk.has(key) || knowledge.excluded.has(key)) {
      state[index] = BLOCKED;
    } else if (mark === "hit") {
      state[index] = OPEN_HIT;
    }
  }
  const hasOpenHits = knowledge.openHits.length > 0;
  const density = new Float64Array(size * size);

  for (const ship of view.remainingShips) {
    const length = ship.length;
    for (const [dCol, dRow] of DIRECTIONS) {
      for (let row = 0; row + dRow * (length - 1) < size; row++) {
        for (let col = 0; col + dCol * (length - 1) < size; col++) {
          let covered = 0;
          let valid = true;
          for (let i = 0; i < length; i++) {
            const cell = state[(row + dRow * i) * size + col + dCol * i];
            if (cell === BLOCKED) {
              valid = false;
              break;
            }
            if (cell === OPEN_HIT) covered++;
          }
          if (!valid || (hasOpenHits && covered === 0)) continue;
          const position = { col, row, dCol, dRow, length };
          if (rules.noContact && hasOpenHits && touchesForeignOpenHit(state, size, position)) {
            continue;
          }
          const weight = OPEN_HIT_WEIGHT ** covered;
          for (let i = 0; i < length; i++) {
            const index = (row + dRow * i) * size + col + dCol * i;
            if (state[index] === UNKNOWN) density[index] = (density[index] ?? 0) + weight;
          }
        }
      }
    }
  }
  return Array.from({ length: size }, (_, row) =>
    Array.from(density.subarray(row * size, (row + 1) * size)),
  );
}

const UNKNOWN = 0;
const BLOCKED = 1;
const OPEN_HIT = 2;
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
];

/**
 * No-contact pruning: a position that touches (sides or corners) an open hit it does not cover is
 * impossible, because that hit belongs to another ship and ships may not touch.
 */
function touchesForeignOpenHit(
  state: Uint8Array,
  size: number,
  position: { col: number; row: number; dCol: number; dRow: number; length: number },
): boolean {
  const { col, row, dCol, dRow, length } = position;
  const covers = (c: number, r: number) => {
    const i = dCol === 1 ? c - col : r - row;
    return i >= 0 && i < length && c === col + dCol * i && r === row + dRow * i;
  };
  for (let i = 0; i < length; i++) {
    const c = col + dCol * i;
    const r = row + dRow * i;
    for (let y = -1; y <= 1; y++) {
      for (let x = -1; x <= 1; x++) {
        const nc = c + x;
        const nr = r + y;
        if (nc < 0 || nr < 0 || nc >= size || nr >= size) continue;
        if (state[nr * size + nc] === OPEN_HIT && !covers(nc, nr)) return true;
      }
    }
  }
  return false;
}

/** Admiral: fires at a cell of maximum density; ties are broken at random. */
export function chooseHardShot(view: PublicBoardView, rules: GameRules, rng: Rng): Coord {
  const map = densityMap(view, rules);
  let best: Coord[] = [];
  let max = 0;
  for (const [row, line] of map.entries()) {
    for (const [col, value] of line.entries()) {
      if (value > max) {
        max = value;
        best = [{ col, row }];
      } else if (value === max && value > 0) {
        best.push({ col, row });
      }
    }
  }
  if (best.length > 0) return pickOne(rng, best);
  // Only reachable with an inconsistent view: fall back to any sensible cell.
  const candidates = candidateCells(analyseView(view, rules));
  return pickOne(rng, candidates.length > 0 ? candidates : unshotCells(view));
}

/**
 * How predictable a fleet looks (lower is better):
 * - |horizontal - vertical| ships (all ships sharing one orientation is a pattern);
 * - 2 points per ship touching the border beyond the first two (hugging the edges);
 * - 2 points per board quadrant left without a ship centre, up to the fleet size
 *   (ships packed into one region).
 */
export function fleetObviousness(fleet: readonly Placement[], rules: GameRules): number {
  const size = rules.boardSize;
  let horizontal = 0;
  let onBorder = 0;
  const quadrants = new Set<number>();
  for (const placement of fleet) {
    const cells = shipCells(placement, shipLength(rules, placement.shipId) ?? 0);
    if (placement.orientation === "h") horizontal++;
    if (cells.some((c) => c.col === 0 || c.row === 0 || c.col === size - 1 || c.row === size - 1)) {
      onBorder++;
    }
    const first = cells[0];
    const last = cells[cells.length - 1];
    if (first && last) {
      const midCol = (first.col + last.col) / 2;
      const midRow = (first.row + last.row) / 2;
      quadrants.add((midCol < (size - 1) / 2 ? 0 : 1) + (midRow < (size - 1) / 2 ? 0 : 2));
    }
  }
  const vertical = fleet.length - horizontal;
  return (
    Math.abs(horizontal - vertical) +
    2 * Math.max(0, onBorder - 2) +
    2 * (Math.min(4, fleet.length) - quadrants.size)
  );
}

export const HARD_PLACEMENT_SAMPLES = 30;

/** Samples random valid fleets and keeps the least obvious one (first one wins ties). */
export function unobviousFleet(rules: GameRules, rng: Rng): Placement[] {
  let best = randomFleet(rules, rng);
  let bestScore = fleetObviousness(best, rules);
  for (let i = 1; i < HARD_PLACEMENT_SAMPLES; i++) {
    const fleet = randomFleet(rules, rng);
    const score = fleetObviousness(fleet, rules);
    if (score < bestScore) {
      best = fleet;
      bestScore = score;
    }
  }
  return best;
}

export const hardAi: AiPlayer = {
  difficulty: "hard",
  chooseShot: chooseHardShot,
  placeFleet: unobviousFleet,
};
