import { describe, expect, it } from "vitest";
import { allCoords, type Coord, coordKey, neighbours } from "../board/coord";
import { type Placement, randomFleet, shipCells, shipLength } from "../board/placement";
import type { PublicBoardView } from "../game/view";
import { createRng } from "../random/rng";
import { DEFAULT_RULES } from "../rules/rules";
import { createAi } from "./ai";
import { playGame } from "./simulate";

const rules = DEFAULT_RULES;

function sunkKeys(view: PublicBoardView): Set<string> {
  const keys = new Set<string>();
  for (const placement of view.sunkShips) {
    for (const cell of shipCells(placement, shipLength(rules, placement.shipId) ?? 0)) {
      keys.add(coordKey(cell));
    }
  }
  return keys;
}

function openHitCoords(view: PublicBoardView): Coord[] {
  const sunk = sunkKeys(view);
  return allCoords(view.boardSize).filter(
    (c) => view.shots[coordKey(c)] === "hit" && !sunk.has(coordKey(c)),
  );
}

function sunkNeighbourKeys(view: PublicBoardView): Set<string> {
  const keys = new Set<string>();
  for (const key of sunkKeys(view)) {
    const [col, row] = key.split(":").map(Number);
    for (const n of neighbours({ col: col ?? 0, row: row ?? 0 }, view.boardSize)) {
      keys.add(coordKey(n));
    }
  }
  return keys;
}

const orthogonal = (a: Coord, b: Coord) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;

function view(shots: Record<string, "miss" | "hit">, sunkShips: Placement[] = []): PublicBoardView {
  const sunkIds = new Set(sunkShips.map((p) => p.shipId));
  return {
    boardSize: 10,
    shots,
    sunkShips,
    remainingShips: rules.fleet.filter((ship) => !sunkIds.has(ship.id)),
  };
}

describe("normal AI (Captain)", () => {
  it("hunts on the checkerboard while there are no open hits", () => {
    const ai = createAi("normal");
    for (let seed = 0; seed < 50; seed++) {
      const coord = ai.chooseShot(view({}), rules, createRng(seed));
      expect((coord.col + coord.row) % 2).toBe(0);
    }
  });

  it("after a single hit tries an orthogonal neighbour", () => {
    const ai = createAi("normal");
    for (let seed = 0; seed < 30; seed++) {
      const coord = ai.chooseShot(view({ "4:4": "hit" }), rules, createRng(seed));
      expect(orthogonal(coord, { col: 4, row: 4 })).toBe(true);
    }
  });

  it("with two aligned hits extends that line", () => {
    const ai = createAi("normal");
    for (let seed = 0; seed < 30; seed++) {
      const coord = ai.chooseShot(
        view({ "4:4": "hit", "5:4": "hit", "6:4": "miss" }),
        rules,
        createRng(seed),
      );
      expect(coord).toEqual({ col: 3, row: 4 });
    }
  });

  it("pursues a hit along its line until the ship sinks, in real games", () => {
    for (let game = 0; game < 30; game++) {
      const defenderFleet = randomFleet(rules, createRng(500 + game));
      playGame({
        ai: createAi("normal"),
        rules,
        defenderFleet,
        rng: createRng(game),
        onShot: (current, coord) => {
          const open = openHitCoords(current);
          if (open.length === 0) {
            expect((coord.col + coord.row) % 2).toBe(0);
            return;
          }
          expect(open.some((hit) => orthogonal(hit, coord))).toBe(true);
          if (open.length >= 2) {
            const first = open[0] as Coord;
            const horizontal = open.every((hit) => hit.row === first.row);
            const vertical = open.every((hit) => hit.col === first.col);
            expect(horizontal || vertical).toBe(true);
            if (horizontal) expect(coord.row).toBe(first.row);
            else expect(coord.col).toBe(first.col);
          }
        },
      });
    }
  });

  // Only the Admiral deduces from the no-contact rule; the Captain plays exactly as specified
  // (checkerboard hunt + target), which keeps the two difficulties clearly apart.
  it("never repeats a cell; hard also never shoots next to a sunk ship (no-contact)", () => {
    for (const difficulty of ["normal", "hard"] as const) {
      for (let game = 0; game < 15; game++) {
        const seen = new Set<string>();
        playGame({
          ai: createAi(difficulty),
          rules,
          defenderFleet: randomFleet(rules, createRng(900 + game)),
          rng: createRng(game),
          onShot: (current, coord) => {
            if (difficulty === "hard") {
              expect(sunkNeighbourKeys(current).has(coordKey(coord))).toBe(false);
            }
            expect(current.shots[coordKey(coord)]).toBeUndefined();
            expect(seen.has(coordKey(coord))).toBe(false);
            seen.add(coordKey(coord));
          },
        });
      }
    }
  });

  it("hard never shoots next to a sunk ship in a crafted position", () => {
    const destroyer: Placement = { shipId: "destroyer", bow: { col: 4, row: 4 }, orientation: "h" };
    const current = view({ "4:4": "hit", "5:4": "hit" }, [destroyer]);
    const forbidden = sunkNeighbourKeys(current);
    for (let seed = 0; seed < 50; seed++) {
      const coord = createAi("hard").chooseShot(current, rules, createRng(seed));
      expect(forbidden.has(coordKey(coord))).toBe(false);
    }
  });

  it("normal does not reason about the no-contact rule: it may hunt next to a sunk ship", () => {
    const destroyer: Placement = { shipId: "destroyer", bow: { col: 4, row: 4 }, orientation: "h" };
    const current = view({ "4:4": "hit", "5:4": "hit" }, [destroyer]);
    const forbidden = sunkNeighbourKeys(current);
    const shots = Array.from({ length: 400 }, (_, seed) =>
      createAi("normal").chooseShot(current, rules, createRng(seed)),
    );
    expect(shots.some((coord) => forbidden.has(coordKey(coord)))).toBe(true);
  });
});
