import { randomBytes, randomInt } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  type ActionError,
  type ClientEvent,
  type Coord,
  clientSchemas,
  createGame,
  DEFAULT_RULES,
  type EndReason,
  type ErrorCode,
  type GameEvent,
  type GameState,
  generateRoomCode,
  opponentOf,
  type Placement,
  PROTOCOL_LIMITS,
  type Reaction,
  type ReduceResult,
  reduce,
  type Seat,
  type ServerEvents,
  type ShotRecord,
} from "@battleships/shared";
import { Server, type Socket } from "socket.io";
import type { z } from "zod";
import { DEFAULT_CORS_ORIGINS } from "./config";
import { createRateLimiter } from "./rateLimit";
import {
  buildRoomState,
  canClaimVictory,
  isAwaited,
  isFrozen,
  isPresent,
  type PlayerSlot,
  type Room,
} from "./room";

export interface GameServerOptions {
  /** Reconnection window after a disconnect. Default 60 s. */
  readonly reconnectWindowMs?: number;
  /** A room without activity for this long is deleted. Default 15 min. */
  readonly roomIdleMs?: number;
  /** Length of one turn-timer "second" (tests shrink it). Default 1000 ms. */
  readonly turnTimerUnitMs?: number;
  readonly corsOrigins?: readonly string[];
  /** Per-connection limit. Default PROTOCOL_LIMITS (10 messages per second). */
  readonly rateLimit?: { readonly messages: number; readonly windowMs: number };
  /** Clock (epoch ms). Default Date.now. */
  readonly now?: () => number;
}

export interface GameServer {
  readonly io: GameIo;
  readonly httpServer: HttpServer;
  /** Starts listening; resolves with the actual port (useful with port 0). */
  listen(port: number, host?: string): Promise<number>;
  /** Clears every room, timer and connection, then closes the HTTP server. */
  close(): Promise<void>;
  roomCount(): number;
  hasRoom(code: string): boolean;
  activeTimerCount(): number;
}

/** Inbound payloads are untrusted: every handler receives `unknown` and parses it. */
type InboundEvents = { [E in ClientEvent]: (payload: unknown, ack: unknown) => void };

interface SocketData {
  binding: { code: string; seat: Seat } | null;
}

type GameIo = Server<InboundEvents, ServerEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<InboundEvents, ServerEvents, Record<string, never>, SocketData>;

type Failure = { readonly ok: false; readonly error: ErrorCode; readonly message?: string };
type Reply =
  | { readonly ok: true }
  | { readonly ok: true; readonly code: string; readonly token: string; readonly seat: Seat }
  | Failure;

type Parsed<E extends ClientEvent> = z.output<(typeof clientSchemas)[E]>;

const OK: Reply = { ok: true };
const MAX_STORED_ACKS = 64;

const fail = (error: ErrorCode, message?: string): Failure =>
  message === undefined ? { ok: false, error } : { ok: false, error, message };

const DOMAIN_ERRORS: Record<ActionError, ErrorCode> = {
  wrong_phase: "WRONG_PHASE",
  already_joined: "WRONG_PHASE",
  already_submitted: "ALREADY_SUBMITTED",
  invalid_fleet: "INVALID_FLEET",
  not_your_turn: "NOT_YOUR_TURN",
  out_of_bounds: "OUT_OF_BOUNDS",
  already_fired: "ALREADY_FIRED",
  already_requested: "ALREADY_REQUESTED",
};

const domainFailure = (result: Extract<ReduceResult, { ok: false }>): Failure =>
  fail(DOMAIN_ERRORS[result.error], result.detail);

/** Crypto-backed source for room codes, which must not be guessable. */
const secureRandom = (): number => randomInt(0, 2 ** 32) / 2 ** 32;

const newToken = (): string => randomBytes(24).toString("base64url");

/** The server fixes the rules; the creator only picks the turn timer. */
function newGame(turnTimerSec: number | null): GameState {
  return createGame({
    ...DEFAULT_RULES,
    fleet: DEFAULT_RULES.fleet.map((ship) => ({ ...ship })),
    turnTimerSec,
  });
}

export function createGameServer(options: GameServerOptions = {}): GameServer {
  const reconnectWindowMs = options.reconnectWindowMs ?? 60_000;
  const roomIdleMs = options.roomIdleMs ?? 15 * 60_000;
  const turnTimerUnitMs = options.turnTimerUnitMs ?? 1000;
  const rateLimit = options.rateLimit ?? {
    messages: PROTOCOL_LIMITS.messagesPerSecond,
    windowMs: 1000,
  };
  const now = options.now ?? Date.now;

  const httpServer = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
      return;
    }
    res.writeHead(404).end();
  });
  const io: GameIo = new Server(httpServer, {
    maxHttpBufferSize: PROTOCOL_LIMITS.maxMessageBytes,
    cors: { origin: [...(options.corsOrigins ?? DEFAULT_CORS_ORIGINS)] },
  });

  const rooms = new Map<string, Room>();
  const tokens = new Map<string, { code: string; seat: Seat }>();
  let closed = false;

  // ---------- Outgoing messages ----------

  /**
   * While a handler runs, emissions are queued and flushed after its ack, so a client always
   * gets the answer to its intent before the events it caused. Timers emit immediately.
   */
  let outbox: (() => void)[] | null = null;
  const send = (emit: () => void): void => {
    if (outbox) outbox.push(emit);
    else emit();
  };

  const presentSlots = (room: Room): PlayerSlot[] => room.seats.filter(isPresent);

  /** Payload is built now (a snapshot), delivered after the ack. */
  function toSeat(slot: PlayerSlot, emit: (socketId: string) => void): void {
    if (!isPresent(slot) || slot.socketId === null) return;
    const socketId = slot.socketId;
    send(() => emit(socketId));
  }

  function broadcastState(room: Room): void {
    for (const slot of presentSlots(room)) {
      const state = buildRoomState(room, slot.seat);
      toSeat(slot, (id) => io.to(id).emit("room:state", state));
    }
  }

  // ---------- Timers ----------

  function schedule(room: Room, key: string, ms: number, run: () => void): void {
    cancel(room, key);
    const handle = setTimeout(() => {
      room.timers.delete(key);
      if (rooms.get(room.code) !== room) return;
      try {
        run();
      } catch (error) {
        console.error(`[server] timer ${key} in room ${room.code} failed`, error);
      }
    }, ms);
    room.timers.set(key, handle);
  }

  function cancel(room: Room, key: string): void {
    const handle = room.timers.get(key);
    if (handle !== undefined) clearTimeout(handle);
    room.timers.delete(key);
  }

  /** Any activity postpones the idle deletion. */
  function touch(room: Room): void {
    schedule(room, "idle", roomIdleMs, () => deleteRoom(room, true));
  }

  // ---------- Turn timer ----------

  function startTurnTimer(room: Room, remainingMs?: number): void {
    cancel(room, "turn");
    room.turnDeadline = null;
    room.turnRemainingMs = null;
    if (room.turnTimerSec === null || room.game.phase !== "battle") return;
    const ms = remainingMs ?? room.turnTimerSec * turnTimerUnitMs;
    if (isFrozen(room)) {
      room.turnRemainingMs = ms;
      return;
    }
    room.turnDeadline = now() + ms;
    const turnNumber = room.game.turnNumber;
    schedule(room, "turn", ms, () => onTurnTimeout(room, turnNumber));
  }

  function pauseTurnTimer(room: Room): void {
    if (room.turnDeadline === null) return;
    room.turnRemainingMs = Math.max(0, room.turnDeadline - now());
    room.turnDeadline = null;
    cancel(room, "turn");
  }

  function resumeTurnTimer(room: Room): void {
    if (isFrozen(room) || room.turnDeadline !== null) return;
    startTurnTimer(room, room.turnRemainingMs ?? undefined);
  }

  function onTurnTimeout(room: Room, turnNumber: number): void {
    if (room.game.phase !== "battle" || room.game.turnNumber !== turnNumber) return;
    const result = reduce(room.game, { type: "timeout", seat: room.game.turn });
    if (!result.ok) return;
    room.game = result.state;
    applyEvents(room, result.events);
    broadcastState(room);
  }

  // ---------- Domain events → protocol ----------

  function applyEvents(room: Room, events: readonly GameEvent[], endReason?: EndReason): void {
    for (const event of events) {
      switch (event.type) {
        case "shotResolved": {
          const coord: Coord = { col: event.coord.col, row: event.coord.row };
          const shot: ShotRecord =
            event.result === "sunk"
              ? {
                  id: room.nextShotId++,
                  seat: event.seat,
                  coord,
                  result: "sunk",
                  shipId: event.shipId,
                }
              : { id: room.nextShotId++, seat: event.seat, coord, result: event.result };
          room.log.push(shot);
          for (const slot of presentSlots(room)) {
            toSeat(slot, (id) => io.to(id).emit("shot:result", shot));
          }
          break;
        }
        case "turnChanged": {
          startTurnTimer(room);
          const payload = { turn: event.turn, deadline: room.turnDeadline };
          for (const slot of presentSlots(room)) {
            toSeat(slot, (id) => io.to(id).emit("turn:changed", payload));
          }
          break;
        }
        case "gameOver": {
          cancel(room, "turn");
          room.turnDeadline = null;
          room.turnRemainingMs = null;
          room.endReason = endReason ?? event.reason;
          const payload = { winner: event.winner, reason: room.endReason };
          for (const slot of presentSlots(room)) {
            toSeat(slot, (id) => io.to(id).emit("game:over", payload));
          }
          break;
        }
        case "phaseChanged":
          if (event.phase === "placement" && room.log.length > 0) {
            // Rematch: a fresh game in the same room.
            room.log = [];
            room.endReason = null;
          }
          break;
        default:
          break;
      }
    }
  }

  // ---------- Room lifecycle ----------

  function unbind(slot: PlayerSlot): void {
    if (slot.socketId === null) return;
    const socket = io.sockets.sockets.get(slot.socketId);
    if (socket) socket.data.binding = null;
  }

  function deleteRoom(room: Room, notify: boolean): void {
    for (const handle of room.timers.values()) clearTimeout(handle);
    room.timers.clear();
    rooms.delete(room.code);
    for (const slot of room.seats) {
      if (slot === null) continue;
      tokens.delete(slot.token);
      if (notify && isPresent(slot)) {
        toSeat(slot, (id) => io.to(id).emit("error", { code: "ROOM_CLOSED" }));
      }
      unbind(slot);
    }
  }

  /** Nobody connected and nobody still within a reconnection window: the room is gone. */
  function deleteIfAbandoned(room: Room): boolean {
    if (room.seats.some((slot) => isPresent(slot) || isAwaited(slot))) return false;
    deleteRoom(room, false);
    return true;
  }

  function newSlot(seat: Seat, alias: string, socketId: string): PlayerSlot {
    return {
      seat,
      alias,
      token: newToken(),
      socketId,
      connected: true,
      ready: false,
      left: false,
      disconnectDeadline: null,
      reconnectExpired: false,
      acks: new Map(),
    };
  }

  function seatPlayer(socket: GameSocket, room: Room, slot: PlayerSlot): Reply {
    room.seats[slot.seat] = slot;
    tokens.set(slot.token, { code: room.code, seat: slot.seat });
    socket.data.binding = { code: room.code, seat: slot.seat };
    touch(room);
    broadcastState(room);
    return { ok: true, code: room.code, token: slot.token, seat: slot.seat };
  }

  /** The slot this socket currently holds, if any. */
  function boundSlot(socket: GameSocket): { room: Room; slot: PlayerSlot } | null {
    const binding = socket.data.binding;
    if (!binding) return null;
    const room = rooms.get(binding.code);
    const slot = room?.seats[binding.seat];
    if (!room || !slot || slot.left || slot.socketId !== socket.id) {
      socket.data.binding = null;
      return null;
    }
    return { room, slot };
  }

  // ---------- Handlers: entering a room ----------

  function handleCreate(socket: GameSocket, data: Parsed<"room:create">): Reply {
    if (boundSlot(socket)) return fail("ALREADY_IN_ROOM");
    let code = generateRoomCode(secureRandom);
    while (rooms.has(code)) code = generateRoomCode(secureRandom);
    const turnTimerSec = data.turnTimerSec ?? null;
    const room: Room = {
      code,
      turnTimerSec,
      game: newGame(turnTimerSec),
      seats: [null, null],
      log: [],
      nextShotId: 1,
      endReason: null,
      turnDeadline: null,
      turnRemainingMs: null,
      timers: new Map(),
    };
    rooms.set(code, room);
    return seatPlayer(socket, room, newSlot(0, data.alias, socket.id));
  }

  function handleJoin(socket: GameSocket, data: Parsed<"room:join">): Reply {
    if ("token" in data) return reconnect(socket, data.token);
    const current = boundSlot(socket);
    if (current) return fail("ALREADY_IN_ROOM");
    const room = rooms.get(data.code);
    if (!room) return fail("ROOM_NOT_FOUND");
    const seat = room.seats.indexOf(null);
    if (room.game.phase !== "lobby" || (seat !== 0 && seat !== 1)) return fail("ROOM_FULL");
    return seatPlayer(socket, room, newSlot(seat, data.alias, socket.id));
  }

  function reconnect(socket: GameSocket, token: string): Reply {
    const entry = tokens.get(token);
    const room = entry ? rooms.get(entry.code) : undefined;
    const slot = entry && room ? room.seats[entry.seat] : null;
    if (!entry || !room || !slot || slot.token !== token || slot.left) {
      return fail("INVALID_TOKEN");
    }
    const current = boundSlot(socket);
    if (current && current.slot !== slot) return fail("ALREADY_IN_ROOM");

    const previous = slot.socketId;
    if (previous !== null && previous !== socket.id) {
      const old = io.sockets.sockets.get(previous);
      if (old) {
        old.data.binding = null;
        old.emit("error", { code: "SESSION_REPLACED" });
        old.disconnect(true);
      }
    }
    const wasAway = !slot.connected;
    slot.socketId = socket.id;
    slot.connected = true;
    slot.disconnectDeadline = null;
    slot.reconnectExpired = false;
    cancel(room, `reconnect:${slot.seat}`);
    socket.data.binding = { code: room.code, seat: slot.seat };
    if (wasAway) {
      const rival = room.seats[opponentOf(slot.seat)];
      if (rival) toSeat(rival, (id) => io.to(id).emit("player:reconnected", { seat: slot.seat }));
      resumeTurnTimer(room);
    }
    touch(room);
    broadcastState(room);
    return { ok: true, code: room.code, token: slot.token, seat: slot.seat };
  }

  // ---------- Handlers: seated actions ----------

  function handleReady(room: Room, slot: PlayerSlot): Reply {
    if (room.game.phase !== "lobby") return fail("WRONG_PHASE");
    slot.ready = true;
    const [first, second] = room.seats;
    if (first?.ready && second?.ready) {
      for (const seat of [0, 1] as const) {
        const result = reduce(room.game, { type: "join", seat });
        if (!result.ok) return domainFailure(result);
        room.game = result.state;
        applyEvents(room, result.events);
      }
    }
    broadcastState(room);
    return OK;
  }

  function handleFleet(room: Room, slot: PlayerSlot, fleet: readonly Placement[]): Reply {
    const result = reduce(room.game, { type: "submitFleet", seat: slot.seat, fleet });
    if (!result.ok) return domainFailure(result);
    room.game = result.state;
    applyEvents(room, result.events);
    broadcastState(room);
    return OK;
  }

  function handleFire(room: Room, slot: PlayerSlot, coord: Coord): Reply {
    if (room.game.phase === "battle" && isFrozen(room)) return fail("GAME_FROZEN");
    const result = reduce(room.game, { type: "fire", seat: slot.seat, coord });
    if (!result.ok) return domainFailure(result);
    room.game = result.state;
    applyEvents(room, result.events);
    // A hit that keeps the turn (extraTurnOnHit) still restarts the clock.
    if (room.game.phase === "battle" && !result.events.some((e) => e.type === "turnChanged")) {
      startTurnTimer(room);
    }
    broadcastState(room);
    return OK;
  }

  function handleLeave(room: Room, slot: PlayerSlot): Reply {
    if (room.game.phase === "lobby") {
      room.seats[slot.seat] = null;
    } else if (room.game.phase === "finished") {
      slot.left = true;
    } else {
      const result = reduce(room.game, { type: "leave", seat: slot.seat });
      if (!result.ok) return domainFailure(result);
      room.game = result.state;
      applyEvents(room, result.events, "forfeit");
      slot.left = true;
    }
    tokens.delete(slot.token);
    unbind(slot);
    slot.socketId = null;
    slot.connected = false;
    cancel(room, `reconnect:${slot.seat}`);
    if (!deleteIfAbandoned(room)) broadcastState(room);
    return OK;
  }

  function handleRematch(room: Room, slot: PlayerSlot): Reply {
    if (room.game.phase !== "finished") return fail("WRONG_PHASE");
    const rival = room.seats[opponentOf(slot.seat)] ?? null;
    if (!isPresent(rival)) return fail("OPPONENT_GONE");
    const result = reduce(room.game, { type: "requestRematch", seat: slot.seat });
    if (!result.ok) return domainFailure(result);
    room.game = result.state;
    applyEvents(room, result.events);
    broadcastState(room);
    return OK;
  }

  function handleReaction(room: Room, slot: PlayerSlot, reaction: Reaction): Reply {
    const payload = { seat: slot.seat, reaction };
    for (const target of presentSlots(room)) {
      toSeat(target, (id) => io.to(id).emit("reaction:received", payload));
    }
    return OK;
  }

  function handleClaim(room: Room, slot: PlayerSlot): Reply {
    if (!canClaimVictory(room, slot.seat)) return fail("CANNOT_CLAIM");
    const result = reduce(room.game, { type: "leave", seat: opponentOf(slot.seat) });
    if (!result.ok) return domainFailure(result);
    room.game = result.state;
    applyEvents(room, result.events, "abandoned");
    broadcastState(room);
    return OK;
  }

  /** Membership check, idempotency by actionId and activity tracking around a seated action. */
  function seated(
    socket: GameSocket,
    actionId: string,
    act: (room: Room, slot: PlayerSlot) => Reply,
  ): Reply {
    const bound = boundSlot(socket);
    if (!bound) return fail("NOT_IN_ROOM");
    const { room, slot } = bound;
    const stored = slot.acks.get(actionId);
    if (stored !== undefined) return stored as Reply;
    const reply = act(room, slot);
    slot.acks.set(actionId, reply);
    if (slot.acks.size > MAX_STORED_ACKS) {
      const oldest = slot.acks.keys().next();
      if (!oldest.done) slot.acks.delete(oldest.value);
    }
    if (rooms.get(room.code) === room) touch(room);
    return reply;
  }

  // ---------- Disconnection ----------

  function onDisconnect(socket: GameSocket): void {
    if (closed) return;
    const bound = boundSlot(socket);
    if (!bound) return;
    const { room, slot } = bound;
    slot.connected = false;
    slot.socketId = null;
    socket.data.binding = null;
    const deadline = now() + reconnectWindowMs;
    slot.disconnectDeadline = deadline;
    slot.reconnectExpired = false;
    pauseTurnTimer(room);
    schedule(room, `reconnect:${slot.seat}`, reconnectWindowMs, () =>
      onReconnectExpired(room, slot),
    );
    const rival = room.seats[opponentOf(slot.seat)];
    if (rival) {
      const notice = { seat: slot.seat, alias: slot.alias, deadline };
      toSeat(rival, (id) => io.to(id).emit("player:disconnected", notice));
    }
    touch(room);
    broadcastState(room);
  }

  function onReconnectExpired(room: Room, slot: PlayerSlot): void {
    if (room.seats[slot.seat] !== slot || slot.connected || slot.left) return;
    slot.reconnectExpired = true;
    if (room.game.phase === "lobby") {
      // Nothing to claim in the waiting room: free the seat for someone else.
      room.seats[slot.seat] = null;
      tokens.delete(slot.token);
    }
    if (!deleteIfAbandoned(room)) broadcastState(room);
  }

  // ---------- Wiring ----------

  const dispatch: { [E in ClientEvent]: (socket: GameSocket, data: Parsed<E>) => Reply } = {
    "room:create": handleCreate,
    "room:join": handleJoin,
    "room:ready": (s, d) => seated(s, d.actionId, handleReady),
    "fleet:submit": (s, d) => seated(s, d.actionId, (r, p) => handleFleet(r, p, d.fleet)),
    "shot:fire": (s, d) => seated(s, d.actionId, (r, p) => handleFire(r, p, d.coord)),
    "rematch:request": (s, d) => seated(s, d.actionId, handleRematch),
    "room:leave": (s, d) => seated(s, d.actionId, handleLeave),
    "reaction:send": (s, d) => seated(s, d.actionId, (r, p) => handleReaction(r, p, d.reaction)),
    "victory:claim": (s, d) => seated(s, d.actionId, handleClaim),
  };

  function handle<E extends ClientEvent>(socket: GameSocket, event: E, payload: unknown): Reply {
    const parsed = clientSchemas[event].safeParse(payload);
    if (!parsed.success) return fail("INVALID_PAYLOAD");
    return dispatch[event](socket, parsed.data as Parsed<E>);
  }

  io.on("connection", (socket: GameSocket) => {
    socket.data.binding = null;
    const limiter = createRateLimiter(rateLimit.messages, rateLimit.windowMs, now);
    socket.use((packet, next) => {
      if (limiter.tryAcquire()) {
        next();
        return;
      }
      const ack = packet[packet.length - 1];
      if (typeof ack === "function") ack(fail("RATE_LIMITED"));
    });

    for (const event of Object.keys(clientSchemas) as ClientEvent[]) {
      socket.on(event, (first: unknown, second: unknown) => {
        // `emit(event, ack)` without a payload puts the ack first.
        const [payload, ack] =
          typeof first === "function" && second === undefined
            ? [undefined, first]
            : [first, second];
        outbox = [];
        let reply: Reply;
        try {
          reply = handle(socket, event, payload);
        } catch (error) {
          console.error(`[server] ${event} failed`, error);
          reply = fail("SERVER_ERROR");
        }
        const queued = outbox;
        outbox = null;
        if (typeof ack === "function") ack(reply);
        for (const emit of queued) emit();
      });
    }
    socket.on("disconnect", () => {
      try {
        onDisconnect(socket);
      } catch (error) {
        console.error("[server] disconnect handling failed", error);
      }
    });
  });

  return {
    io,
    httpServer,
    listen(port, host) {
      return new Promise((resolve, reject) => {
        httpServer.once("error", reject);
        const onListening = () => {
          httpServer.off("error", reject);
          resolve((httpServer.address() as AddressInfo).port);
        };
        if (host === undefined) httpServer.listen(port, onListening);
        else httpServer.listen(port, host, onListening);
      });
    },
    close() {
      closed = true;
      for (const room of [...rooms.values()]) deleteRoom(room, false);
      tokens.clear();
      return new Promise((resolve) => {
        io.close(() => resolve());
      });
    },
    roomCount: () => rooms.size,
    hasRoom: (code) => rooms.has(code),
    activeTimerCount: () => [...rooms.values()].reduce((sum, room) => sum + room.timers.size, 0),
  };
}
