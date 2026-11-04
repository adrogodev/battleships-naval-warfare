import type { Coord } from "../board/coord";
import { type Placement, randomFleet } from "../board/placement";
import { createGame, type GameState, reduce } from "../game/game";
import { type PublicBoardView, publicBoardView } from "../game/view";
import { createRng, type Rng } from "../random/rng";
import { DEFAULT_RULES, type GameRules } from "../rules/rules";
import { type AiPlayer, createAi, type Difficulty } from "./ai";

const DEFENDER = 0;
const SHOOTER = 1;

export interface PlayGameOptions {
  readonly ai: AiPlayer;
  readonly rules: GameRules;
  readonly defenderFleet: readonly Placement[];
  readonly rng: Rng;
  /** Called with the public view the AI saw and the shot it chose, before the shot resolves. */
  readonly onShot?: (view: PublicBoardView, coord: Coord) => void;
}

function mustReduce(state: GameState, action: Parameters<typeof reduce>[1]): GameState {
  const result = reduce(state, action);
  if (!result.ok) throw new Error(`Simulation rejected ${action.type}: ${result.error}`);
  return result.state;
}

/**
 * Lets the AI fire at a hidden fleet until it is sunk and returns the number of shots.
 * Every shot resolves through the real `reduce`; the defender never fires, so the turn is handed
 * straight back to the AI. The AI only ever receives `publicBoardView` of the defender board.
 */
export function playGame(options: PlayGameOptions): number {
  const { ai, rules, defenderFleet, rng, onShot } = options;
  let state = createGame(rules, { firstTurn: SHOOTER });
  state = mustReduce(state, { type: "join", seat: DEFENDER });
  state = mustReduce(state, { type: "join", seat: SHOOTER });
  state = mustReduce(state, { type: "submitFleet", seat: DEFENDER, fleet: defenderFleet });
  // The shooter's own fleet is never fired at; any valid fleet will do.
  state = mustReduce(state, { type: "submitFleet", seat: SHOOTER, fleet: defenderFleet });

  const maxShots = rules.boardSize * rules.boardSize;
  let shots = 0;
  while (state.phase === "battle") {
    if (shots >= maxShots) throw new Error("Simulation exceeded the number of cells");
    const view = publicBoardView(state, DEFENDER);
    const coord = ai.chooseShot(view, rules, rng);
    onShot?.(view, coord);
    state = mustReduce(state, { type: "fire", seat: SHOOTER, coord });
    shots++;
    if (state.phase === "battle") state = { ...state, turn: SHOOTER };
  }
  return shots;
}

export interface ShotSummary {
  readonly mean: number;
  readonly median: number;
  /** Nearest-rank 90th percentile. */
  readonly p90: number;
  readonly min: number;
  readonly max: number;
}

export function summarizeShots(shots: readonly number[]): ShotSummary {
  if (shots.length === 0) throw new Error("summarizeShots needs at least one value");
  const sorted = [...shots].sort((a, b) => a - b);
  const at = (index: number) => sorted[index] ?? 0;
  const middle = Math.floor(sorted.length / 2);
  return {
    mean: sorted.reduce((total, value) => total + value, 0) / sorted.length,
    median: sorted.length % 2 === 0 ? (at(middle - 1) + at(middle)) / 2 : at(middle),
    p90: at(Math.ceil(0.9 * sorted.length) - 1),
    min: at(0),
    max: at(sorted.length - 1),
  };
}

export interface SimulationOptions {
  readonly difficulty: Difficulty;
  readonly games: number;
  readonly seed: number;
  readonly rules?: GameRules;
  /** Clock used for `elapsedMs`; defaults to Date.now. */
  readonly now?: () => number;
}

export interface SimulationStats extends ShotSummary {
  readonly difficulty: Difficulty;
  readonly games: number;
  readonly seed: number;
  readonly elapsedMs: number;
  readonly shotsPerGame: readonly number[];
}

/**
 * Plays `games` games of one difficulty against random fleets. The same seed yields the same
 * defender fleets for every difficulty, so results are comparable and reproducible.
 */
export function simulateGames(options: SimulationOptions): SimulationStats {
  const { difficulty, games, seed } = options;
  const rules = options.rules ?? DEFAULT_RULES;
  const now = options.now ?? Date.now;
  const fleetRng = createRng(seed);
  const aiRng = createRng(seed ^ 0x9e3779b9);
  const ai = createAi(difficulty);
  const started = now();
  const shotsPerGame: number[] = [];
  for (let game = 0; game < games; game++) {
    const defenderFleet = randomFleet(rules, fleetRng);
    shotsPerGame.push(playGame({ ai, rules, defenderFleet, rng: aiRng }));
  }
  return {
    difficulty,
    games,
    seed,
    ...summarizeShots(shotsPerGame),
    elapsedMs: now() - started,
    shotsPerGame,
  };
}
