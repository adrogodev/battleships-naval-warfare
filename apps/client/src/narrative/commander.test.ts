import { DIFFICULTIES } from "@battleships/shared";
import { describe, expect, it } from "vitest";
import {
  COMMANDER_MOMENTS,
  commanderComment,
  commanderLines,
  commanderMomentAfterSink,
} from "./commander";

describe("commander comments", () => {
  it("has at least two lines for every difficulty and key moment", () => {
    for (const difficulty of DIFFICULTIES) {
      for (const moment of COMMANDER_MOMENTS) {
        const lines = commanderLines(difficulty, moment);
        expect(lines.length, `${difficulty}/${moment}`).toBeGreaterThanOrEqual(2);
        for (const line of lines) expect(line.trim()).not.toBe("");
      }
    }
  });

  it("varies between consecutive variants and wraps deterministically", () => {
    for (const difficulty of DIFFICULTIES) {
      for (const moment of COMMANDER_MOMENTS) {
        const count = commanderLines(difficulty, moment).length;
        expect(commanderComment(difficulty, moment, 0)).not.toBe(
          commanderComment(difficulty, moment, 1),
        );
        expect(commanderComment(difficulty, moment, count)).toBe(
          commanderComment(difficulty, moment, 0),
        );
      }
    }
  });

  it("gives each commander a voice of their own", () => {
    for (const moment of COMMANDER_MOMENTS) {
      const easy = new Set(commanderLines("easy", moment));
      for (const line of commanderLines("hard", moment)) expect(easy.has(line)).toBe(false);
    }
  });

  it("accepts negative or fractional variants without failing", () => {
    expect(commanderComment("normal", "battleStart", -3)).not.toBe("");
    expect(commanderComment("normal", "battleStart", 2.7)).not.toBe("");
  });

  it("picks the moment that follows a sinking", () => {
    // Player (seat 0) sank an AI ship; the AI still has several afloat.
    expect(commanderMomentAfterSink(0, 3)).toBe("playerSinks");
    expect(commanderMomentAfterSink(0, 1)).toBe("aiLastShip");
    expect(commanderMomentAfterSink(1, 2)).toBe("aiSinks");
    expect(commanderMomentAfterSink(1, 1)).toBe("playerLastShip");
    // The last sinking is the finale: covered by the win/defeat lines.
    expect(commanderMomentAfterSink(0, 0)).toBeNull();
    expect(commanderMomentAfterSink(1, 0)).toBeNull();
  });
});
