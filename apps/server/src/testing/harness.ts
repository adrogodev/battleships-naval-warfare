import { randomUUID } from "node:crypto";
import {
  createRng,
  DEFAULT_RULES,
  type Placement,
  type RoomState,
  randomFleet,
} from "@battleships/shared";
import { io as connect, type Socket } from "socket.io-client";
import { createGameServer, type GameServer, type GameServerOptions } from "../gameServer";

/** Loose view of an ack: tests inspect it field by field. */
export interface Reply {
  readonly ok: boolean;
  readonly error?: string;
  readonly message?: string;
  readonly code?: string;
  readonly token?: string;
  readonly seat?: number;
}

export interface Message {
  readonly event: string;
  readonly payload: unknown;
}

const WAIT_MS = 2000;

/** A real Socket.IO client that records every message the server delivers to it. */
export class TestClient {
  readonly messages: Message[] = [];
  private readonly waiters = new Set<() => void>();

  constructor(readonly socket: Socket) {
    socket.onAny((event: string, payload: unknown) => {
      this.messages.push({ event, payload });
      for (const wake of [...this.waiters]) wake();
    });
  }

  /** Index to pass as `since` so a wait only matches messages that arrive afterwards. */
  mark(): number {
    return this.messages.length;
  }

  call(event: string, payload?: unknown): Promise<Reply> {
    return this.socket.timeout(WAIT_MS).emitWithAck(event, payload) as Promise<Reply>;
  }

  /** Sends an action with a fresh actionId plus any extra fields. */
  act(event: string, fields: Record<string, unknown> = {}): Promise<Reply> {
    return this.call(event, { actionId: randomUUID(), ...fields });
  }

  count(event: string, since = 0): number {
    return this.messages.slice(since).filter((m) => m.event === event).length;
  }

  waitFor<T>(
    event: string,
    predicate: (payload: T) => boolean = () => true,
    since = 0,
    timeoutMs = WAIT_MS,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const check = (): boolean => {
        for (const message of this.messages.slice(since)) {
          if (message.event === event && predicate(message.payload as T)) {
            this.waiters.delete(wake);
            clearTimeout(timer);
            resolve(message.payload as T);
            return true;
          }
        }
        return false;
      };
      const wake = (): void => {
        check();
      };
      const timer = setTimeout(() => {
        this.waiters.delete(wake);
        reject(new Error(`Timed out waiting for "${event}"`));
      }, timeoutMs);
      if (!check()) this.waiters.add(wake);
    });
  }

  waitState(predicate: (state: RoomState) => boolean, since = 0): Promise<RoomState> {
    return this.waitFor<RoomState>("room:state", predicate, since);
  }

  lastState(): RoomState {
    const states = this.messages.filter((m) => m.event === "room:state");
    const last = states[states.length - 1];
    if (!last) throw new Error("No room:state received");
    return last.payload as RoomState;
  }

  waitDisconnect(): Promise<void> {
    if (this.socket.disconnected) return Promise.resolve();
    return new Promise((resolve) => this.socket.once("disconnect", () => resolve()));
  }

  close(): void {
    this.socket.disconnect();
  }
}

export interface Harness {
  readonly server: GameServer;
  connect(): Promise<TestClient>;
  /** Creates a room with A (seat 0) and joins B (seat 1). */
  lobby(createExtra?: Record<string, unknown>): Promise<Lobby>;
  close(): Promise<void>;
}

export interface Lobby {
  readonly a: TestClient;
  readonly b: TestClient;
  readonly code: string;
  readonly tokenA: string;
  readonly tokenB: string;
}

export async function startHarness(options: GameServerOptions = {}): Promise<Harness> {
  const server = createGameServer(options);
  const port = await server.listen(0);
  const url = `http://127.0.0.1:${port}`;
  const clients: TestClient[] = [];

  const connectClient = (): Promise<TestClient> =>
    new Promise((resolve, reject) => {
      const socket = connect(url, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      });
      const client = new TestClient(socket);
      clients.push(client);
      socket.once("connect", () => resolve(client));
      socket.once("connect_error", reject);
    });

  return {
    server,
    connect: connectClient,
    async lobby(createExtra = {}) {
      const a = await connectClient();
      const b = await connectClient();
      const created = await a.call("room:create", { alias: "Alpha", ...createExtra });
      if (!created.ok || !created.code || !created.token) throw new Error("create failed");
      const joined = await b.call("room:join", { code: created.code, alias: "Bravo" });
      if (!joined.ok || !joined.token) throw new Error("join failed");
      return { a, b, code: created.code, tokenA: created.token, tokenB: joined.token };
    },
    async close() {
      for (const client of clients) client.close();
      await server.close();
    },
  };
}

export const FLEET_A: readonly Placement[] = randomFleet(DEFAULT_RULES, createRng(11));
export const FLEET_B: readonly Placement[] = randomFleet(DEFAULT_RULES, createRng(22));

/** Both ready → placement. */
export async function toPlacement(lobby: Lobby): Promise<void> {
  const sinceA = lobby.a.mark();
  const sinceB = lobby.b.mark();
  expectOk(await lobby.a.act("room:ready"));
  expectOk(await lobby.b.act("room:ready"));
  await lobby.a.waitState((s) => s.view?.phase === "placement", sinceA);
  await lobby.b.waitState((s) => s.view?.phase === "placement", sinceB);
}

/** Both ready and both fleets submitted → battle, seat 0 (A) to fire first. */
export async function toBattle(lobby: Lobby): Promise<void> {
  await toPlacement(lobby);
  const sinceA = lobby.a.mark();
  const sinceB = lobby.b.mark();
  expectOk(await lobby.a.act("fleet:submit", { fleet: FLEET_A }));
  expectOk(await lobby.b.act("fleet:submit", { fleet: FLEET_B }));
  await lobby.a.waitState((s) => s.view?.phase === "battle", sinceA);
  await lobby.b.waitState((s) => s.view?.phase === "battle", sinceB);
}

export function expectOk(reply: Reply): void {
  if (!reply.ok) throw new Error(`Expected ok, got ${reply.error} ${reply.message ?? ""}`);
}

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
