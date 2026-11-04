import { describe, expect, it } from "vitest";
import type { Placement } from "../board/placement";
import { DEFAULT_RULES } from "../rules/rules";
import { type Action, createGame, type GameState, reduce } from "./game";
import { publicBoardView, viewFor } from "./view";

const fleetA: Placement[] = [
  { shipId: "carrier", bow: { col: 0, row: 0 }, orientation: "h" },
  { shipId: "battleship", bow: { col: 0, row: 2 }, orientation: "h" },
  { shipId: "cruiser", bow: { col: 0, row: 4 }, orientation: "h" },
  { shipId: "submarine", bow: { col: 0, row: 6 }, orientation: "h" },
  { shipId: "destroyer", bow: { col: 0, row: 8 }, orientation: "h" },
];

function play(actions: Action[]): GameState {
  let state = createGame(DEFAULT_RULES);
  for (const action of [
    { type: "join", seat: 0 } as const,
    { type: "join", seat: 1 } as const,
    { type: "submitFleet", seat: 0, fleet: fleetA } as const,
    { type: "submitFleet", seat: 1, fleet: fleetA } as const,
    ...actions,
  ]) {
    const result = reduce(state, action);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
  }
  return state;
}

describe("publicBoardView", () => {
  it("only exposes shots, sunk ships and the ships still afloat", () => {
    const state = play([
      { type: "fire", seat: 0, coord: { col: 0, row: 8 } },
      { type: "fire", seat: 1, coord: { col: 9, row: 9 } },
      { type: "fire", seat: 0, coord: { col: 1, row: 8 } },
      { type: "fire", seat: 1, coord: { col: 8, row: 9 } },
      { type: "fire", seat: 0, coord: { col: 0, row: 0 } },
      { type: "fire", seat: 1, coord: { col: 7, row: 9 } },
      { type: "fire", seat: 0, coord: { col: 5, row: 5 } },
    ]);
    const view = publicBoardView(state, 1);
    expect(Object.keys(view).sort()).toEqual(["boardSize", "remainingShips", "shots", "sunkShips"]);
    expect(view.shots).toEqual({ "0:8": "hit", "1:8": "hit", "0:0": "hit", "5:5": "miss" });
    expect(view.sunkShips).toEqual([fleetA[4]]);
    expect(view.remainingShips.map((ship) => ship.id)).toEqual([
      "carrier",
      "battleship",
      "cruiser",
      "submarine",
    ]);
    // The carrier was hit but not sunk: its position must not leak.
    expect(JSON.stringify(view)).not.toContain('"carrier","bow"');
  });

  it("is deeply frozen so a consumer cannot alter it", () => {
    const view = publicBoardView(play([]), 1);
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.shots)).toBe(true);
    expect(Object.isFrozen(view.sunkShips)).toBe(true);
  });
});

describe("viewFor", () => {
  it("gives a player their full fleet and only the public view of the rival", () => {
    const state = play([{ type: "fire", seat: 0, coord: { col: 2, row: 0 } }]);
    const view = viewFor(state, 1);
    expect(view.you).toBe(1);
    expect(view.ownFleet).toEqual(fleetA);
    expect(view.ownShotsReceived).toEqual({ "2:0": "hit" });
    expect(view.opponent).toEqual(publicBoardView(state, 0));
    expect(view).not.toHaveProperty("players");
  });
});
