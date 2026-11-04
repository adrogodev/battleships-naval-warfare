import { describe, expect, it } from "vitest";
import type { Coord } from "../board/coord";
import { type Placement, shipCells } from "../board/placement";
import { DEFAULT_RULES, type GameRules } from "../rules/rules";
import { type Action, createGame, type GameState, reduce, type Seat } from "./game";

const fleetA: Placement[] = [
  { shipId: "carrier", bow: { col: 0, row: 0 }, orientation: "h" },
  { shipId: "battleship", bow: { col: 0, row: 2 }, orientation: "h" },
  { shipId: "cruiser", bow: { col: 0, row: 4 }, orientation: "h" },
  { shipId: "submarine", bow: { col: 0, row: 6 }, orientation: "h" },
  { shipId: "destroyer", bow: { col: 0, row: 8 }, orientation: "h" },
];
const fleetB: Placement[] = [
  { shipId: "carrier", bow: { col: 9, row: 0 }, orientation: "v" },
  { shipId: "battleship", bow: { col: 7, row: 0 }, orientation: "v" },
  { shipId: "cruiser", bow: { col: 5, row: 0 }, orientation: "v" },
  { shipId: "submarine", bow: { col: 3, row: 0 }, orientation: "v" },
  { shipId: "destroyer", bow: { col: 1, row: 0 }, orientation: "v" },
];

function apply(state: GameState, action: Action): GameState {
  const result = reduce(state, action);
  if (!result.ok) throw new Error(`Unexpected rejection: ${result.error}`);
  return result.state;
}

function inPlacement(rules: GameRules = DEFAULT_RULES, firstTurn: Seat = 0): GameState {
  let state = createGame(rules, { firstTurn });
  state = apply(state, { type: "join", seat: 0 });
  return apply(state, { type: "join", seat: 1 });
}

function inBattle(rules: GameRules = DEFAULT_RULES): GameState {
  let state = inPlacement(rules);
  state = apply(state, { type: "submitFleet", seat: 0, fleet: fleetA });
  return apply(state, { type: "submitFleet", seat: 1, fleet: fleetB });
}

const fire = (seat: Seat, col: number, row: number): Action => ({
  type: "fire",
  seat,
  coord: { col, row },
});

describe("phase transitions", () => {
  it("goes lobby -> placement when both seats join", () => {
    let state = createGame(DEFAULT_RULES);
    expect(state.phase).toBe("lobby");
    state = apply(state, { type: "join", seat: 0 });
    expect(state.phase).toBe("lobby");
    const result = reduce(state, { type: "join", seat: 1 });
    expect(result.ok && result.state.phase).toBe("placement");
    expect(result.ok && result.events).toContainEqual({ type: "phaseChanged", phase: "placement" });
  });

  it("goes placement -> battle only when both fleets are valid", () => {
    let state = inPlacement();
    state = apply(state, { type: "submitFleet", seat: 0, fleet: fleetA });
    expect(state.phase).toBe("placement");
    state = apply(state, { type: "submitFleet", seat: 1, fleet: fleetB });
    expect(state.phase).toBe("battle");
    expect(state.turn).toBe(0);
  });

  it("rejects an invalid fleet with its reason", () => {
    const result = reduce(inPlacement(), {
      type: "submitFleet",
      seat: 0,
      fleet: fleetA.slice(0, 3),
    });
    expect(result).toEqual({ ok: false, error: "invalid_fleet", detail: "incomplete" });
  });

  it("rejects a second fleet from the same seat", () => {
    const state = apply(inPlacement(), { type: "submitFleet", seat: 0, fleet: fleetA });
    expect(reduce(state, { type: "submitFleet", seat: 0, fleet: fleetA })).toMatchObject({
      ok: false,
      error: "already_submitted",
    });
  });

  it("rejects actions that do not belong to the current phase", () => {
    const lobby = createGame(DEFAULT_RULES);
    expect(reduce(lobby, fire(0, 0, 0))).toMatchObject({ ok: false, error: "wrong_phase" });
    expect(reduce(lobby, { type: "submitFleet", seat: 0, fleet: fleetA })).toMatchObject({
      ok: false,
      error: "wrong_phase",
    });
    expect(reduce(inBattle(), { type: "submitFleet", seat: 0, fleet: fleetA })).toMatchObject({
      ok: false,
      error: "wrong_phase",
    });
    expect(reduce(inBattle(), { type: "requestRematch", seat: 0 })).toMatchObject({
      ok: false,
      error: "wrong_phase",
    });
  });

  it("starts with the configured first turn", () => {
    let state = inPlacement(DEFAULT_RULES, 1);
    state = apply(state, { type: "submitFleet", seat: 0, fleet: fleetA });
    state = apply(state, { type: "submitFleet", seat: 1, fleet: fleetB });
    expect(state.turn).toBe(1);
  });
});

describe("shots", () => {
  it("resolves a miss and passes the turn", () => {
    const result = reduce(inBattle(), fire(0, 0, 9));
    expect(result.ok && result.events).toContainEqual({
      type: "shotResolved",
      seat: 0,
      coord: { col: 0, row: 9 },
      result: "miss",
    });
    expect(result.ok && result.state.turn).toBe(1);
  });

  it("resolves a hit and passes the turn under classic rules", () => {
    const result = reduce(inBattle(), fire(0, 9, 0));
    expect(result.ok && result.events).toContainEqual({
      type: "shotResolved",
      seat: 0,
      coord: { col: 9, row: 0 },
      result: "hit",
    });
    expect(result.ok && result.state.turn).toBe(1);
  });

  it("keeps the turn after a hit when the extra-turn variant is on", () => {
    const result = reduce(inBattle({ ...DEFAULT_RULES, extraTurnOnHit: true }), fire(0, 9, 0));
    expect(result.ok && result.state.turn).toBe(0);
  });

  it("rejects firing out of turn", () => {
    expect(reduce(inBattle(), fire(1, 0, 0))).toMatchObject({ ok: false, error: "not_your_turn" });
  });

  it("rejects firing outside the board", () => {
    expect(reduce(inBattle(), fire(0, 10, 0))).toMatchObject({ ok: false, error: "out_of_bounds" });
  });

  it("rejects firing twice at the same cell", () => {
    let state = inBattle();
    state = apply(state, fire(0, 4, 9));
    state = apply(state, fire(1, 4, 9));
    expect(reduce(state, fire(0, 4, 9))).toMatchObject({ ok: false, error: "already_fired" });
  });

  it("reports a sunk ship with its id once every cell is hit", () => {
    let state = inBattle();
    state = apply(state, fire(0, 1, 0));
    state = apply(state, fire(1, 9, 9));
    const result = reduce(state, fire(0, 1, 1));
    expect(result.ok && result.events).toContainEqual({
      type: "shotResolved",
      seat: 0,
      coord: { col: 1, row: 1 },
      result: "sunk",
      shipId: "destroyer",
    });
  });

  it("ends the game when a whole fleet is sunk", () => {
    let state = inBattle();
    const targets: Coord[] = fleetB.flatMap((ship) => {
      const length = DEFAULT_RULES.fleet.find((s) => s.id === ship.shipId)?.length ?? 0;
      return shipCells(ship, length);
    });
    const misses: Coord[] = Array.from({ length: 17 }, (_, i) => ({
      col: i % 10,
      row: i < 10 ? 9 : 1,
    }));
    let events: unknown[] = [];
    for (const [i, target] of targets.entries()) {
      const result = reduce(state, { type: "fire", seat: 0, coord: target });
      if (!result.ok) throw new Error(result.error);
      state = result.state;
      events = result.events;
      if (state.phase === "finished") break;
      state = apply(state, { type: "fire", seat: 1, coord: misses[i] as Coord });
    }
    expect(state.phase).toBe("finished");
    expect(state.winner).toBe(0);
    expect(events).toContainEqual({ type: "gameOver", winner: 0, reason: "fleet_destroyed" });
    expect(reduce(state, fire(1, 5, 5))).toMatchObject({ ok: false, error: "wrong_phase" });
  });
});

describe("leaving and rematch", () => {
  it("forfeits the battle when a player leaves", () => {
    const result = reduce(inBattle(), { type: "leave", seat: 1 });
    expect(result.ok && result.state.phase).toBe("finished");
    expect(result.ok && result.state.winner).toBe(0);
    expect(result.ok && result.events).toContainEqual({
      type: "gameOver",
      winner: 0,
      reason: "forfeit",
    });
  });

  it("restarts placement when both players request a rematch", () => {
    let state = apply(inBattle(), { type: "leave", seat: 1 });
    state = apply(state, { type: "requestRematch", seat: 0 });
    expect(state.phase).toBe("finished");
    state = apply(state, { type: "requestRematch", seat: 1 });
    expect(state.phase).toBe("placement");
    expect(state.players[0].fleet).toBeNull();
    expect(state.players[0].shotsReceived).toEqual({});
    expect(state.winner).toBeNull();
  });

  it("does not mutate the previous state", () => {
    const before = inBattle();
    const snapshot = JSON.stringify(before);
    reduce(before, fire(0, 9, 0));
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
