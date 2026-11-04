import { createRng } from "@battleships/shared";
import { describe, expect, it } from "vitest";
import type { LogEntry } from "../adapters/localAiGame";
import { commsLine, OPERATION_ADJECTIVES, OPERATION_NOUNS, operationName } from "./narrative";

const entry = (id: number, seat: 0 | 1, result: LogEntry["result"]): LogEntry =>
  result === "sunk"
    ? { id, seat, coord: { col: 2, row: 6 }, result, shipId: "battleship" }
    : { id, seat, coord: { col: 2, row: 6 }, result };

describe("operationName", () => {
  it("is reproducible for a seed and reads 'Operación <noun> <adjective>'", () => {
    const name = operationName(createRng(5));
    expect(name).toBe(operationName(createRng(5)));
    expect(name).toMatch(/^Operación \S+ \S+$/);
  });

  it("matches the adjective to the gender of the noun", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const [, noun, adjective] = operationName(createRng(seed)).split(" ");
      const gender = OPERATION_NOUNS.find((n) => n.word === noun)?.gender;
      const forms = OPERATION_ADJECTIVES.find((a) => a.m === adjective || a.f === adjective);
      expect(gender).toBeDefined();
      expect(gender === "f" ? forms?.f : forms?.m).toBe(adjective);
    }
  });
});

describe("commsLine", () => {
  it("always mentions the coordinate, and the ship when one is sunk", () => {
    for (let id = 0; id < 12; id++) {
      expect(commsLine(entry(id, 0, "miss"))).toContain("C-7");
      expect(commsLine(entry(id, 1, "hit"))).toContain("C-7");
      expect(commsLine(entry(id, 0, "sunk")).toLowerCase()).toContain("acorazado");
    }
  });

  it("varies the wording between consecutive events of the same kind", () => {
    const lines = new Set([0, 1, 2, 3].map((id) => commsLine(entry(id, 0, "miss"))));
    expect(lines.size).toBeGreaterThan(1);
    expect(commsLine(entry(0, 0, "miss"))).not.toBe(commsLine(entry(1, 0, "miss")));
  });
});
