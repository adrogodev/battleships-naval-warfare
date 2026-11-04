/** Deterministic random source in [0, 1). The domain never calls Math.random directly. */
export type Rng = () => number;

/** Mulberry32: small, fast, seedable PRNG. Good enough for gameplay, not for cryptography. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pickOne called with an empty list");
  return items[randomInt(rng, items.length)] as T;
}
