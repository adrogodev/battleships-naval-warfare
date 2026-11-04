import { describe, expect, it } from "vitest";
import { createRng, randomInt } from "./rng";

describe("createRng", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("stays within [0, 1) and differs between seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    const values = Array.from({ length: 1000 }, () => a());
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(a()).not.toBe(b());
  });

  it("randomInt covers the whole range", () => {
    const rng = createRng(3);
    const seen = new Set(Array.from({ length: 500 }, () => randomInt(rng, 10)));
    expect([...seen].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
