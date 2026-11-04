import {
  createGame,
  DEFAULT_RULES,
  type PlayerView,
  type RoomPlayerInfo,
  type RoomState,
  type Seat,
  type ShotRecord,
  viewFor,
} from "@battleships/shared";
import type { GameSocket } from "../../adapters/socketGame";

/** Same shape GameSocket uses; called with whatever the test server sends. */
type Listener = (...args: never[]) => void;
type AnyListener = (...args: unknown[]) => void;

export interface SentMessage {
  readonly event: string;
  readonly payload: Record<string, unknown>;
  readonly ack: AnyListener | undefined;
}

/** In-memory stand-in for a socket.io client socket: tests drive the server side by hand. */
export class FakeSocket implements GameSocket {
  connected = false;
  connectCalls = 0;
  disconnectCalls = 0;
  readonly sent: SentMessage[] = [];
  private readonly listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return this;
  }

  off(event: string, listener?: Listener): this {
    if (listener) this.listeners.get(event)?.delete(listener);
    else this.listeners.delete(event);
    return this;
  }

  emit(event: string, payload: unknown, ack?: (response: never) => void): this {
    this.sent.push({
      event,
      payload: payload as Record<string, unknown>,
      ack: ack as AnyListener | undefined,
    });
    return this;
  }

  connect(): this {
    this.connectCalls++;
    return this;
  }

  disconnect(): this {
    this.disconnectCalls++;
    this.connected = false;
    return this;
  }

  // ---------- Server side ----------

  /** Delivers a server → client event. */
  serverEmit(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      (listener as AnyListener)(...args);
    }
  }

  serverConnect(): void {
    this.connected = true;
    this.serverEmit("connect");
  }

  serverDrop(reason = "transport close"): void {
    this.connected = false;
    this.serverEmit("disconnect", reason);
  }

  /** Last message sent for an event (throws when none was sent). */
  last(event: string): SentMessage {
    const found = this.sent.filter((message) => message.event === event).at(-1);
    if (!found) throw new Error(`No "${event}" was sent`);
    return found;
  }

  /** Answers the last pending message of an event. */
  reply(event: string, response: unknown): void {
    const message = this.last(event);
    if (!message.ack) throw new Error(`"${event}" was sent without an ack`);
    message.ack(response);
  }
}

export function fakeView(overrides: Partial<PlayerView> = {}, seat: Seat = 0): PlayerView {
  return { ...viewFor(createGame(DEFAULT_RULES), seat), ...overrides };
}

export function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: "ABC234",
    you: 0,
    players: [
      {
        seat: 0,
        alias: "Ana",
        connected: true,
        ready: false,
        fleetSubmitted: false,
        rematchRequested: false,
      },
    ],
    view: null,
    log: [],
    turnTimerSec: null,
    turnDeadline: null,
    reconnect: null,
    canClaimVictory: false,
    endReason: null,
    revealedOpponentFleet: null,
    ...overrides,
  };
}

export function player(seat: Seat, overrides: Partial<RoomPlayerInfo> = {}): RoomPlayerInfo {
  return {
    seat,
    alias: seat === 0 ? "Ana" : "Bruno",
    connected: true,
    ready: false,
    fleetSubmitted: false,
    rematchRequested: false,
    ...overrides,
  };
}

export const twoPlayers = (
  overrides: { ready?: boolean; connected?: boolean } = {},
): RoomState["players"] => [
  {
    seat: 0,
    alias: "Ana",
    connected: true,
    ready: overrides.ready ?? false,
    fleetSubmitted: false,
    rematchRequested: false,
  },
  {
    seat: 1,
    alias: "Bruno",
    connected: overrides.connected ?? true,
    ready: overrides.ready ?? false,
    fleetSubmitted: false,
    rematchRequested: false,
  },
];

export const record = (
  id: number,
  seat: Seat,
  result: ShotRecord["result"] = "miss",
): ShotRecord => ({ id, seat, coord: { col: id, row: 0 }, result });
