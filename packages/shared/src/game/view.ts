import type { Placement } from "../board/placement";
import type { GameRules, ShipSpec } from "../rules/rules";
import { type CellMark, type GameState, opponentOf, type Phase, type Seat } from "./game";

/** Everything a rival may know about a board: shots, their results and ships already sunk. */
export interface PublicBoardView {
  readonly boardSize: number;
  readonly shots: Readonly<Record<string, CellMark>>;
  /** Sunk ships are revealed with their position. */
  readonly sunkShips: readonly Placement[];
  /** Ships still afloat, by spec only (never by position). */
  readonly remainingShips: readonly ShipSpec[];
}

export interface PlayerView {
  readonly phase: Phase;
  readonly rules: GameRules;
  readonly you: Seat;
  readonly turn: Seat;
  readonly turnNumber: number;
  readonly winner: Seat | null;
  readonly ownFleet: readonly Placement[] | null;
  readonly ownShotsReceived: Readonly<Record<string, CellMark>>;
  readonly ownSunk: readonly ShipSpec[];
  readonly opponent: PublicBoardView;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Public projection of `seat`'s board, built from copies so it never aliases the game state. */
export function publicBoardView(state: GameState, seat: Seat): PublicBoardView {
  const player = state.players[seat];
  const sunkIds = new Set(player.sunk);
  const sunkShips = (player.fleet ?? [])
    .filter((placement) => sunkIds.has(placement.shipId))
    .map((placement) => ({ ...placement, bow: { ...placement.bow } }));
  return deepFreeze({
    boardSize: state.rules.boardSize,
    shots: { ...player.shotsReceived },
    sunkShips,
    remainingShips: state.rules.fleet
      .filter((ship) => !sunkIds.has(ship.id))
      .map((ship) => ({ ...ship })),
  });
}

/** What one player is allowed to see. The only way state leaves the domain towards a player. */
export function viewFor(state: GameState, seat: Seat): PlayerView {
  const own = state.players[seat];
  const sunkIds = new Set(own.sunk);
  return deepFreeze({
    phase: state.phase,
    rules: state.rules,
    you: seat,
    turn: state.turn,
    turnNumber: state.turnNumber,
    winner: state.winner,
    ownFleet: own.fleet ? own.fleet.map((p) => ({ ...p, bow: { ...p.bow } })) : null,
    ownShotsReceived: { ...own.shotsReceived },
    ownSunk: state.rules.fleet.filter((ship) => sunkIds.has(ship.id)).map((ship) => ({ ...ship })),
    opponent: publicBoardView(state, opponentOf(seat)),
  });
}
