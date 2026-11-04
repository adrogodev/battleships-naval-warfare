import { type Coord, coordKey } from "../board/coord";
import { type Placement, randomFleet } from "../board/placement";
import type { PublicBoardView } from "../game/view";
import { pickOne, type Rng } from "../random/rng";
import type { GameRules } from "../rules/rules";
import type { AiPlayer } from "./ai";
import {
  analyseView,
  type BoardKnowledge,
  candidateCells,
  isCandidate,
  unshotCells,
} from "./knowledge";

const ORTHOGONAL: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Cells that extend a line of two or more orthogonally adjacent open hits: the candidate cell
 * right before and right after each contiguous segment.
 */
function lineTargets(knowledge: BoardKnowledge): Coord[] {
  const open = new Set(knowledge.openHits.map(coordKey));
  const isOpen = (col: number, row: number) => open.has(coordKey({ col, row }));
  const targets = new Map<string, Coord>();
  for (const hit of knowledge.openHits) {
    for (const [dCol, dRow] of [
      [1, 0],
      [0, 1],
    ] as const) {
      // Only walk each segment once, from its first cell.
      if (isOpen(hit.col - dCol, hit.row - dRow)) continue;
      let length = 1;
      while (isOpen(hit.col + dCol * length, hit.row + dRow * length)) length++;
      if (length < 2) continue;
      const ends = [
        { col: hit.col - dCol, row: hit.row - dRow },
        { col: hit.col + dCol * length, row: hit.row + dRow * length },
      ];
      for (const end of ends) {
        if (isCandidate(knowledge, end)) targets.set(coordKey(end), end);
      }
    }
  }
  return [...targets.values()];
}

/** Candidate cells orthogonally next to any open hit. */
function neighbourTargets(knowledge: BoardKnowledge): Coord[] {
  const targets = new Map<string, Coord>();
  for (const hit of knowledge.openHits) {
    for (const [dCol, dRow] of ORTHOGONAL) {
      const next = { col: hit.col + dCol, row: hit.row + dRow };
      if (isCandidate(knowledge, next)) targets.set(coordKey(next), next);
    }
  }
  return [...targets.values()];
}

/**
 * Captain: hunt mode fires at random on a checkerboard (every ship of length 2+ covers one of
 * those cells); target mode tries the neighbours of a hit and, once two hits are aligned, follows
 * that line until the ship sinks. Stateless: everything is re-derived from the public view.
 * It deliberately does not deduce anything from the no-contact rule (only the Admiral does).
 */
export function chooseNormalShot(view: PublicBoardView, rules: GameRules, rng: Rng): Coord {
  const knowledge = analyseView(view, { ...rules, noContact: false });
  if (knowledge.openHits.length > 0) {
    const line = lineTargets(knowledge);
    if (line.length > 0) return pickOne(rng, line);
    const around = neighbourTargets(knowledge);
    if (around.length > 0) return pickOne(rng, around);
  }
  const candidates = candidateCells(knowledge);
  const checkerboard = candidates.filter((coord) => (coord.col + coord.row) % 2 === 0);
  if (checkerboard.length > 0) return pickOne(rng, checkerboard);
  if (candidates.length > 0) return pickOne(rng, candidates);
  return pickOne(rng, unshotCells(view));
}

const MAX_MIXED_FLEET_ATTEMPTS = 20;

/** A random valid fleet that mixes horizontal and vertical ships (when the fleet allows it). */
export function mixedFleet(rules: GameRules, rng: Rng): Placement[] {
  let fleet = randomFleet(rules, rng);
  for (let attempt = 1; attempt < MAX_MIXED_FLEET_ATTEMPTS; attempt++) {
    if (new Set(fleet.map((placement) => placement.orientation)).size === 2) return fleet;
    fleet = randomFleet(rules, rng);
  }
  return fleet;
}

export const normalAi: AiPlayer = {
  difficulty: "normal",
  chooseShot: chooseNormalShot,
  placeFleet: mixedFleet,
};
