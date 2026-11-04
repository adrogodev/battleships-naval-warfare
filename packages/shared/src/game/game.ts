import { type Coord, coordKey, isInBounds } from "../board/coord";
import { type FleetError, type Placement, shipCells, validateFleet } from "../board/placement";
import type { GameRules, ShipId } from "../rules/rules";

export type Seat = 0 | 1;
export type Phase = "lobby" | "placement" | "battle" | "finished";
export type CellMark = "miss" | "hit";
export type ShotResult = "miss" | "hit" | "sunk";
export type GameOverReason = "fleet_destroyed" | "forfeit";

export interface PlayerState {
  readonly joined: boolean;
  readonly fleet: readonly Placement[] | null;
  /** Shots fired at this player's board, keyed by coordKey. */
  readonly shotsReceived: Readonly<Record<string, CellMark>>;
  readonly sunk: readonly ShipId[];
  readonly rematchRequested: boolean;
}

export interface GameState {
  readonly phase: Phase;
  readonly rules: GameRules;
  readonly players: readonly [PlayerState, PlayerState];
  readonly firstTurn: Seat;
  readonly turn: Seat;
  readonly winner: Seat | null;
  readonly turnNumber: number;
}

export type Action =
  | { type: "join"; seat: Seat }
  | { type: "submitFleet"; seat: Seat; fleet: readonly Placement[] }
  | { type: "fire"; seat: Seat; coord: Coord }
  | { type: "leave"; seat: Seat }
  | { type: "requestRematch"; seat: Seat };

export type GameEvent =
  | { type: "playerJoined"; seat: Seat }
  | { type: "phaseChanged"; phase: Phase }
  | { type: "fleetSubmitted"; seat: Seat }
  | { type: "shotResolved"; seat: Seat; coord: Coord; result: "miss" | "hit" }
  | { type: "shotResolved"; seat: Seat; coord: Coord; result: "sunk"; shipId: ShipId }
  | { type: "turnChanged"; turn: Seat }
  | { type: "gameOver"; winner: Seat; reason: GameOverReason }
  | { type: "rematchRequested"; seat: Seat };

export type ActionError =
  | "wrong_phase"
  | "already_joined"
  | "already_submitted"
  | "invalid_fleet"
  | "not_your_turn"
  | "out_of_bounds"
  | "already_fired"
  | "already_requested";

export type ReduceResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: ActionError; detail?: FleetError };

const emptyPlayer: PlayerState = {
  joined: false,
  fleet: null,
  shotsReceived: {},
  sunk: [],
  rematchRequested: false,
};

export const opponentOf = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

export function createGame(rules: GameRules, options: { firstTurn?: Seat } = {}): GameState {
  const firstTurn = options.firstTurn ?? 0;
  return {
    phase: "lobby",
    rules,
    players: [emptyPlayer, emptyPlayer],
    firstTurn,
    turn: firstTurn,
    winner: null,
    turnNumber: 0,
  };
}

function withPlayer(state: GameState, seat: Seat, player: PlayerState): GameState {
  const players: [PlayerState, PlayerState] =
    seat === 0 ? [player, state.players[1]] : [state.players[0], player];
  return { ...state, players };
}

const fail = (error: ActionError, detail?: FleetError): ReduceResult =>
  detail === undefined ? { ok: false, error } : { ok: false, error, detail };

/**
 * The single game state machine: lobby -> placement -> battle -> finished (-> placement on rematch).
 * Pure: returns a new state plus the events that happened, or a typed rejection.
 * Runs on the client for the AI mode and on the server for multiplayer.
 */
export function reduce(state: GameState, action: Action): ReduceResult {
  switch (action.type) {
    case "join":
      return join(state, action.seat);
    case "submitFleet":
      return submitFleet(state, action.seat, action.fleet);
    case "fire":
      return fire(state, action.seat, action.coord);
    case "leave":
      return leave(state, action.seat);
    case "requestRematch":
      return requestRematch(state, action.seat);
  }
}

function join(state: GameState, seat: Seat): ReduceResult {
  if (state.phase !== "lobby") return fail("wrong_phase");
  if (state.players[seat].joined) return fail("already_joined");
  let next = withPlayer(state, seat, { ...state.players[seat], joined: true });
  const events: GameEvent[] = [{ type: "playerJoined", seat }];
  if (next.players[0].joined && next.players[1].joined) {
    next = { ...next, phase: "placement" };
    events.push({ type: "phaseChanged", phase: "placement" });
  }
  return { ok: true, state: next, events };
}

function submitFleet(state: GameState, seat: Seat, fleet: readonly Placement[]): ReduceResult {
  if (state.phase !== "placement") return fail("wrong_phase");
  if (state.players[seat].fleet !== null) return fail("already_submitted");
  const check = validateFleet(fleet, state.rules);
  if (!check.ok) return fail("invalid_fleet", check.reason);

  let next = withPlayer(state, seat, { ...state.players[seat], fleet: [...fleet] });
  const events: GameEvent[] = [{ type: "fleetSubmitted", seat }];
  if (next.players[0].fleet !== null && next.players[1].fleet !== null) {
    next = { ...next, phase: "battle", turn: next.firstTurn, turnNumber: 1 };
    events.push(
      { type: "phaseChanged", phase: "battle" },
      { type: "turnChanged", turn: next.turn },
    );
  }
  return { ok: true, state: next, events };
}

function fire(state: GameState, seat: Seat, coord: Coord): ReduceResult {
  if (state.phase !== "battle") return fail("wrong_phase");
  if (state.turn !== seat) return fail("not_your_turn");
  if (!isInBounds(coord, state.rules.boardSize)) return fail("out_of_bounds");

  const targetSeat = opponentOf(seat);
  const target = state.players[targetSeat];
  const key = coordKey(coord);
  if (target.shotsReceived[key] !== undefined) return fail("already_fired");

  const shotsReceived = { ...target.shotsReceived };
  const hitShip = shipAt(target.fleet ?? [], coord, state.rules);
  shotsReceived[key] = hitShip ? "hit" : "miss";

  let sunk = target.sunk;
  const events: GameEvent[] = [];
  if (hitShip && isShipSunk(hitShip, shotsReceived, state.rules)) {
    sunk = [...sunk, hitShip.shipId];
    events.push({ type: "shotResolved", seat, coord, result: "sunk", shipId: hitShip.shipId });
  } else {
    events.push({ type: "shotResolved", seat, coord, result: hitShip ? "hit" : "miss" });
  }

  let next = withPlayer(state, targetSeat, { ...target, shotsReceived, sunk });

  if (sunk.length === state.rules.fleet.length) {
    next = { ...next, phase: "finished", winner: seat };
    events.push(
      { type: "phaseChanged", phase: "finished" },
      { type: "gameOver", winner: seat, reason: "fleet_destroyed" },
    );
    return { ok: true, state: next, events };
  }

  const keepsTurn = hitShip !== undefined && state.rules.extraTurnOnHit;
  if (!keepsTurn) {
    next = { ...next, turn: targetSeat, turnNumber: state.turnNumber + 1 };
    events.push({ type: "turnChanged", turn: targetSeat });
  }
  return { ok: true, state: next, events };
}

function leave(state: GameState, seat: Seat): ReduceResult {
  if (state.phase === "finished") return { ok: true, state, events: [] };
  if (state.phase === "lobby") {
    return { ok: true, state: withPlayer(state, seat, emptyPlayer), events: [] };
  }
  const winner = opponentOf(seat);
  return {
    ok: true,
    state: { ...state, phase: "finished", winner },
    events: [
      { type: "phaseChanged", phase: "finished" },
      { type: "gameOver", winner, reason: "forfeit" },
    ],
  };
}

function requestRematch(state: GameState, seat: Seat): ReduceResult {
  if (state.phase !== "finished") return fail("wrong_phase");
  if (state.players[seat].rematchRequested) return fail("already_requested");
  const next = withPlayer(state, seat, { ...state.players[seat], rematchRequested: true });
  const events: GameEvent[] = [{ type: "rematchRequested", seat }];
  if (!(next.players[0].rematchRequested && next.players[1].rematchRequested)) {
    return { ok: true, state: next, events };
  }
  const fresh: PlayerState = { ...emptyPlayer, joined: true };
  // The loser of the previous game opens the rematch.
  const firstTurn = state.winner === null ? state.firstTurn : opponentOf(state.winner);
  events.push({ type: "phaseChanged", phase: "placement" });
  return {
    ok: true,
    state: {
      ...next,
      phase: "placement",
      players: [fresh, fresh],
      firstTurn,
      turn: firstTurn,
      winner: null,
      turnNumber: 0,
    },
    events,
  };
}

export function shipAt(
  fleet: readonly Placement[],
  coord: Coord,
  rules: GameRules,
): Placement | undefined {
  const key = coordKey(coord);
  return fleet.find((placement) => {
    const length = rules.fleet.find((ship) => ship.id === placement.shipId)?.length ?? 0;
    return shipCells(placement, length).some((cell) => coordKey(cell) === key);
  });
}

function isShipSunk(
  placement: Placement,
  shots: Readonly<Record<string, CellMark>>,
  rules: GameRules,
): boolean {
  const length = rules.fleet.find((ship) => ship.id === placement.shipId)?.length ?? 0;
  return shipCells(placement, length).every((cell) => shots[coordKey(cell)] === "hit");
}
