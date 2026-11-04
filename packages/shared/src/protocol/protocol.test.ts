import { describe, expect, it } from "vitest";
import { createRng } from "../random/rng";
import {
  clientSchemas,
  generateRoomCode,
  isValidRoomCode,
  normalizeAlias,
  ROOM_CODE_ALPHABET,
} from "./protocol";

describe("room codes", () => {
  it("are 6 characters from an alphabet without ambiguous O/0/I/1", () => {
    for (const char of "O0I1") expect(ROOM_CODE_ALPHABET).not.toContain(char);
    const rng = createRng(3);
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode(rng);
      expect(code).toMatch(/^[A-Z2-9]{6}$/);
      expect(isValidRoomCode(code)).toBe(true);
    }
  });

  it("accepts lower case input and rejects ambiguous or malformed codes", () => {
    expect(isValidRoomCode("abcdef")).toBe(false);
    expect(clientSchemas["room:join"].safeParse({ code: "ab2c3d", alias: "Ana" }).success).toBe(
      true,
    );
    expect(isValidRoomCode("ABC0EF")).toBe(false);
    expect(isValidRoomCode("ABCDE")).toBe(false);
  });
});

describe("aliases", () => {
  it("trims, collapses spaces and accepts letters, digits, spaces, _ and -", () => {
    expect(normalizeAlias("  Capitán   Nemo  ")).toEqual({ ok: true, alias: "Capitán Nemo" });
    expect(normalizeAlias("Ana_2-B")).toEqual({ ok: true, alias: "Ana_2-B" });
  });

  it("rejects too short, too long or invalid characters", () => {
    expect(normalizeAlias("A")).toEqual({ ok: false, reason: "too_short" });
    expect(normalizeAlias("A".repeat(17))).toEqual({ ok: false, reason: "too_long" });
    expect(normalizeAlias("<script>")).toEqual({ ok: false, reason: "invalid_chars" });
  });
});

describe("client message schemas", () => {
  it("accept well-formed intents", () => {
    expect(
      clientSchemas["shot:fire"].safeParse({ actionId: "a1b2c3d4", coord: { col: 2, row: 6 } })
        .success,
    ).toBe(true);
    expect(clientSchemas["room:create"].safeParse({ alias: "Ana", turnTimerSec: 30 }).success).toBe(
      true,
    );
  });

  it("reject malformed payloads", () => {
    expect(
      clientSchemas["shot:fire"].safeParse({ actionId: "x", coord: { col: "a" } }).success,
    ).toBe(false);
    expect(clientSchemas["shot:fire"].safeParse({ coord: { col: 1, row: 1 } }).success).toBe(false);
    expect(clientSchemas["room:create"].safeParse({ alias: "Ana", turnTimerSec: 5 }).success).toBe(
      false,
    );
  });

  it("strip fields a client must never send (results, victory, rival data)", () => {
    const parsed = clientSchemas["shot:fire"].parse({
      actionId: "a1b2c3d4",
      coord: { col: 1, row: 1 },
      result: "hit",
      winner: 0,
    });
    expect(parsed).toEqual({ actionId: "a1b2c3d4", coord: { col: 1, row: 1 } });
  });
});
