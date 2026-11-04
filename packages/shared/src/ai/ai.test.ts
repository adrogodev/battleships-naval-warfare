import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Coord, coordKey } from "../board/coord";
import { type Placement, validateFleet } from "../board/placement";
import { type Action, createGame, type GameState, reduce } from "../game/game";
import { publicBoardView } from "../game/view";
import { createRng } from "../random/rng";
import { DEFAULT_RULES } from "../rules/rules";
import { createAi, DIFFICULTIES, type Difficulty } from "./ai";

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
        DEFAULT_RULES,
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
      return createAi("easy").chooseShot(publicBoardView(state, 0), DEFAULT_RULES, createRng(99));
    };
    expect(pick(fleetA)).toEqual(pick(fleetB));
  });
});

/** Same as fleetA except the destroyer, so both share the carrier hit at A-1. */
const fleetC: Placement[] = [...fleetA.slice(0, 4), destroyerAt(7, 8)];

function destroyerAt(col: number, row: number): Placement {
  return { shipId: "destroyer", bow: { col, row }, orientation: "h" };
}

/** Plays the same shot sequence against a hidden defender fleet and asks the AI for its next shot. */
function nextShotAfter(
  difficulty: Difficulty,
  defender: Placement[],
  shots: readonly Coord[],
  seed: number,
): Coord {
  let state = battle(defender);
  for (const coord of shots) {
    for (const action of [
      { type: "fire", seat: 1, coord } as const,
      { type: "fire", seat: 0, coord } as const,
    ]) {
      const result = reduce(state, action);
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
  }
  return createAi(difficulty).chooseShot(publicBoardView(state, 0), DEFAULT_RULES, createRng(seed));
}

describe("every difficulty", () => {
  it.each(DIFFICULTIES)("%s decides from public information only (misses only)", (difficulty) => {
    const misses: Coord[] = [
      { col: 0, row: 9 },
      { col: 4, row: 9 },
      { col: 2, row: 5 },
    ];
    for (let seed = 0; seed < 10; seed++) {
      expect(nextShotAfter(difficulty, fleetA, misses, seed)).toEqual(
        nextShotAfter(difficulty, fleetB, misses, seed),
      );
    }
  });

  it.each(DIFFICULTIES)("%s decides from public information only (open hit)", (difficulty) => {
    // A-1 is a carrier hit in both fleets; the destroyers sit in different hidden places.
    const shots: Coord[] = [
      { col: 0, row: 0 },
      { col: 5, row: 9 },
    ];
    for (let seed = 0; seed < 10; seed++) {
      expect(nextShotAfter(difficulty, fleetA, shots, seed)).toEqual(
        nextShotAfter(difficulty, fleetC, shots, seed),
      );
    }
  });

  // Hard samples 30 fleets per placement, so 50 runs can exceed the default 5 s under a
  // fully loaded parallel suite.
  it.each(DIFFICULTIES)(
    "%s places a valid fleet for any seed",
    (difficulty) => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
          const fleet = createAi(difficulty).placeFleet(DEFAULT_RULES, createRng(seed));
          expect(validateFleet(fleet, DEFAULT_RULES)).toEqual({ ok: true });
        }),
        { numRuns: 50 },
      );
    },
    30_000,
  );

  it("normal mixes orientations in its fleet", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        const fleet = createAi("normal").placeFleet(DEFAULT_RULES, createRng(seed));
        const orientations = new Set(fleet.map((placement) => placement.orientation));
        expect(orientations).toEqual(new Set(["h", "v"]));
      }),
      { numRuns: 50 },
    );
  });
});
