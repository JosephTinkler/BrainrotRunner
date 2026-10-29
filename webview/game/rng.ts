// Seeded PRNG (mulberry32). The state is a plain int32 so it can live inside GameState.

/** Returns a value in [0, 1). */
export type Rng = () => number;

/** One mulberry32 step: returns [value in [0,1), nextState]. */
export function nextRandom(s: number): [number, number] {
  const a = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

export function createRng(seed: number): Rng {
  let s = seed | 0;
  return () => {
    const [value, next] = nextRandom(s);
    s = next;
    return value;
  };
}

/** Integer in [minInclusive, maxInclusive]. */
export function randInt(rng: Rng, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1));
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick: empty array');
  return arr[Math.floor(rng() * arr.length)];
}
