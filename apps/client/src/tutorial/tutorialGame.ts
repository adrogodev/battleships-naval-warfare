import {
  type Action,
  type Coord,
  coordKey,
  createGame,
  type GameRules,
  type GameState,
  type Placement,
  reduce,
  type ShotResult,
  shipCells,
} from "@battleships/shared";

/**
 * Scripted practice game for the tutorial. It runs on the real game reducer, so placement
 * validation and shot results are exactly the ones of a real battle; only the scenario is fixed.
 */
export const TUTORIAL_RULES: GameRules = {
  boardSize: 6,
  fleet: [{ id: "destroyer", length: 2 }],
  noContact: true,
  turnTimerSec: null,
  // The player keeps shooting after a hit; after a miss the enemy passes (see fireDrill).
  extraTurnOnHit: true,
};

export const TUTORIAL_SHIP_LENGTH = 2;

/** Deterministic hidden enemy ship: D-3 and E-3. */
export const ENEMY_SHIP: Placement = {
  shipId: "destroyer",
  bow: { col: 3, row: 2 },
  orientation: "h",
};

function apply(state: GameState, action: Action): GameState {
  const result = reduce(state, action);
  if (!result.ok) throw new Error(`Tutorial script rejected ${action.type}: ${result.error}`);
  return result.state;
}

/** Battle phase with the player's ship on seat 0 and the scripted enemy on seat 1. */
export function startDrill(own: Placement): GameState {
  let state = createGame(TUTORIAL_RULES, { firstTurn: 0 });
  state = apply(state, { type: "join", seat: 0 });
  state = apply(state, { type: "join", seat: 1 });
  state = apply(state, { type: "submitFleet", seat: 0, fleet: [own] });
  return apply(state, { type: "submitFleet", seat: 1, fleet: [ENEMY_SHIP] });
}

export type DrillShot =
  | { readonly ok: true; readonly state: GameState; readonly result: ShotResult }
  | { readonly ok: false; readonly reason: "already_fired" | "not_playable" };

/** One player shot. The enemy never fires in the tutorial: after a miss it passes its turn. */
export function fireDrill(state: GameState, coord: Coord): DrillShot {
  const shot = reduce(state, { type: "fire", seat: 0, coord });
  if (!shot.ok) {
    return { ok: false, reason: shot.error === "already_fired" ? "already_fired" : "not_playable" };
  }
  const resolved = shot.events.find((event) => event.type === "shotResolved");
  const result: ShotResult = resolved?.type === "shotResolved" ? resolved.result : "miss";
  const next =
    shot.state.phase === "battle" && shot.state.turn === 1
      ? apply(shot.state, { type: "timeout", seat: 1 })
      : shot.state;
  return { ok: true, state: next, result };
}

export type Hint =
  | { readonly kind: "cell"; readonly coord: Coord }
  | { readonly kind: "neighbours" }
  | null;

/**
 * Keeps the tutorial short: after a miss the next unhit ship cell is pointed out; after a hit
 * the player is told to try the neighbours (and gets the exact cell if that misses again).
 */
export function hintAfter(state: GameState, result: ShotResult): Hint {
  if (result === "sunk") return null;
  if (result === "hit") return { kind: "neighbours" };
  const shots = state.players[1].shotsReceived;
  const target = shipCells(ENEMY_SHIP, TUTORIAL_SHIP_LENGTH).find(
    (cell) => shots[coordKey(cell)] !== "hit",
  );
  return target ? { kind: "cell", coord: target } : null;
}
