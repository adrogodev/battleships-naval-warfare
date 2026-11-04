import {
  type EndReason,
  type GameState,
  opponentOf,
  type RoomPlayerInfo,
  type RoomState,
  type Seat,
  type ShotRecord,
  viewFor,
} from "@battleships/shared";

/** One seat of a room. Lives only in server memory. */
export interface PlayerSlot {
  readonly seat: Seat;
  readonly alias: string;
  /** Opaque session token: the only way back into this seat. */
  readonly token: string;
  socketId: string | null;
  connected: boolean;
  ready: boolean;
  /** Left voluntarily: the seat is closed for good (its token no longer works). */
  left: boolean;
  /** Epoch ms when the reconnection window closes, while disconnected. */
  disconnectDeadline: number | null;
  /** Set when the reconnection window ran out: the rival may claim victory. */
  reconnectExpired: boolean;
  /** Last replies by actionId (bounded), for idempotency. */
  readonly acks: Map<string, unknown>;
}

export interface Room {
  readonly code: string;
  readonly turnTimerSec: number | null;
  game: GameState;
  readonly seats: [PlayerSlot | null, PlayerSlot | null];
  log: ShotRecord[];
  nextShotId: number;
  endReason: EndReason | null;
  /** Epoch ms when the current turn times out; null when there is no timer or it is paused. */
  turnDeadline: number | null;
  /** Remaining turn time kept while the game is frozen. */
  turnRemainingMs: number | null;
  readonly timers: Map<string, ReturnType<typeof setTimeout>>;
}

/** Connected and still in the room. */
export const isPresent = (slot: PlayerSlot | null): slot is PlayerSlot =>
  slot !== null && !slot.left && slot.connected;

/** Disconnected but still inside the reconnection window. */
export const isAwaited = (slot: PlayerSlot | null): slot is PlayerSlot =>
  slot !== null && !slot.left && !slot.connected && !slot.reconnectExpired;

/** A seated player is away: shots and the turn timer stop until they return or are claimed. */
export const isFrozen = (room: Room): boolean =>
  room.seats.some((slot) => slot !== null && !slot.left && !slot.connected);

export function canClaimVictory(room: Room, seat: Seat): boolean {
  const rival = room.seats[opponentOf(seat)];
  const playing = room.game.phase === "placement" || room.game.phase === "battle";
  return (
    playing &&
    isPresent(room.seats[seat]) &&
    rival !== null &&
    !rival.left &&
    !rival.connected &&
    rival.reconnectExpired
  );
}

function playerInfo(room: Room, slot: PlayerSlot): RoomPlayerInfo {
  const player = room.game.players[slot.seat];
  return {
    seat: slot.seat,
    alias: slot.alias,
    connected: !slot.left && slot.connected,
    ready: slot.ready,
    fleetSubmitted: room.game.phase !== "lobby" && player.fleet !== null,
    rematchRequested: player.rematchRequested,
  };
}

/** The state one seat may see: game data only through viewFor, rival fleet only once finished. */
export function buildRoomState(room: Room, seat: Seat): RoomState {
  const rivalSeat = opponentOf(seat);
  const rival = room.seats[rivalSeat];
  const finished = room.game.phase === "finished";
  const rivalFleet = room.game.players[rivalSeat].fleet;
  return {
    code: room.code,
    you: seat,
    players: room.seats
      .filter((slot): slot is PlayerSlot => slot !== null)
      .map((slot) => playerInfo(room, slot)),
    view: room.game.phase === "lobby" ? null : viewFor(room.game, seat),
    log: room.log.map((shot) => ({ ...shot, coord: { ...shot.coord } })),
    turnTimerSec: room.turnTimerSec,
    turnDeadline: room.turnDeadline,
    reconnect:
      rival !== null && !rival.left && rival.disconnectDeadline !== null
        ? { seat: rivalSeat, deadline: rival.disconnectDeadline }
        : null,
    canClaimVictory: canClaimVictory(room, seat),
    endReason: room.endReason,
    revealedOpponentFleet:
      finished && rivalFleet ? rivalFleet.map((p) => ({ ...p, bow: { ...p.bow } })) : null,
  };
}
