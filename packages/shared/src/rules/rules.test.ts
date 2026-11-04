import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, fleetCellCount, parseRules } from "./rules";

describe("GameRules", () => {
  it("defaults to the classic 10x10 board with 17 fleet cells and no-contact on", () => {
    expect(parseRules(DEFAULT_RULES)).toEqual(DEFAULT_RULES);
    expect(DEFAULT_RULES.boardSize).toBe(10);
    expect(fleetCellCount(DEFAULT_RULES)).toBe(17);
    expect(DEFAULT_RULES.noContact).toBe(true);
    expect(DEFAULT_RULES.extraTurnOnHit).toBe(false);
  });

  it("rejects duplicated ship ids", () => {
    const fleet = [
      { id: "destroyer", length: 2 },
      { id: "destroyer", length: 2 },
    ];
    expect(() => parseRules({ ...DEFAULT_RULES, fleet })).toThrow();
  });

  it("rejects a ship longer than the board", () => {
    const fleet = [{ id: "carrier", length: 7 }];
    expect(() => parseRules({ ...DEFAULT_RULES, boardSize: 6, fleet })).toThrow();
  });

  it("rejects malformed values", () => {
    expect(() => parseRules({ ...DEFAULT_RULES, boardSize: 3 })).toThrow();
    expect(() => parseRules({ ...DEFAULT_RULES, turnTimerSec: 5 })).toThrow();
    expect(() => parseRules({ ...DEFAULT_RULES, noContact: "yes" })).toThrow();
  });
});
