import { describe, expect, it } from "vitest";
import { createFakeContext } from "../testing/fakes";
import { MAX_PARTICLE_LIFE_MS, type Particle, ParticlePool } from "./ParticlePool";

/** Deterministic pseudo-random source so tests do not depend on Math.random. */
function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe("ParticlePool", () => {
  it("defaults to a capacity of 150", () => {
    expect(new ParticlePool().capacity).toBe(150);
  });

  it("starts empty and counts live particles after a spawn", () => {
    const pool = new ParticlePool(150, { random: seeded() });
    expect(pool.liveCount).toBe(0);
    pool.spawn("splash", 10, 10, 12);
    expect(pool.liveCount).toBe(12);
  });

  it("never exceeds its capacity even after 1000 spawns", () => {
    const pool = new ParticlePool(150, { random: seeded() });
    for (let i = 0; i < 1000; i++) {
      pool.spawn(i % 2 === 0 ? "explosion" : "debris", i, i);
      expect(pool.liveCount).toBeLessThanOrEqual(150);
    }
    expect(pool.liveCount).toBe(150);
    expect(pool.particles.length).toBe(150);
  });

  it("reuses the same preallocated particle objects", () => {
    const pool = new ParticlePool(20, { random: seeded() });
    const before = new Set<Particle>(pool.particles);
    for (let i = 0; i < 50; i++) {
      pool.spawn("smoke", 0, 0, 7);
      pool.update(30);
    }
    const after = new Set<Particle>(pool.particles);
    expect(after).toEqual(before);
    for (const p of pool.particles) expect(before.has(p)).toBe(true);
  });

  it("recycles the oldest live particle when full", () => {
    const pool = new ParticlePool(4, { random: seeded() });
    pool.spawn("debris", 0, 0, 4);
    pool.update(10);
    pool.spawn("splash", 500, 500, 1);
    const youngest = pool.particles.filter((p) => p.alive && p.age === 0);
    expect(youngest).toHaveLength(1);
    expect(youngest[0]?.kind).toBe("splash");
    expect(pool.liveCount).toBe(4);
  });

  it("kills particles once their lifetime is over", () => {
    const pool = new ParticlePool(150, { random: seeded() });
    pool.spawn("explosion", 0, 0, 20);
    pool.spawn("smoke", 0, 0, 5);
    pool.spawn("splash", 0, 0, 5);
    pool.spawn("debris", 0, 0, 5);
    pool.update(16);
    expect(pool.liveCount).toBe(35);
    pool.update(MAX_PARTICLE_LIFE_MS);
    expect(pool.liveCount).toBe(0);
    expect(pool.particles.every((p) => !p.alive)).toBe(true);
  });

  it("uses a sensible default count per kind", () => {
    const pool = new ParticlePool(150, { random: seeded() });
    pool.spawn("explosion", 0, 0);
    expect(pool.liveCount).toBeGreaterThan(5);
  });

  it("draws only live particles and leaves the context composite reset", () => {
    const pool = new ParticlePool(150, { random: seeded() });
    const { ctx, calls } = createFakeContext();
    pool.draw(ctx);
    expect(calls.filter((c) => c === "fill" || c === "stroke")).toHaveLength(0);
    pool.spawn("explosion", 50, 50, 6);
    pool.spawn("splash", 50, 50, 3);
    pool.draw(ctx);
    expect(calls.filter((c) => c === "fill" || c === "stroke").length).toBeGreaterThanOrEqual(9);
    expect(ctx.globalCompositeOperation).toBe("source-over");
    expect(ctx.globalAlpha).toBe(1);
  });

  it("clear kills every particle", () => {
    const pool = new ParticlePool(150, { random: seeded() });
    pool.spawn("smoke", 0, 0, 10);
    pool.clear();
    expect(pool.liveCount).toBe(0);
  });
});
