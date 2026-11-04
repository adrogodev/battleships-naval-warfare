import { describe, expect, it } from "vitest";
import { type Coord, coordKey } from "../board/coord";
import { type Placement, validateFleet } from "../board/placement";
import { type Action, createGame, type GameState, reduce } from "../game/game";
import { publicBoardView } from "../game/view";
import { createRng } from "../random/rng";
import { DEFAULT_RULES } from "../rules/rules";
import { createAi } from "./ai";

const fleetA: Placement[] = [
  { shipId: "carrier", bow: { col: 0, row: 0 }, orientation: "h" },
  { shipId: "battleship", bow: { col: 0, row: 2 }, orientation: "h" },
  { shipId: "cruiser", bow: { col: 0, row: 4 }, orientation: "h" },
  { shipId: "submarine", bow: { col: 0, row: 6 }, orientation: "h" },
  { shipId: "destroyer", bow: { col: 0, row: 8 }, orientation: "h" },
];
const fleetB: Placement[] = [
  { shipId: "carrier", bow: { col: 5, row: 0 }, orientation: "h" },
  { shipId: "battleship", bow: { col: 6, row: 2 }, orientation: "h" },
  { shipId: "cruiser", bow: { col: 7, row: 4 }, orientation: "h" },
  { shipId: "submarine", bow: { col: 7, row: 6 }, orientation: "h" },
  { shipId: "destroyer", bow: { col: 8, row: 8 }, orientation: "h" },
];

function battle(defenderFleet: Placement[]): GameState {
  let state = createGame(DEFAULT_RULES, { firstTurn: 1 });
  const setup: Action[] = [
    { type: "join", seat: 0 },
    { type: "join", seat: 1 },
    { type: "submitFleet", seat: 0, fleet: defenderFleet },
    { type: "submitFleet", seat: 1, fleet: fleetA },
  ];
  for (const action of setup) {
    const result = reduce(state, action);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
  }
  return state;
}

describe("easy AI", () => {
  it("never repeats a cell and eventually covers the whole board", () => {
    const ai = createAi("easy");
    const rng = createRng(11);
    const shots: Record<string, "miss" | "hit"> = {};
    for (let i = 0; i < 100; i++) {
      const coord = ai.chooseShot(
        { boardSize: 10, shots, sunkShips: [], remainingShips: DEFAULT_RULES.fleet },
        rng,
      );
      expect(shots[coordKey(coord)]).toBeUndefined();
      shots[coordKey(coord)] = "miss";
    }
    expect(Object.keys(shots)).toHaveLength(100);
  });

  it("places a valid fleet", () => {
    const fleet = createAi("easy").placeFleet(DEFAULT_RULES, createRng(5));
    expect(validateFleet(fleet, DEFAULT_RULES)).toEqual({ ok: true });
  });

  it("decides from public information only: hidden fleets do not change its choice", () => {
    // Same shot history (misses on cells empty in both fleets), different hidden fleets.
    const commonMisses: Coord[] = [
      { col: 0, row: 9 },
      { col: 4, row: 9 },
      { col: 2, row: 5 },
    ];
    const pick = (defender: Placement[]): Coord => {
      let state = battle(defender);
      for (const coord of commonMisses) {
        for (const action of [
          { type: "fire", seat: 1, coord } as const,
          { type: "fire", seat: 0, coord } as const,
        ]) {
          const result = reduce(state, action);
          if (!result.ok) throw new Error(result.error);
          state = result.state;
        }
      }
      return createAi("easy").chooseShot(publicBoardView(state, 0), createRng(99));
    };
    expect(pick(fleetA)).toEqual(pick(fleetB));
  });
});
