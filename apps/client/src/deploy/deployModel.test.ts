import { createRng, DEFAULT_RULES, validateFleet } from "@battleships/shared";
import { describe, expect, it } from "vitest";
import {
  initialDeploy,
  isFleetReady,
  placeAt,
  preview,
  randomize,
  reset,
  returnToDock,
  rotate,
  select,
} from "./deployModel";

const rules = DEFAULT_RULES;

describe("deploy model", () => {
  it("starts with every ship in the dock and the first one selected", () => {
    const state = initialDeploy(rules);
    expect(state.placed).toEqual([]);
    expect(state.selected).toBe("carrier");
    expect(state.orientation).toBe("h");
    expect(isFleetReady(state, rules)).toBe(false);
  });

  it("places the selected ship at the bow cell and selects the next one in the dock", () => {
    const result = placeAt(initialDeploy(rules), { col: 0, row: 0 }, rules);
    expect(result.check).toEqual({ ok: true });
    expect(result.state.placed).toEqual([
      { shipId: "carrier", bow: { col: 0, row: 0 }, orientation: "h" },
    ]);
    expect(result.state.selected).toBe("battleship");
  });

  it("rotates the selected ship", () => {
    const rotated = rotate(initialDeploy(rules));
    expect(rotated.orientation).toBe("v");
    const result = placeAt(rotated, { col: 0, row: 0 }, rules);
    expect(result.state.placed[0]?.orientation).toBe("v");
  });

  it("refuses an invalid position and explains why", () => {
    const first = placeAt(initialDeploy(rules), { col: 0, row: 0 }, rules).state;
    const touching = placeAt(first, { col: 0, row: 1 }, rules);
    expect(touching.check).toEqual({ ok: false, reason: "contact" });
    expect(touching.state).toEqual(first);
    const outside = placeAt(first, { col: 8, row: 5 }, rules);
    expect(outside.check).toEqual({ ok: false, reason: "out_of_bounds" });
  });

  it("previews the ghost cells and their validity", () => {
    const state = initialDeploy(rules);
    const ok = preview(state, { col: 2, row: 3 }, rules);
    expect(ok?.check).toEqual({ ok: true });
    expect(ok?.cells).toHaveLength(5);
    const bad = preview(state, { col: 8, row: 3 }, rules);
    expect(bad?.check).toEqual({ ok: false, reason: "out_of_bounds" });
    expect(bad?.cells).toHaveLength(2);
  });

  it("lifts a placed ship back to the dock when it is selected again", () => {
    const placed = placeAt(initialDeploy(rules), { col: 0, row: 0 }, rules).state;
    const lifted = select(placed, "carrier");
    expect(lifted.placed).toEqual([]);
    expect(lifted.selected).toBe("carrier");
    expect(lifted.orientation).toBe("h");
  });

  it("returns a ship to the dock", () => {
    const placed = placeAt(initialDeploy(rules), { col: 0, row: 0 }, rules).state;
    expect(returnToDock(placed, "carrier").placed).toEqual([]);
  });

  it("deploys a full valid fleet at random and resets it", () => {
    const random = randomize(rules, createRng(4));
    expect(validateFleet(random.placed, rules)).toEqual({ ok: true });
    expect(isFleetReady(random, rules)).toBe(true);
    expect(reset(rules)).toEqual(initialDeploy(rules));
  });
});
