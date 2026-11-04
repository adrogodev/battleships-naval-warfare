import { randomUUID } from "node:crypto";
import {
  allCoords,
  type Coord,
  coordKey,
  DEFAULT_RULES,
  isValidRoomCode,
  type Placement,
  type RoomState,
  type ShotRecord,
  shipCells,
  shipLength,
} from "@battleships/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  delay,
  expectOk,
  FLEET_A,
  FLEET_B,
  type Harness,
  type Lobby,
  type Message,
  startHarness,
  toBattle,
  toPlacement,
} from "./testing/harness";

let harness: Harness | null = null;

async function start(options: Parameters<typeof startHarness>[0] = {}): Promise<Harness> {
  harness = await startHarness(options);
  return harness;
}

afterEach(async () => {
  await harness?.close();
  harness = null;
});

/** Generous limit for tests that play many shots in a burst. */
const FAST = { rateLimit: { messages: 10_000, windowMs: 1000 } } as const;

const cellsOf = (fleet: readonly Placement[]): Coord[] =>
  fleet.flatMap((p) => shipCells(p, shipLength(DEFAULT_RULES, p.shipId) ?? 0));

const emptyCellsOf = (fleet: readonly Placement[]): Coord[] => {
  const occupied = new Set(cellsOf(fleet).map(coordKey));
  return allCoords(DEFAULT_RULES.boardSize).filter((c) => !occupied.has(coordKey(c)));
};

/** A (seat 0) sinks every ship of B while B only misses: A wins by fleet_destroyed. */
async function playToEnd(lobby: Lobby): Promise<void> {
  const targets = cellsOf(FLEET_B);
  const misses = emptyCellsOf(FLEET_A);
  for (const [index, coord] of targets.entries()) {
    expectOk(await lobby.a.act("shot:fire", { coord }));
    if (index === targets.length - 1) break;
    expectOk(await lobby.b.act("shot:fire", { coord: misses[index] }));
  }
  await lobby.a.waitFor("game:over");
  await lobby.b.waitFor("game:over");
}

describe("rooms", () => {
  it("creates a room and lets a second player join", async () => {
    const h = await start();
    const a = await h.connect();
    const b = await h.connect();

    const created = await a.call("room:create", { alias: "  Alpha  ", turnTimerSec: 30 });
    expect(created.ok).toBe(true);
    expect(created.seat).toBe(0);
    expect(isValidRoomCode(created.code ?? "")).toBe(true);
    expect(created.token?.length).toBeGreaterThanOrEqual(32);

    const joined = await b.call("room:join", { code: created.code?.toLowerCase(), alias: "Bravo" });
    expect(joined).toMatchObject({ ok: true, seat: 1, code: created.code });
    expect(joined.token).not.toBe(created.token);

    const state = await a.waitState((s) => s.players.length === 2);
    expect(state.code).toBe(created.code);
    expect(state.you).toBe(0);
    expect(state.view).toBeNull();
    expect(state.turnTimerSec).toBe(30);
    expect(state.players.map((p) => [p.alias, p.connected, p.ready])).toEqual([
      ["Alpha", true, false],
      ["Bravo", true, false],
    ]);
  });

  it("rejects joining a full room", async () => {
    const h = await start();
    const lobby = await h.lobby();
    const c = await h.connect();
    expect(await c.call("room:join", { code: lobby.code, alias: "Charlie" })).toEqual({
      ok: false,
      error: "ROOM_FULL",
    });
  });

  it("rejects joining an unknown room or an unknown token", async () => {
    const h = await start();
    const c = await h.connect();
    expect((await c.call("room:join", { code: "ZZZZZZ", alias: "Charlie" })).error).toBe(
      "ROOM_NOT_FOUND",
    );
    expect((await c.call("room:join", { token: "A".repeat(32) })).error).toBe("INVALID_TOKEN");
  });

  it("shows readiness in the waiting room and starts placement when both are ready", async () => {
    const h = await start();
    const lobby = await h.lobby();
    const since = lobby.b.mark();
    expectOk(await lobby.a.act("room:ready"));
    const state = await lobby.b.waitState((s) => s.players[0]?.ready === true, since);
    expect(state.view).toBeNull();
    await toPlacement(lobby);
    const placement = lobby.a.lastState();
    expect(placement.view?.phase).toBe("placement");
    expect(placement.view?.rules.boardSize).toBe(DEFAULT_RULES.boardSize);
  });

  it("frees the seat when a player leaves the waiting room", async () => {
    const h = await start();
    const lobby = await h.lobby();
    const since = lobby.a.mark();
    expectOk(await lobby.b.act("room:leave"));
    await lobby.a.waitState((s) => s.players.length === 1, since);
    expect((await lobby.b.act("room:ready")).error).toBe("NOT_IN_ROOM");
    const c = await h.connect();
    expect(await c.call("room:join", { code: lobby.code, alias: "Charlie" })).toMatchObject({
      ok: true,
      seat: 1,
    });
  });

  it("relays predefined reactions to both players", async () => {
    const h = await start();
    const lobby = await h.lobby();
    expectOk(await lobby.a.act("reaction:send", { reaction: "good_shot" }));
    for (const client of [lobby.a, lobby.b]) {
      expect(await client.waitFor("reaction:received")).toEqual({ seat: 0, reaction: "good_shot" });
    }
    expect((await lobby.a.act("reaction:send", { reaction: "you suck" })).error).toBe(
      "INVALID_PAYLOAD",
    );
  });
});

describe("validation", () => {
  it("rejects malformed payloads with INVALID_PAYLOAD and keeps serving", async () => {
    const h = await start();
    const a = await h.connect();
    expect((await a.call("room:create", { alias: 7 })).error).toBe("INVALID_PAYLOAD");
    expect((await a.call("room:create", "nope")).error).toBe("INVALID_PAYLOAD");
    expect((await a.call("room:create")).error).toBe("INVALID_PAYLOAD");
    expect((await a.call("room:join", { code: "O0O0O0", alias: "Alpha" })).error).toBe(
      "INVALID_PAYLOAD",
    );
    expect((await a.call("room:create", { alias: "<script>" })).error).toBe("INVALID_PAYLOAD");
    a.socket.emit("room:create", { alias: "No ack" });
    expect(
      (await a.call("shot:fire", { actionId: "short", coord: { col: 0, row: 0 } })).error,
    ).toBe("INVALID_PAYLOAD");
  });

  it("drops the connection when a message exceeds the size limit", async () => {
    const h = await start();
    const a = await h.connect();
    a.socket.emit("room:create", { alias: "x".repeat(5000) });
    await a.waitDisconnect();
    expect(a.socket.connected).toBe(false);
  });

  it("rejects actions from a connection that is not in a room", async () => {
    const h = await start();
    const c = await h.connect();
    expect((await c.act("room:ready")).error).toBe("NOT_IN_ROOM");
    expect((await c.act("shot:fire", { coord: { col: 0, row: 0 } })).error).toBe("NOT_IN_ROOM");
  });

  it("rejects actions out of phase", async () => {
    const h = await start();
    const lobby = await h.lobby();
    expect((await lobby.a.act("shot:fire", { coord: { col: 0, row: 0 } })).error).toBe(
      "WRONG_PHASE",
    );
    expect((await lobby.a.act("fleet:submit", { fleet: FLEET_A })).error).toBe("WRONG_PHASE");
    expect((await lobby.a.act("rematch:request")).error).toBe("WRONG_PHASE");
    expect((await lobby.a.act("victory:claim")).error).toBe("CANNOT_CLAIM");
    await toBattle(lobby);
    expect((await lobby.a.act("room:ready")).error).toBe("WRONG_PHASE");
    expect((await lobby.a.act("fleet:submit", { fleet: FLEET_A })).error).toBe("WRONG_PHASE");
  });

  it("rejects an invalid fleet and a second submission", async () => {
    const h = await start();
    const lobby = await h.lobby();
    await toPlacement(lobby);
    expect((await lobby.a.act("fleet:submit", { fleet: FLEET_A.slice(0, 2) })).error).toBe(
      "INVALID_FLEET",
    );
    expectOk(await lobby.a.act("fleet:submit", { fleet: FLEET_A }));
    expect((await lobby.a.act("fleet:submit", { fleet: FLEET_A })).error).toBe("ALREADY_SUBMITTED");
  });

  it("rejects a shot out of turn, out of bounds or at a cell already fired", async () => {
    const h = await start();
    const lobby = await h.lobby();
    await toBattle(lobby);
    expect((await lobby.b.act("shot:fire", { coord: { col: 0, row: 0 } })).error).toBe(
      "NOT_YOUR_TURN",
    );
    expect((await lobby.a.act("shot:fire", { coord: { col: 12, row: 0 } })).error).toBe(
      "OUT_OF_BOUNDS",
    );
    const miss = emptyCellsOf(FLEET_B)[0] as Coord;
    expectOk(await lobby.a.act("shot:fire", { coord: miss }));
    expectOk(await lobby.b.act("shot:fire", { coord: emptyCellsOf(FLEET_A)[0] }));
    expect((await lobby.a.act("shot:fire", { coord: miss })).error).toBe("ALREADY_FIRED");
  });

  it("answers a duplicated actionId with the stored reply and no second effect", async () => {
    const h = await start();
    const lobby = await h.lobby();
    await toBattle(lobby);
    const sinceB = lobby.b.mark();
    const payload = { actionId: randomUUID(), coord: cellsOf(FLEET_B)[0] };
    const first = await lobby.a.call("shot:fire", payload);
    const second = await lobby.a.call("shot:fire", payload);
    expect(first).toEqual({ ok: true });
    expect(second).toEqual(first);
    await lobby.b.waitFor("shot:result", () => true, sinceB);
    await delay(50);
    expect(lobby.b.count("shot:result", sinceB)).toBe(1);
    expect(lobby.b.lastState().log).toHaveLength(1);
    // A fresh actionId is a new intent: it is no longer A's turn.
    expect((await lobby.a.act("shot:fire", { coord: cellsOf(FLEET_B)[1] })).error).toBe(
      "NOT_YOUR_TURN",
    );
  });

  it("ignores results, seats or victory data sent by the client", async () => {
    const h = await start();
    const lobby = await h.lobby();
    await toBattle(lobby);
    const target = cellsOf(FLEET_B)[0] as Coord;
    expectOk(await lobby.a.act("shot:fire", { coord: target, result: "miss", seat: 1, winner: 0 }));
    const shot = await lobby.b.waitFor<ShotRecord>("shot:result");
    expect(shot).toEqual({ id: 1, seat: 0, coord: target, result: "hit" });
  });

  it("rate-limits a connection above 10 messages per second", async () => {
    const h = await start();
    const c = await h.connect();
    const replies = await Promise.all(Array.from({ length: 15 }, () => c.act("room:ready")));
    expect(replies.filter((r) => r.error === "RATE_LIMITED")).toHaveLength(5);
    expect(replies.filter((r) => r.error === "NOT_IN_ROOM")).toHaveLength(10);
    await delay(1050);
    expect((await c.act("room:ready")).error).toBe("NOT_IN_ROOM");
  });
});

/** Keeps only the parts of a message that describe the rival's board. */
function rivalBoardParts(message: Message, rival: number): unknown {
  const stripShots = (records: readonly ShotRecord[]): ShotRecord[] =>
    records.filter((record) => record.seat !== rival);
  const payload = structuredClone(message.payload) as Record<string, unknown>;
  if (message.event === "shot:result") {
    return (payload as unknown as ShotRecord).seat === rival ? null : payload;
  }
  if (message.event === "room:state") {
    const state = payload as unknown as RoomState & Record<string, unknown>;
    const view = state.view as unknown as Record<string, unknown> | null;
    if (view) {
      delete view.ownFleet;
      delete view.ownShotsReceived;
    }
    return { ...state, log: stripShots(state.log) };
  }
  return payload;
}

/** Every "col:row" mentioned in a value, as {col,row} objects or as map keys. */
function mentionedCells(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) mentionedCells(item, found);
  } else if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.col === "number" && typeof record.row === "number") {
      found.add(`${record.col}:${record.row}`);
    }
    for (const [key, child] of Object.entries(record)) {
      if (/^\d+:\d+$/.test(key)) found.add(key);
      mentionedCells(child, found);
    }
  }
  return found;
}

function assertNoLeak(
  messages: readonly Message[],
  rival: number,
  rivalFleet: readonly Placement[],
) {
  const hidden = new Set(cellsOf(rivalFleet).map(coordKey));
  const gameOverAt = messages.findIndex((m) => m.event === "game:over");
  expect(gameOverAt).toBeGreaterThan(0);
  let checked = 0;
  for (const message of messages.slice(0, gameOverAt)) {
    if (message.event === "shot:result") {
      const shot = message.payload as ShotRecord;
      if (shot.seat !== rival) hidden.delete(coordKey(shot.coord));
    }
    if (message.event === "room:state") {
      expect((message.payload as RoomState).revealedOpponentFleet).toBeNull();
    }
    for (const cell of mentionedCells(rivalBoardParts(message, rival))) {
      expect(hidden.has(cell), `${message.event} leaks ${cell}`).toBe(false);
    }
    checked++;
  }
  expect(checked).toBeGreaterThan(30);
}

describe("full game", () => {
  it("plays a whole game to game:over and never leaks unrevealed positions", async () => {
    const h = await start(FAST);
    const lobby = await h.lobby();
    await toBattle(lobby);
    await playToEnd(lobby);

    expect(await lobby.a.waitFor("game:over")).toEqual({ winner: 0, reason: "fleet_destroyed" });
    const finalB = await lobby.b.waitState((s) => s.view?.phase === "finished");
    expect(finalB.endReason).toBe("fleet_destroyed");
    expect(finalB.view?.winner).toBe(0);
    expect(finalB.revealedOpponentFleet).toEqual(FLEET_A);
    expect(finalB.log).toHaveLength(cellsOf(FLEET_B).length * 2 - 1);
    expect(finalB.log.map((s) => s.id)).toEqual(finalB.log.map((_, i) => i + 1));

    // B never hit anything: none of A's ship cells may reach B before the end.
    assertNoLeak(lobby.b.messages, 0, FLEET_A);
    // A hit B progressively: only cells already hit may reach A.
    assertNoLeak(lobby.a.messages, 1, FLEET_B);
  });

  it("ends the game by forfeit when a player leaves mid-battle", async () => {
    const h = await start();
    const lobby = await h.lobby();
    await toBattle(lobby);
    expectOk(await lobby.a.act("room:leave"));
    expect(await lobby.b.waitFor("game:over")).toEqual({ winner: 1, reason: "forfeit" });
    const state = await lobby.b.waitState((s) => s.view?.phase === "finished");
    expect(state.endReason).toBe("forfeit");
    expect(state.revealedOpponentFleet).toEqual(FLEET_A);
    expect(state.players.find((p) => p.seat === 0)?.connected).toBe(false);
  });

  it("passes the turn when the turn timer expires", async () => {
    const h = await start({ turnTimerUnitMs: 5 });
    const lobby = await h.lobby({ turnTimerSec: 15 });
    await toBattle(lobby);
    const state = lobby.a.lastState();
    expect(state.turnTimerSec).toBe(15);
    expect(state.turnDeadline).toEqual(expect.any(Number));
    const changed = await lobby.b.waitFor<{ turn: number; deadline: number | null }>(
      "turn:changed",
      (p) => p.turn === 1,
    );
    expect(changed.deadline).toEqual(expect.any(Number));
    expect((await lobby.a.act("shot:fire", { coord: { col: 0, row: 0 } })).error).toBe(
      "NOT_YOUR_TURN",
    );
  });
});

describe("rematch", () => {
  it("starts a new placement in the same room with the same aliases when both accept", async () => {
    const h = await start(FAST);
    const lobby = await h.lobby();
    await toBattle(lobby);
    await playToEnd(lobby);
    expectOk(await lobby.a.act("rematch:request"));
    expect((await lobby.a.act("rematch:request")).error).toBe("ALREADY_REQUESTED");
    const since = lobby.a.mark();
    expectOk(await lobby.b.act("rematch:request"));
    const state = await lobby.a.waitState((s) => s.view?.phase === "placement", since);
    expect(state.code).toBe(lobby.code);
    expect(state.players.map((p) => p.alias)).toEqual(["Alpha", "Bravo"]);
    expect(state.log).toEqual([]);
    expect(state.endReason).toBeNull();
    expect(state.revealedOpponentFleet).toBeNull();
    expect(state.view?.ownFleet).toBeNull();
  });

  it("answers OPPONENT_GONE when the rival already left", async () => {
    const h = await start(FAST);
    const lobby = await h.lobby();
    await toBattle(lobby);
    await playToEnd(lobby);
    const since = lobby.a.mark();
    expectOk(await lobby.b.act("room:leave"));
    await lobby.a.waitState((s) => s.players[1]?.connected === false, since);
    expect((await lobby.a.act("rematch:request")).error).toBe("OPPONENT_GONE");
    expect((await lobby.b.act("rematch:request")).error).toBe("NOT_IN_ROOM");
  });
});

describe("disconnection and reconnection", () => {
  it("notifies the rival and freezes the game while a player is away", async () => {
    const h = await start({ turnTimerUnitMs: 5 });
    const lobby = await h.lobby({ turnTimerSec: 15 });
    await toBattle(lobby);
    const since = lobby.a.mark();
    lobby.b.close();
    const notice = await lobby.a.waitFor<{ seat: number; alias: string; deadline: number }>(
      "player:disconnected",
      () => true,
      since,
    );
    expect(notice).toEqual({ seat: 1, alias: "Bravo", deadline: expect.any(Number) });
    const frozen = await lobby.a.waitState((s) => s.reconnect !== null, since);
    expect(frozen.reconnect).toEqual({ seat: 1, deadline: notice.deadline });
    expect(frozen.turnDeadline).toBeNull();
    expect(frozen.canClaimVictory).toBe(false);
    expect(frozen.players[1]?.connected).toBe(false);

    const shot = await lobby.a.act("shot:fire", { coord: { col: 0, row: 0 } });
    expect(shot).toMatchObject({ ok: false, error: "GAME_FROZEN" });
    // The turn timer is paused: 15 × 5 ms would have expired by now.
    await delay(150);
    expect(lobby.a.count("turn:changed", since)).toBe(0);
  });

  it("restores the seat and the state when reconnecting with the token", async () => {
    const h = await start({ turnTimerUnitMs: 5 });
    const lobby = await h.lobby({ turnTimerSec: 15 });
    await toBattle(lobby);
    expectOk(await lobby.a.act("shot:fire", { coord: cellsOf(FLEET_B)[0] }));
    const since = lobby.a.mark();
    lobby.b.close();
    await lobby.a.waitFor("player:disconnected", () => true, since);

    const b2 = await h.connect();
    const rejoined = await b2.call("room:join", { token: lobby.tokenB });
    expect(rejoined).toEqual({ ok: true, code: lobby.code, token: lobby.tokenB, seat: 1 });
    expect(await lobby.a.waitFor("player:reconnected", () => true, since)).toEqual({ seat: 1 });
    const state = await b2.waitState((s) => s.view?.phase === "battle");
    expect(state.you).toBe(1);
    expect(state.view?.ownFleet).toEqual(FLEET_B);
    expect(state.log).toHaveLength(1);
    expect(state.reconnect).toBeNull();
    expect(state.turnDeadline).toEqual(expect.any(Number));
    expectOk(await b2.act("shot:fire", { coord: { col: 0, row: 0 } }));
  });

  it("lets the present player claim victory only after the window expires", async () => {
    const h = await start({ reconnectWindowMs: 150 });
    const lobby = await h.lobby();
    await toBattle(lobby);
    const since = lobby.a.mark();
    lobby.b.close();
    await lobby.a.waitFor("player:disconnected", () => true, since);
    expect((await lobby.a.act("victory:claim")).error).toBe("CANNOT_CLAIM");

    await lobby.a.waitState((s) => s.canClaimVictory, since);
    await delay(100);
    // No automatic victory: the game waits for the claim.
    expect(lobby.a.count("game:over", since)).toBe(0);
    expectOk(await lobby.a.act("victory:claim"));
    expect(await lobby.a.waitFor("game:over", () => true, since)).toEqual({
      winner: 0,
      reason: "abandoned",
    });
    const state = await lobby.a.waitState((s) => s.view?.phase === "finished", since);
    expect(state.endReason).toBe("abandoned");
    expect(state.canClaimVictory).toBe(false);
  });

  it("gives the seat to the newest tab and closes the previous one", async () => {
    const h = await start();
    const lobby = await h.lobby();
    const sinceA = lobby.a.mark();
    const tab2 = await h.connect();
    expect(await tab2.call("room:join", { token: lobby.tokenB })).toMatchObject({
      ok: true,
      seat: 1,
    });
    expect(await lobby.b.waitFor("error")).toEqual({ code: "SESSION_REPLACED" });
    await lobby.b.waitDisconnect();
    expectOk(await tab2.act("room:ready"));
    await delay(50);
    expect(lobby.a.count("player:disconnected", sinceA)).toBe(0);
    expect(lobby.a.lastState().players[1]).toMatchObject({ connected: true, ready: true });
  });
});

describe("cleanup", () => {
  it("deletes idle rooms and clears their timers", async () => {
    const h = await start({ roomIdleMs: 100 });
    const lobby = await h.lobby();
    expect(h.server.hasRoom(lobby.code)).toBe(true);
    expect(await lobby.a.waitFor("error", () => true, 0)).toEqual({ code: "ROOM_CLOSED" });
    expect(h.server.hasRoom(lobby.code)).toBe(false);
    expect(h.server.activeTimerCount()).toBe(0);
    const c = await h.connect();
    expect((await c.call("room:join", { code: lobby.code, alias: "Charlie" })).error).toBe(
      "ROOM_NOT_FOUND",
    );
    expect((await c.call("room:join", { token: lobby.tokenA })).error).toBe("INVALID_TOKEN");
    expect((await lobby.a.act("room:ready")).error).toBe("NOT_IN_ROOM");
  });

  it("deletes a room as soon as both players are gone", async () => {
    const h = await start();
    const lobby = await h.lobby();
    expectOk(await lobby.a.act("room:leave"));
    expectOk(await lobby.b.act("room:leave"));
    expect(h.server.hasRoom(lobby.code)).toBe(false);
    expect(h.server.roomCount()).toBe(0);
    expect(h.server.activeTimerCount()).toBe(0);
  });

  it("deletes a room when both players disconnect and their windows expire", async () => {
    const h = await start({ reconnectWindowMs: 50 });
    const lobby = await h.lobby();
    await toBattle(lobby);
    lobby.a.close();
    lobby.b.close();
    await delay(200);
    expect(h.server.roomCount()).toBe(0);
    expect(h.server.activeTimerCount()).toBe(0);
  });
});
