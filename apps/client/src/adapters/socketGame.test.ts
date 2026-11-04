import { createRng, DEFAULT_RULES, randomFleet } from "@battleships/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FakeSocket,
  fakeView,
  record,
  roomState,
  twoPlayers,
} from "../multiplayer/testing/fakeSocket";
import { defaultServerUrl, SESSION_KEY, SocketGame, type SocketGameOptions } from "./socketGame";

let sockets: FakeSocket[];
let urls: string[];

function setup(options: Partial<SocketGameOptions> = {}) {
  const game = new SocketGame({
    url: "http://server.test",
    socketFactory: (url) => {
      urls.push(url);
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    storage: sessionStorage,
    now: () => Date.now(),
    ackTimeoutMs: 5_000,
    ...options,
  });
  game.connect();
  const socket = sockets.at(-1);
  if (!socket) throw new Error("no socket created");
  return { game, socket };
}

beforeEach(() => {
  sockets = [];
  urls = [];
  sessionStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("SocketGame · connection", () => {
  it("connects to the configured URL and reports the connection status", () => {
    const { game, socket } = setup();
    expect(urls).toEqual(["http://server.test"]);
    expect(game.getSnapshot().status).toBe("connecting");
    socket.serverConnect();
    expect(game.getSnapshot().status).toBe("connected");
    socket.serverDrop();
    expect(game.getSnapshot().status).toBe("reconnecting");
  });

  it("reports the server as unavailable when the first connection fails", () => {
    const { game, socket } = setup();
    socket.serverEmit("connect_error", new Error("xhr poll error"));
    expect(game.getSnapshot().status).toBe("unavailable");
  });

  it("goes offline with the browser and reconnects when the network is back", () => {
    const { game, socket } = setup();
    socket.serverConnect();
    window.dispatchEvent(new Event("offline"));
    expect(game.getSnapshot().status).toBe("offline");
    socket.connected = false;
    window.dispatchEvent(new Event("online"));
    expect(socket.connectCalls).toBeGreaterThan(0);
    expect(game.getSnapshot().status).toBe("reconnecting");
  });

  it("defaults the server URL to the page host on port 3001", () => {
    expect(defaultServerUrl({ protocol: "https:", hostname: "juego.local" })).toBe(
      "https://juego.local:3001",
    );
  });
});

describe("SocketGame · rooms and session", () => {
  it("creates a room with the chosen turn timer and stores the session token", async () => {
    const { game, socket } = setup();
    socket.serverConnect();
    const created = game.createRoom("Ana", 30);
    expect(game.getSnapshot().pending).toBe("create");
    expect(socket.last("room:create").payload).toEqual({ alias: "Ana", turnTimerSec: 30 });
    socket.reply("room:create", { ok: true, code: "ABC234", token: "t".repeat(24), seat: 0 });
    await expect(created).resolves.toBe(true);
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}")).toEqual({
      token: "t".repeat(24),
      code: "ABC234",
    });
    expect(game.getSnapshot().pending).toBeNull();
  });

  it("joins by code (normalised) and keeps the latest room state", async () => {
    const { game, socket } = setup();
    socket.serverConnect();
    const joined = game.joinRoom(" abc234 ", "Bruno");
    expect(socket.last("room:join").payload).toEqual({ code: "ABC234", alias: "Bruno" });
    socket.reply("room:join", { ok: true, code: "ABC234", token: "u".repeat(24), seat: 1 });
    await joined;
    const state = roomState({ you: 1, players: twoPlayers() });
    socket.serverEmit("room:state", state);
    expect(game.getSnapshot().room).toBe(state);
  });

  it("surfaces a join error (room full) and stores nothing", async () => {
    const { game, socket } = setup();
    socket.serverConnect();
    const joined = game.joinRoom("ABC234", "Bruno");
    socket.reply("room:join", { ok: false, error: "ROOM_FULL" });
    await expect(joined).resolves.toBe(false);
    expect(game.getSnapshot().error?.code).toBe("ROOM_FULL");
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("rejoins with the stored token after a reload and after the socket reconnects", async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: "k".repeat(20), code: "ABC234" }));
    const { game, socket } = setup();
    expect(game.hasSession()).toBe(true);
    socket.serverConnect();
    expect(socket.last("room:join").payload).toEqual({ token: "k".repeat(20) });
    expect(game.getSnapshot().pending).toBe("rejoin");
    socket.reply("room:join", { ok: true, code: "ABC234", token: "k".repeat(20), seat: 0 });
    await vi.waitFor(() => expect(game.getSnapshot().pending).toBeNull());

    socket.serverDrop();
    socket.serverConnect();
    const joins = socket.sent.filter((message) => message.event === "room:join");
    expect(joins).toHaveLength(2);
    expect(joins[1]?.payload).toEqual({ token: "k".repeat(20) });
  });

  it("forgets an expired session token", async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: "k".repeat(20), code: "ABC234" }));
    const { game, socket } = setup();
    socket.serverConnect();
    socket.reply("room:join", { ok: false, error: "INVALID_TOKEN" });
    await vi.waitFor(() => expect(game.getSnapshot().error?.code).toBe("INVALID_TOKEN"));
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(game.getSnapshot().room).toBeNull();
  });

  it("stops rejoining when the session is opened in another tab", () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: "k".repeat(20), code: "ABC234" }));
    const { game, socket } = setup();
    socket.serverConnect();
    socket.serverEmit("error", { code: "SESSION_REPLACED" });
    expect(game.getSnapshot().error?.code).toBe("SESSION_REPLACED");
    expect(game.getSnapshot().status).toBe("replaced");
    socket.serverConnect();
    expect(socket.sent.filter((message) => message.event === "room:join")).toHaveLength(1);
  });

  it("forgets the session when the server closes the room for inactivity", () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: "k".repeat(20), code: "ABC234" }));
    const { game, socket } = setup();
    socket.serverConnect();
    socket.serverEmit("room:state", roomState());
    socket.serverEmit("error", { code: "ROOM_CLOSED" });
    expect(game.getSnapshot().error?.code).toBe("ROOM_CLOSED");
    expect(game.getSnapshot().room).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("times out an unanswered request as a network error", async () => {
    const { game, socket } = setup();
    socket.serverConnect();
    const created = game.createRoom("Ana", null);
    vi.advanceTimersByTime(5_000);
    await expect(created).resolves.toBe(false);
    expect(game.getSnapshot().error?.code).toBe("TIMEOUT");
  });

  it("exits: leaves the room, forgets the session and closes the socket", () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: "k".repeat(20), code: "ABC234" }));
    const { game, socket } = setup();
    socket.serverConnect();
    socket.serverEmit("room:state", roomState());
    game.exit();
    expect(socket.last("room:leave").payload).toHaveProperty("actionId");
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(socket.disconnectCalls).toBe(1);
    expect(game.getSnapshot().room).toBeNull();
  });
});

describe("SocketGame · intents", () => {
  it("sends every intent with a fresh valid actionId", async () => {
    const { game, socket } = setup();
    socket.serverConnect();
    const fleet = randomFleet(DEFAULT_RULES, createRng(3));
    const calls = [
      game.ready(),
      game.submitFleet(fleet),
      game.fire({ col: 2, row: 3 }),
      game.rematch(),
      game.react("good_shot"),
      game.claimVictory(),
      game.leave(),
    ];
    const events = [
      "room:ready",
      "fleet:submit",
      "shot:fire",
      "rematch:request",
      "reaction:send",
      "victory:claim",
      "room:leave",
    ];
    for (const event of events) socket.reply(event, { ok: true });
    await Promise.all(calls);

    const ids = socket.sent.map((message) => message.payload.actionId);
    expect(socket.sent.map((message) => message.event)).toEqual(events);
    expect(new Set(ids).size).toBe(events.length);
    for (const id of ids) expect(String(id)).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(socket.last("shot:fire").payload.coord).toEqual({ col: 2, row: 3 });
    expect(socket.last("fleet:submit").payload.fleet).toEqual(fleet);
    expect(socket.last("reaction:send").payload.reaction).toBe("good_shot");
  });

  it("surfaces a rejected intent as the snapshot error", async () => {
    const { game, socket } = setup();
    socket.serverConnect();
    const shot = game.fire({ col: 0, row: 0 });
    socket.reply("shot:fire", { ok: false, error: "NOT_YOUR_TURN" });
    await expect(shot).resolves.toEqual({ ok: false, error: "NOT_YOUR_TURN" });
    const first = game.getSnapshot().error;
    expect(first?.code).toBe("NOT_YOUR_TURN");

    const again = game.fire({ col: 0, row: 0 });
    socket.reply("shot:fire", { ok: false, error: "NOT_YOUR_TURN" });
    await again;
    // A repeated error is a new event (the toast shows again).
    expect(game.getSnapshot().error?.id).not.toBe(first?.id);
    game.clearError();
    expect(game.getSnapshot().error).toBeNull();
  });

  it("keeps received reactions and the ones it sent", async () => {
    const { game, socket } = setup();
    socket.serverConnect();
    socket.serverEmit("room:state", roomState({ players: twoPlayers() }));
    socket.serverEmit("reaction:received", { seat: 1, reaction: "close" });
    const sent = game.react("ouch");
    socket.reply("reaction:send", { ok: true });
    await sent;
    expect(game.getSnapshot().reactions.map((r) => [r.mine, r.reaction])).toEqual([
      [false, "close"],
      [true, "ouch"],
    ]);
  });
});

describe("SocketGame · battle snapshot", () => {
  it("maps the room state to a GameSnapshot from the local player's point of view", () => {
    vi.setSystemTime(10_000);
    const { game, socket } = setup();
    socket.serverConnect();
    const fleet = randomFleet(DEFAULT_RULES, createRng(9));
    socket.serverEmit(
      "room:state",
      roomState({
        you: 1,
        players: twoPlayers(),
        view: fakeView({ phase: "battle", turn: 1 }, 1),
        log: [record(0, 0, "hit"), record(1, 1, "sunk"), record(2, 1, "miss")],
      }),
    );
    vi.setSystemTime(13_000);
    socket.serverEmit(
      "room:state",
      roomState({
        you: 1,
        players: twoPlayers(),
        view: fakeView({ phase: "finished", winner: 1 }, 1),
        log: [record(0, 0, "hit"), record(1, 1, "sunk"), record(2, 1, "miss")],
        revealedOpponentFleet: fleet,
        endReason: "fleet_destroyed",
      }),
    );
    const battle = game.getSnapshot().battle;
    expect(battle?.view.you).toBe(1);
    expect(battle?.aiThinking).toBe(false);
    // Seat 0 is always the local player in the presented log.
    expect(battle?.log.map((entry) => entry.seat)).toEqual([1, 0, 0]);
    expect(battle?.stats).toMatchObject({ shots: 2, hits: 1, accuracy: 0.5, firstSinkTurn: 1 });
    expect(battle?.stats.durationMs).toBe(3_000);
    expect(battle?.revealedEnemyFleet).toBe(fleet);
  });

  it("has no battle snapshot while in the waiting room", () => {
    const { game, socket } = setup();
    socket.serverConnect();
    socket.serverEmit("room:state", roomState());
    expect(game.getSnapshot().battle).toBeNull();
  });

  it("notifies subscribers on every change", () => {
    const { game, socket } = setup();
    const listener = vi.fn();
    const unsubscribe = game.subscribe(listener);
    socket.serverConnect();
    socket.serverEmit("room:state", roomState());
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    socket.serverDrop();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
