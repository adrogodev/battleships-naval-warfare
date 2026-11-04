import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createRng } from "../random/rng";
import { DEFAULT_RULES, type GameRules } from "../rules/rules";
import { coordKey } from "./coord";
import {
  type Placement,
  randomFleet,
  shipCells,
  validateFleet,
  validatePlacement,
  validPlacementsFor,
} from "./placement";

const rules = DEFAULT_RULES;
const loose: GameRules = { ...DEFAULT_RULES, noContact: false };

const carrierAtA1: Placement = { shipId: "carrier", bow: { col: 0, row: 0 }, orientation: "h" };

describe("shipCells", () => {
  it("expands horizontally from the bow", () => {
    expect(shipCells(carrierAtA1, 5).map(coordKey)).toEqual(["0:0", "1:0", "2:0", "3:0", "4:0"]);
  });

  it("expands vertically from the bow", () => {
    const destroyer: Placement = { shipId: "destroyer", bow: { col: 3, row: 4 }, orientation: "v" };
    expect(shipCells(destroyer, 2).map(coordKey)).toEqual(["3:4", "3:5"]);
  });
});

describe("validatePlacement", () => {
  it("accepts a ship inside an empty board", () => {
    expect(validatePlacement([], carrierAtA1, rules)).toEqual({ ok: true });
  });

  it("rejects a ship that leaves the board horizontally", () => {
    const candidate: Placement = { shipId: "carrier", bow: { col: 6, row: 0 }, orientation: "h" };
    expect(validatePlacement([], candidate, rules)).toEqual({ ok: false, reason: "out_of_bounds" });
  });

  it("rejects a ship that leaves the board vertically", () => {
    const candidate: Placement = {
      shipId: "battleship",
      bow: { col: 0, row: 7 },
      orientation: "v",
    };
    expect(validatePlacement([], candidate, rules)).toEqual({ ok: false, reason: "out_of_bounds" });
  });

  it("rejects overlapping ships", () => {
    const candidate: Placement = { shipId: "cruiser", bow: { col: 2, row: 0 }, orientation: "v" };
    expect(validatePlacement([carrierAtA1], candidate, loose)).toEqual({
      ok: false,
      reason: "overlap",
    });
  });

  it("rejects side contact when the no-contact rule is on", () => {
    const candidate: Placement = { shipId: "cruiser", bow: { col: 0, row: 1 }, orientation: "h" };
    expect(validatePlacement([carrierAtA1], candidate, rules)).toEqual({
      ok: false,
      reason: "contact",
    });
  });

  it("rejects corner contact when the no-contact rule is on", () => {
    const candidate: Placement = { shipId: "cruiser", bow: { col: 5, row: 1 }, orientation: "h" };
    expect(validatePlacement([carrierAtA1], candidate, rules)).toEqual({
      ok: false,
      reason: "contact",
    });
  });

  it("allows contact when the no-contact rule is off", () => {
    const candidate: Placement = { shipId: "cruiser", bow: { col: 0, row: 1 }, orientation: "h" };
    expect(validatePlacement([carrierAtA1], candidate, loose)).toEqual({ ok: true });
  });

  it("rejects a ship that is not part of the fleet", () => {
    const small: GameRules = { ...rules, fleet: [{ id: "destroyer", length: 2 }] };
    expect(validatePlacement([], carrierAtA1, small)).toEqual({
      ok: false,
      reason: "unknown_ship",
    });
  });

  it("rejects placing the same ship twice", () => {
    const again: Placement = { shipId: "carrier", bow: { col: 0, row: 5 }, orientation: "h" };
    expect(validatePlacement([carrierAtA1], again, rules)).toEqual({
      ok: false,
      reason: "duplicate_ship",
    });
  });

  it("ignores the ship being moved when it is already placed", () => {
    const moved: Placement = { shipId: "carrier", bow: { col: 1, row: 0 }, orientation: "h" };
    expect(validatePlacement([carrierAtA1], moved, rules, { replacing: true })).toEqual({
      ok: true,
    });
  });
});

describe("validateFleet", () => {
  const complete: Placement[] = [
    { shipId: "carrier", bow: { col: 0, row: 0 }, orientation: "h" },
    { shipId: "battleship", bow: { col: 0, row: 2 }, orientation: "h" },
    { shipId: "cruiser", bow: { col: 0, row: 4 }, orientation: "h" },
    { shipId: "submarine", bow: { col: 0, row: 6 }, orientation: "h" },
    { shipId: "destroyer", bow: { col: 0, row: 8 }, orientation: "h" },
  ];

  it("accepts a complete valid fleet", () => {
    expect(validateFleet(complete, rules)).toEqual({ ok: true });
  });

  it("rejects an incomplete fleet", () => {
    expect(validateFleet(complete.slice(0, 4), rules)).toEqual({ ok: false, reason: "incomplete" });
  });

  it("rejects a fleet with an invalid ship", () => {
    const touching = [
      ...complete.slice(0, 4),
      { ...(complete[4] as Placement), bow: { col: 0, row: 7 } },
    ];
    expect(validateFleet(touching, rules)).toEqual({ ok: false, reason: "contact" });
  });
});

describe("validPlacementsFor", () => {
  it("returns exactly the positions validatePlacement accepts (property)", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.boolean(),
        fc.integer({ min: 0, max: 4 }),
        (seed, noContact, n) => {
          const variant: GameRules = { ...rules, noContact };
          const placed = randomFleet(variant, createRng(seed)).slice(0, n);
          const shipId = variant.fleet[n]?.id ?? "destroyer";
          const expected: Placement[] = [];
          for (const orientation of ["h", "v"] as const) {
            for (let row = 0; row < 10; row++) {
              for (let col = 0; col < 10; col++) {
                const candidate: Placement = { shipId, bow: { col, row }, orientation };
                if (validatePlacement(placed, candidate, variant).ok) expected.push(candidate);
              }
            }
          }
          expect(validPlacementsFor(placed, shipId, variant)).toEqual(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("randomFleet", () => {
  it("is reproducible for the same seed", () => {
    expect(randomFleet(rules, createRng(7))).toEqual(randomFleet(rules, createRng(7)));
  });

  it("always produces a valid fleet (property)", () => {
    fc.assert(
      fc.property(fc.integer(), fc.boolean(), (seed, noContact) => {
        const variant: GameRules = { ...rules, noContact };
        const fleet = randomFleet(variant, createRng(seed));
        expect(validateFleet(fleet, variant)).toEqual({ ok: true });
      }),
      { numRuns: 500 },
    );
  });
});
