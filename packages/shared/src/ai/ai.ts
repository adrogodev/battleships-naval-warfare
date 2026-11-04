import type { Coord } from "../board/coord";
import { type Placement, randomFleet } from "../board/placement";
import type { PublicBoardView } from "../game/view";
import { pickOne, type Rng } from "../random/rng";
import type { GameRules } from "../rules/rules";
import { hardAi } from "./hard";
import { unshotCells } from "./knowledge";
import { normalAi } from "./normal";

export const DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/**
 * An AI opponent. It only ever receives the rival's PublicBoardView (plus the public rules),
 * never the game state, so it cannot see hidden ships by construction.
 */
export interface AiPlayer {
  readonly difficulty: Difficulty;
  chooseShot(view: PublicBoardView, rules: GameRules, rng: Rng): Coord;
  placeFleet(rules: GameRules, rng: Rng): Placement[];
}

/** Ensign: random shots without repeating cells, does not chase hits; random fleet. */
const easyAi: AiPlayer = {
  difficulty: "easy",
  chooseShot: (view, _rules, rng) => pickOne(rng, unshotCells(view)),
  placeFleet: (rules, rng) => randomFleet(rules, rng),
};

export function createAi(difficulty: Difficulty): AiPlayer {
  switch (difficulty) {
    case "easy":
      return easyAi;
    case "normal":
      return normalAi;
    case "hard":
      return hardAi;
  }
}
