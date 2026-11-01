import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../webview/game/config';
import { rowGap } from '../../webview/game/difficulty';
import { generateRow, isPassable, type Row } from '../../webview/game/spawner';

const SEEDS = 1000;
const TIERS = [1, 2, 3] as const;

function rowsFor(tier: 1 | 2 | 3, seed: number, count = 5): Row[] {
  const rows: Row[] = [];
  let state = seed;
  for (let i = 0; i < count; i++) {
    const r = generateRow(state, tier);
    rows.push(r.row);
    state = r.rngState;
  }
  return rows;
}

describe('generateRow', () => {
  it('is deterministic for the same state and tier', () => {
    expect(generateRow(123, 3)).toEqual(generateRow(123, 3));
  });

  it('advances the rng state', () => {
    expect(generateRow(123, 2).rngState).not.toBe(123);
  });

  it('keeps at least one passable lane for 1000 seeds across all tiers', () => {
    for (const tier of TIERS) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        for (const row of rowsFor(tier, seed)) {
          expect(isPassable(row)).toBe(true);
        }
      }
    }
  });

  it('keeps obstacles within the per-tier limits', () => {
    for (const seed of [1, 2, 3, 42, 999]) {
      for (const row of rowsFor(1, seed, 20)) {
        expect(row.obstacles).toHaveLength(1);
        expect(row.obstacles[0].kind).not.toBe('moving');
      }
      for (const row of rowsFor(2, seed, 20)) {
        expect(row.obstacles.length).toBeGreaterThanOrEqual(1);
        expect(row.obstacles.length).toBeLessThanOrEqual(2);
        expect(row.obstacles.every((o) => o.kind !== 'moving')).toBe(true);
      }
      for (const row of rowsFor(3, seed, 20)) {
        expect(row.obstacles.length).toBeGreaterThanOrEqual(1);
        expect(row.obstacles.length).toBeLessThanOrEqual(2);
      }
    }
  });

  it('never places obstacles in the same lane twice within a row', () => {
    for (const tier of TIERS) {
      for (let seed = 1; seed <= 200; seed++) {
        for (const row of rowsFor(tier, seed)) {
          const lanes = row.obstacles.map((o) => o.lane);
          expect(new Set(lanes).size).toBe(lanes.length);
        }
      }
    }
  });

  it('re-rolls until the accept predicate passes, falling back to a single non-moving obstacle', () => {
    const rejectAll = () => false;
    for (let seed = 1; seed <= 50; seed++) {
      const { row } = generateRow(seed, 3, rejectAll);
      expect(row.obstacles).toHaveLength(1);
      expect(row.obstacles[0].kind).not.toBe('moving');
    }
  });

  it('only uses lanes from CONFIG.LANES', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const row of rowsFor(3, seed)) {
        for (const o of row.obstacles) expect(CONFIG.LANES).toContain(o.lane);
        for (const c of row.coins) expect(CONFIG.LANES).toContain(c.lane);
      }
    }
  });

  it('produces moving obstacles in tier 3', () => {
    let sawMoving = false;
    for (let seed = 1; seed <= 200 && !sawMoving; seed++) {
      sawMoving = rowsFor(3, seed).some((r) => r.obstacles.some((o) => o.kind === 'moving'));
    }
    expect(sawMoving).toBe(true);
  });
});

describe('train depths', () => {
  it('parked trains are 10 deep and oncoming trains 8 deep, other kinds stay short', () => {
    const depths: Record<string, Set<number>> = {};
    for (const tier of TIERS) {
      for (let seed = 1; seed <= 200; seed++) {
        for (const row of rowsFor(tier, seed)) {
          for (const o of row.obstacles) (depths[o.kind] ??= new Set()).add(o.depth);
        }
      }
    }
    expect([...depths.block]).toEqual([10]);
    expect([...depths.moving]).toEqual([8]);
    expect([...depths.low]).toEqual([1]);
    expect([...depths.high]).toEqual([1]);
  });
});

describe('rowGap floor', () => {
  it('is at least speed * MIN_GAP_TIME for speeds 0..MAX', () => {
    for (let s = 0; s <= CONFIG.MAX_SPEED; s += 0.1) {
      expect(rowGap(s)).toBeGreaterThanOrEqual(s * CONFIG.MIN_GAP_TIME);
    }
  });
});

describe('isPassable', () => {
  it('fails when every lane is blocked', () => {
    const row: Row = {
      obstacles: [
        { kind: 'block', lane: -1, depth: 1 },
        { kind: 'block', lane: 0, depth: 1 },
        { kind: 'block', lane: 1, depth: 1 },
      ],
      coins: [],
    };
    expect(isPassable(row)).toBe(false);
  });

  it('passes when one lane is empty', () => {
    const row: Row = {
      obstacles: [
        { kind: 'block', lane: -1, depth: 1 },
        { kind: 'moving', lane: 0, depth: 1 },
      ],
      coins: [],
    };
    expect(isPassable(row)).toBe(true);
  });

  it('passes when the only free lane is a low fence', () => {
    const row: Row = {
      obstacles: [
        { kind: 'block', lane: -1, depth: 1 },
        { kind: 'block', lane: 0, depth: 1 },
        { kind: 'low', lane: 1, depth: 1 },
      ],
      coins: [],
    };
    expect(isPassable(row)).toBe(true);
  });
});
