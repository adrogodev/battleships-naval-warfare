import { allCoords, type Coord, coordKey } from "../board/coord";
import { type Placement, randomFleet } from "../board/placement";
import type { PublicBoardView } from "../game/view";
import { pickOne, type Rng } from "../random/rng";
import type { GameRules } from "../rules/rules";

/** Normal and Hard arrive in Phase 3. */
export type Difficulty = "easy";

/**
 * An AI opponent. It only ever receives the rival's PublicBoardView, never the game state,
 * so it cannot see hidden ships by construction.
 */
export interface AiPlayer {
  readonly difficulty: Difficulty;
  chooseShot(view: PublicBoardView, rng: Rng): Coord;
  placeFleet(rules: GameRules, rng: Rng): Placement[];
}

function unshotCells(view: PublicBoardView): Coord[] {
  return allCoords(view.boardSize).filter((coord) => view.shots[coordKey(coord)] === undefined);
}

/** Ensign: random shots without repeating cells, does not chase hits; random fleet. */
const easyAi: AiPlayer = {
  difficulty: "easy",
  chooseShot: (view, rng) => pickOne(rng, unshotCells(view)),
  placeFleet: (rules, rng) => randomFleet(rules, rng),
};

export function createAi(difficulty: Difficulty): AiPlayer {
  switch (difficulty) {
    case "easy":
      return easyAi;
  }
}
