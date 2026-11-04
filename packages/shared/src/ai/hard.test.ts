import { describe, expect, it } from "vitest";
import { coordKey } from "../board/coord";
import { type Placement, randomFleet } from "../board/placement";
import type { PublicBoardView } from "../game/view";
import { createRng } from "../random/rng";
import { DEFAULT_RULES } from "../rules/rules";
import { createAi } from "./ai";
import { densityMap, fleetObviousness } from "./hard";
import { playGame } from "./simulate";

const rules = DEFAULT_RULES;

const maxOf = (map: number[][]) => Math.max(...map.flat());

describe("densityMap", () => {
  it("counts every position of every ship on an empty board", () => {
    const empty: PublicBoardView = {
      boardSize: 10,
      shots: {},
      sunkShips: [],
      remainingShips: [{ id: "destroyer", length: 2 }],
    };
    const map = densityMap(empty, rules);
    // A destroyer can cover a corner in 2 ways and an inner cell in 4 ways.
    expect(map[0]?.[0]).toBe(2);
    expect(map[5]?.[5]).toBe(4);
  });

  it("gives 0 to shot cells and only counts positions through an open hit", () => {
    const current: PublicBoardView = {
      boardSize: 10,
      shots: { "4:4": "hit", "0:0": "miss" },
      sunkShips: [],
      remainingShips: [{ id: "destroyer", length: 2 }],
    };
    const map = densityMap(current, rules);
    expect(map[4]?.[4]).toBe(0);
    expect(map[0]?.[0]).toBe(0);
    for (const [col, row] of [
      [3, 4],
      [5, 4],
      [4, 3],
      [4, 5],
    ] as const) {
      expect(map[row]?.[col]).toBeGreaterThan(0);
    }
    expect(map[9]?.[9]).toBe(0);
    expect(map[3]?.[3]).toBe(0);
  });

  it("excludes cells next to a sunk ship when no-contact is on", () => {
    const destroyer: Placement = { shipId: "destroyer", bow: { col: 4, row: 4 }, orientation: "h" };
    const current: PublicBoardView = {
      boardSize: 10,
      shots: { "4:4": "hit", "5:4": "hit" },
      sunkShips: [destroyer],
      remainingShips: rules.fleet.filter((ship) => ship.id !== "destroyer"),
    };
    const map = densityMap(current, rules);
    expect(map[3]?.[3]).toBe(0);
    expect(map[5]?.[6]).toBe(0);
    expect(densityMap(current, { ...rules, noContact: false })[3]?.[3]).toBeGreaterThan(0);
  });
});

describe("hard AI (Admiral)", () => {
  it("always fires at a cell of maximum density, in real games", () => {
    for (let game = 0; game < 10; game++) {
      playGame({
        ai: createAi("hard"),
        rules,
        defenderFleet: randomFleet(rules, createRng(300 + game)),
        rng: createRng(game),
        onShot: (current, coord) => {
          const map = densityMap(current, rules);
          const max = maxOf(map);
          expect(max).toBeGreaterThan(0);
          expect(map[coord.row]?.[coord.col]).toBe(max);
          for (const key of Object.keys(current.shots)) {
            const [col, row] = key.split(":").map(Number);
            expect(map[row ?? -1]?.[col ?? -1]).toBe(0);
          }
          expect(current.shots[coordKey(coord)]).toBeUndefined();
        },
      });
    }
  });

  it("breaks density ties at random", () => {
    const empty: PublicBoardView = {
      boardSize: 10,
      shots: {},
      sunkShips: [],
      remainingShips: rules.fleet,
    };
    const picks = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      picks.add(coordKey(createAi("hard").chooseShot(empty, rules, createRng(seed))));
    }
    expect(picks.size).toBeGreaterThan(1);
  });
});

describe("hard placement", () => {
  it("scores an obvious fleet (all horizontal, on the border, one corner) above a spread one", () => {
    const obvious: Placement[] = [
      { shipId: "carrier", bow: { col: 0, row: 0 }, orientation: "h" },
      { shipId: "battleship", bow: { col: 0, row: 2 }, orientation: "h" },
      { shipId: "cruiser", bow: { col: 6, row: 0 }, orientation: "h" },
      { shipId: "submarine", bow: { col: 0, row: 4 }, orientation: "h" },
      { shipId: "destroyer", bow: { col: 5, row: 2 }, orientation: "h" },
    ];
    const spread: Placement[] = [
      { shipId: "carrier", bow: { col: 1, row: 1 }, orientation: "v" },
      { shipId: "battleship", bow: { col: 5, row: 2 }, orientation: "h" },
      { shipId: "cruiser", bow: { col: 7, row: 5 }, orientation: "v" },
      { shipId: "submarine", bow: { col: 3, row: 7 }, orientation: "h" },
      { shipId: "destroyer", bow: { col: 4, row: 4 }, orientation: "h" },
    ];
    expect(fleetObviousness(obvious, rules)).toBeGreaterThan(fleetObviousness(spread, rules));
  });

  it("is on average less obvious than a plain random fleet", () => {
    let hard = 0;
    let plain = 0;
    for (let seed = 0; seed < 40; seed++) {
      hard += fleetObviousness(createAi("hard").placeFleet(rules, createRng(seed)), rules);
      plain += fleetObviousness(randomFleet(rules, createRng(seed)), rules);
    }
    expect(hard).toBeLessThan(plain);
  });
});
