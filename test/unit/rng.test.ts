import { describe, expect, it } from 'vitest';
import { createRng, nextRandom, pick, randInt } from '../../webview/game/rng';

describe('rng', () => {
  it('produces identical sequences for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 500; i++) expect(a()).toBe(b());
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const av = Array.from({ length: 10 }, () => a());
    const bv = Array.from({ length: 10 }, () => b());
    expect(av).not.toEqual(bv);
  });

  it('returns values in [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextRandom matches createRng step by step', () => {
    const seed = 99;
    const r = createRng(seed);
    let s = seed | 0;
    for (let i = 0; i < 100; i++) {
      const [value, next] = nextRandom(s);
      expect(r()).toBe(value);
      s = next;
    }
  });

  it('randInt stays within inclusive bounds and hits both ends', () => {
    const r = createRng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = randInt(r, 3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });

  it('pick is deterministic and returns an element of the array', () => {
    const arr = ['a', 'b', 'c'] as const;
    const x = createRng(11);
    const y = createRng(11);
    for (let i = 0; i < 100; i++) {
      const v = pick(x, arr);
      expect(arr).toContain(v);
      expect(pick(y, arr)).toBe(v);
    }
  });
});
