import type {
  Ack,
  ClientEvent,
  ClientPayload,
  Coord,
  ErrorCode,
  JoinAck,
  Placement,
  Reaction,
  RoomState,
  Seat,
  ShotRecord,
} from "@battleships/shared";
import { io } from "socket.io-client";
import { computeBattleStats } from "./battleStats";
import type { GameSnapshot } from "./localAiGame";

/** The slice of a socket.io client socket the adapter uses (a fake replaces it in tests). */
export interface GameSocket {
  readonly connected: boolean;
  on(event: string, listener: (...args: never[]) => void): unknown;
  off(event: string, listener?: (...args: never[]) => void): unknown;
  emit(event: string, payload: unknown, ack?: (response: never) => void): unknown;
  connect(): unknown;
  disconnect(): unknown;
}

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "unavailable"
  /** The same session was opened in another tab: this one stops rejoining. */
  | "replaced";

/** Server error codes plus the client-side ones (no answer in time). */
export type ClientErrorCode = ErrorCode | "TIMEOUT";

export interface ReactionNotice {
  readonly id: number;
  readonly seat: Seat;
  readonly reaction: Reaction;
  readonly mine: boolean;
}

export interface MultiplayerSnapshot {
  readonly status: ConnectionStatus;
  /** Latest state sent by the server for this player, or null outside a room. */
  readonly room: RoomState | null;
  /** Room request in flight: creating, joining by code or rejoining with the session token. */
  readonly pending: "create" | "join" | "rejoin" | null;
  /** Last error; `id` changes on every occurrence so a repeated error shows again. */
  readonly error: { readonly code: ClientErrorCode; readonly id: number } | null;
  readonly reactions: readonly ReactionNotice[];
  /** Battle data in the shape the battle and results screens already use. */
  readonly battle: GameSnapshot | null;
}

export type IntentResult = Ack | { ok: false; error: "TIMEOUT" };

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface OnlineSource {
  readonly isOnline: () => boolean;
  readonly target: Pick<EventTarget, "addEventListener" | "removeEventListener"> | null;
}

export interface SocketGameOptions {
  url: string;
  socketFactory: (url: string) => GameSocket;
  storage: StorageLike;
  now: () => number;
  ackTimeoutMs: number;
  newActionId: () => string;
  online: OnlineSource;
}

/** sessionStorage key holding `{ token, code }`: one session per browser tab. */
export const SESSION_KEY = "battleships.session";
/** Query parameter of the share link: `?sala=CODE` opens the join flow for that room. */
export const JOIN_PARAM = "sala";
const MAX_REACTIONS = 6;

export function defaultServerUrl(location: { protocol: string; hostname: string }): string {
  return `${location.protocol}//${location.hostname}:3001`;
}

export function serverUrl(): string {
  const configured = import.meta.env.VITE_SERVER_URL;
  return configured && configured.length > 0 ? configured : defaultServerUrl(window.location);
}

function randomActionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function browserStorage(): StorageLike {
  try {
    return window.sessionStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
      removeItem: (key) => void memory.delete(key),
    };
  }
}

const defaults = (): SocketGameOptions => ({
  url: serverUrl(),
  socketFactory: (url) =>
    io(url, { autoConnect: false, transports: ["websocket", "polling"] }) as unknown as GameSocket,
  storage: browserStorage(),
  now: Date.now,
  ackTimeoutMs: 8_000,
  newActionId: randomActionId,
  online: {
    isOnline: () => typeof navigator === "undefined" || navigator.onLine !== false,
    target: typeof window === "undefined" ? null : window,
  },
});

/** Seat 0 is always the local player in presented logs (the battle screens rely on it). */
function fromPerspective(log: readonly ShotRecord[], you: Seat): readonly ShotRecord[] {
  if (you === 0) return log;
  return log.map((entry) => ({ ...entry, seat: entry.seat === you ? 0 : 1 }));
}

interface StoredSession {
  readonly token: string;
  readonly code: string;
}

/**
 * Online multiplayer adapter. The server is the only authority: this class sends intents with a
 * unique actionId, waits for acks and renders whatever `room:state` the server sends.
 */
export class SocketGame {
  private readonly options: SocketGameOptions;
  private socket: GameSocket | null = null;
  private readonly listeners = new Set<() => void>();
  private everConnected = false;
  private errorSeq = 0;
  private reactionSeq = 0;
  private battleStartedAt: number | null = null;
  private battleEndedAt: number | null = null;
  private presentedLog: { source: readonly ShotRecord[]; log: readonly ShotRecord[] } | null = null;
  private disposed = false;
  private snapshot: MultiplayerSnapshot = {
    status: "connecting",
    room: null,
    pending: null,
    error: null,
    reactions: [],
    battle: null,
  };

  constructor(options: Partial<SocketGameOptions> = {}) {
    this.options = { ...defaults(), ...options };
  }

  getSnapshot = (): MultiplayerSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** True when this tab holds a session token (e.g. after a reload). */
  hasSession(): boolean {
    return this.readSession() !== null;
  }

  connect(): void {
    if (this.socket) return;
    // A disposed instance may be connected again (React StrictMode re-runs effects).
    this.disposed = false;
    const socket = this.options.socketFactory(this.options.url);
    this.socket = socket;
    socket.on("connect", this.onConnect);
    socket.on("disconnect", this.onDisconnect);
    socket.on("connect_error", this.onConnectError);
    socket.on("room:state", this.onRoomState);
    socket.on("reaction:received", this.onReaction);
    socket.on("error", this.onServerError);
    const target = this.options.online.target;
    target?.addEventListener("offline", this.onOffline);
    target?.addEventListener("online", this.onOnline);
    if (!this.options.online.isOnline()) this.update({ status: "offline" });
    socket.connect();
  }

  /** Tries the connection again from an error state. */
  retry(): void {
    this.update({ error: null });
    const socket = this.socket;
    if (!socket) {
      this.connect();
      return;
    }
    if (socket.connected) {
      if (this.snapshot.room === null && this.readSession()) this.rejoin();
      return;
    }
    this.update({ status: this.everConnected ? "reconnecting" : "connecting" });
    socket.connect();
  }

  clearError(): void {
    if (this.snapshot.error) this.update({ error: null });
  }

  async createRoom(alias: string, turnTimerSec: number | null): Promise<boolean> {
    this.update({ pending: "create", error: null });
    const result = await this.request<JoinAck>("room:create", { alias, turnTimerSec });
    return this.handleJoin(result);
  }

  async joinRoom(code: string, alias: string): Promise<boolean> {
    this.update({ pending: "join", error: null });
    const result = await this.request<JoinAck>("room:join", {
      code: code.trim().toUpperCase(),
      alias,
    });
    return this.handleJoin(result);
  }

  ready(): Promise<IntentResult> {
    return this.intent("room:ready", {});
  }

  submitFleet(fleet: readonly Placement[]): Promise<IntentResult> {
    return this.intent("fleet:submit", { fleet: [...fleet] });
  }

  fire(coord: Coord): Promise<IntentResult> {
    return this.intent("shot:fire", { coord });
  }

  rematch(): Promise<IntentResult> {
    return this.intent("rematch:request", {});
  }

  claimVictory(): Promise<IntentResult> {
    return this.intent("victory:claim", {});
  }

  /** Abandons the room (a forfeit during the battle); the socket stays open for the final state. */
  leave(): Promise<IntentResult> {
    return this.intent("room:leave", {});
  }

  async react(reaction: Reaction): Promise<IntentResult> {
    const result = await this.intent("reaction:send", { reaction });
    const room = this.snapshot.room;
    if (result.ok && room) this.pushReaction(room.you, reaction, true);
    return result;
  }

  /** Leaves for good: tells the server, forgets this tab's session and closes the socket. */
  exit(): void {
    if (this.snapshot.room && this.socket?.connected) {
      this.socket.emit("room:leave", { actionId: this.options.newActionId() }, () => {});
    }
    this.options.storage.removeItem(SESSION_KEY);
    this.dispose();
    this.update({ room: null, battle: null, pending: null, reactions: [] });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const socket = this.socket;
    if (socket) {
      socket.off("connect", this.onConnect);
      socket.off("disconnect", this.onDisconnect);
      socket.off("connect_error", this.onConnectError);
      socket.off("room:state", this.onRoomState);
      socket.off("reaction:received", this.onReaction);
      socket.off("error", this.onServerError);
      socket.disconnect();
      this.socket = null;
    }
    const target = this.options.online.target;
    target?.removeEventListener("offline", this.onOffline);
    target?.removeEventListener("online", this.onOnline);
  }

  // ---------- Socket events ----------

  private readonly onConnect = (): void => {
    this.everConnected = true;
    this.update({ status: "connected" });
    if (this.readSession()) this.rejoin();
  };

  private readonly onDisconnect = (reason: string): void => {
    if (this.snapshot.status === "replaced" || this.disposed) return;
    this.update({ status: this.options.online.isOnline() ? "reconnecting" : "offline" });
    // A server-side disconnect is not retried automatically by socket.io.
    if (reason === "io server disconnect") this.socket?.connect();
  };

  private readonly onConnectError = (): void => {
    if (this.snapshot.status === "replaced") return;
    if (!this.options.online.isOnline()) this.update({ status: "offline" });
    else this.update({ status: this.everConnected ? "reconnecting" : "unavailable" });
  };

  private readonly onRoomState = (room: RoomState): void => {
    if (this.snapshot.status === "replaced") return;
    this.update({ room, battle: this.battleFrom(room) });
  };

  private readonly onReaction = (payload: { seat: Seat; reaction: Reaction }): void => {
    const room = this.snapshot.room;
    // Own reactions are added when their ack arrives.
    if (room && payload.seat === room.you) return;
    this.pushReaction(payload.seat, payload.reaction, false);
  };

  private readonly onServerError = (payload: { code: ErrorCode }): void => {
    if (payload.code === "SESSION_REPLACED") {
      this.options.storage.removeItem(SESSION_KEY);
      this.update({ status: "replaced" });
    }
    if (payload.code === "ROOM_CLOSED") {
      this.options.storage.removeItem(SESSION_KEY);
      this.update({ room: null, battle: null });
    }
    this.setError(payload.code);
  };

  private readonly onOffline = (): void => {
    this.update({ status: "offline" });
  };

  private readonly onOnline = (): void => {
    if (this.snapshot.status === "replaced") return;
    if (this.socket?.connected) {
      this.update({ status: "connected" });
      return;
    }
    this.update({ status: this.everConnected ? "reconnecting" : "connecting" });
    this.socket?.connect();
  };

  // ---------- Internals ----------

  private rejoin(): void {
    const session = this.readSession();
    if (!session || this.snapshot.pending === "rejoin") return;
    this.update({ pending: "rejoin" });
    void this.request<JoinAck>("room:join", { token: session.token }).then((result) => {
      if (!result.ok && result.error !== "TIMEOUT") {
        this.options.storage.removeItem(SESSION_KEY);
        this.update({ room: null, battle: null });
      }
      this.handleJoin(result);
    });
  }

  private handleJoin(result: JoinAck | { ok: false; error: "TIMEOUT" }): boolean {
    if (!result.ok) {
      this.update({ pending: null });
      this.setError(result.error);
      return false;
    }
    const session: StoredSession = { token: result.token, code: result.code };
    this.options.storage.setItem(SESSION_KEY, JSON.stringify(session));
    this.update({ pending: null, error: null });
    return true;
  }

  private async intent<E extends ClientEvent>(
    event: E,
    payload: Omit<ClientPayload<E>, "actionId">,
  ): Promise<IntentResult> {
    const result = await this.request<Ack>(event, {
      ...payload,
      actionId: this.options.newActionId(),
    });
    if (!result.ok) this.setError(result.error);
    return result;
  }

  private request<T extends { ok: boolean }>(
    event: ClientEvent,
    payload: Record<string, unknown>,
  ): Promise<T | { ok: false; error: "TIMEOUT" }> {
    return new Promise((resolve) => {
      const socket = this.socket;
      if (!socket) {
        resolve({ ok: false, error: "TIMEOUT" });
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, error: "TIMEOUT" });
      }, this.options.ackTimeoutMs);
      socket.emit(event, payload, (response: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  private battleFrom(room: RoomState): GameSnapshot | null {
    const view = room.view;
    if (!view) {
      this.battleStartedAt = null;
      this.battleEndedAt = null;
      return null;
    }
    const now = this.options.now();
    if (view.phase === "placement") {
      this.battleStartedAt = null;
      this.battleEndedAt = null;
    } else {
      if (this.battleStartedAt === null) this.battleStartedAt = now;
      if (view.phase === "finished") this.battleEndedAt ??= now;
    }
    if (this.presentedLog?.source !== room.log) {
      this.presentedLog = { source: room.log, log: fromPerspective(room.log, room.you) };
    }
    const log = this.presentedLog.log;
    return {
      view,
      log,
      aiThinking: false,
      stats: computeBattleStats(log, {
        ownSeat: 0,
        startedAt: this.battleStartedAt,
        endedAt: this.battleEndedAt,
        now,
      }),
      revealedEnemyFleet: room.revealedOpponentFleet,
    };
  }

  private pushReaction(seat: Seat, reaction: Reaction, mine: boolean): void {
    this.reactionSeq++;
    const reactions = [
      ...this.snapshot.reactions,
      { id: this.reactionSeq, seat, reaction, mine },
    ].slice(-MAX_REACTIONS);
    this.update({ reactions });
  }

  private setError(code: ClientErrorCode): void {
    this.errorSeq++;
    this.update({ error: { code, id: this.errorSeq } });
  }

  private readSession(): StoredSession | null {
    try {
      const raw = this.options.storage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "token" in parsed &&
        "code" in parsed &&
        typeof parsed.token === "string" &&
        typeof parsed.code === "string"
      ) {
        return { token: parsed.token, code: parsed.code };
      }
    } catch {
      // Corrupt entry: treat as no session.
    }
    return null;
  }

  private update(patch: Partial<MultiplayerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}
