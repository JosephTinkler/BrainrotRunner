import { CONFIG } from './config';
import { nextRandom, pick, randInt, type Rng } from './rng';
import type { Lane, ObstacleKind } from './types';

export interface Row {
  obstacles: { kind: ObstacleKind; lane: Lane; depth: number }[];
  coins: { lane: Lane; y: number; dz: number }[];
}

export type Pattern = (rng: Rng) => Row;

const LANES: readonly Lane[] = CONFIG.LANES;

const DEPTH: Record<ObstacleKind, number> = {
  low: 1.0,
  high: 1.0,
  block: 1.4,
  moving: 1.4,
};

const T1_KINDS: readonly ObstacleKind[] = ['low', 'high', 'block'];
const T3_KINDS: readonly ObstacleKind[] = ['low', 'high', 'block', 'moving'];

/** Lanes in random order (Fisher-Yates driven by rng). */
function shuffledLanes(rng: Rng): Lane[] {
  const a: Lane[] = [...LANES];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Heights of a jump arc sampled at 5 points, used for coins arcing over a low fence. */
function arcHeight(u: number): number {
  return 4 * CONFIG.JUMP_HEIGHT * u * (1 - u);
}

/**
 * Builds a row from obstacle placements (at most one obstacle per lane) and maybe adds coins:
 * a line in an empty lane, or an arc over a low fence.
 */
function rowOf(rng: Rng, placements: { lane: Lane; kind: ObstacleKind }[]): Row {
  const obstacles = placements.map((p) => ({ kind: p.kind, lane: p.lane, depth: DEPTH[p.kind] }));
  const coins: Row['coins'] = [];

  const occupied = new Set<Lane>(placements.map((p) => p.lane));
  const empty = LANES.filter((l) => !occupied.has(l));
  const roll = rng();

  if (empty.length > 0 && roll < 0.6) {
    const lane = pick(rng, empty);
    const count = randInt(rng, 3, 5);
    for (let i = 0; i < count; i++) coins.push({ lane, y: 0, dz: i * 2 });
  } else {
    const low = placements.find((p) => p.kind === 'low');
    if (low && roll < 0.85) {
      // Five coins arcing over the fence, centred on the obstacle.
      for (let i = 0; i < 5; i++) {
        const u = (i + 0.5) / 5;
        coins.push({ lane: low.lane, y: arcHeight(u), dz: (i - 2) * 1.5 });
      }
    }
  }

  return { obstacles, coins };
}

const single = (rng: Rng): Row => {
  const [lane] = shuffledLanes(rng);
  return rowOf(rng, [{ lane, kind: pick(rng, T1_KINDS) }]);
};

const lowFence = (rng: Rng): Row => {
  const [lane] = shuffledLanes(rng);
  return rowOf(rng, [{ lane, kind: 'low' }]);
};

const pairAny =
  (kinds: readonly ObstacleKind[]) =>
  (rng: Rng): Row => {
    const [a, b] = shuffledLanes(rng);
    return rowOf(rng, [
      { lane: a, kind: pick(rng, kinds) },
      { lane: b, kind: pick(rng, kinds) },
    ]);
  };

const twoLows = (rng: Rng): Row => {
  const [a, b] = shuffledLanes(rng);
  return rowOf(rng, [
    { lane: a, kind: 'low' },
    { lane: b, kind: 'low' },
  ]);
};

const sigmaCart = (rng: Rng): Row => {
  const [lane] = shuffledLanes(rng);
  return rowOf(rng, [{ lane, kind: 'moving' }]);
};

const cartWithOther = (rng: Rng): Row => {
  const [a, b] = shuffledLanes(rng);
  return rowOf(rng, [
    { lane: a, kind: 'moving' },
    { lane: b, kind: pick(rng, T1_KINDS) },
  ]);
};

/**
 * Pre-authored chunks per tier. Every chunk uses at most two obstacle lanes, so the third lane
 * is always empty, which keeps every row passable.
 */
export const PATTERNS: Record<1 | 2 | 3, Pattern[]> = {
  1: [single, lowFence],
  2: [pairAny(T1_KINDS), twoLows],
  3: [pairAny(T3_KINDS), sigmaCart, cartWithOther],
};

const MAX_REROLLS = 20;

/**
 * Generates one row for the tier. Returns the row and the advanced rng state.
 * If `accept` is given, patterns are re-rolled until it returns true. The fallback is a single
 * non-moving obstacle, which is always accepted by the update loop's cart rule.
 */
export function generateRow(
  rngState: number,
  tier: 1 | 2 | 3,
  accept?: (row: Row) => boolean,
): { row: Row; rngState: number } {
  let s = rngState;
  const rng: Rng = () => {
    const [value, next] = nextRandom(s);
    s = next;
    return value;
  };
  for (let attempt = 0; attempt < MAX_REROLLS; attempt++) {
    const row = pick(rng, PATTERNS[tier])(rng);
    if (!accept || accept(row)) return { row, rngState: s };
  }
  return { row: PATTERNS[1][0](rng), rngState: s };
}

/**
 * A row is passable if at least one lane is clear of block/moving obstacles and has either no
 * obstacle or a single low/high obstacle (which can be jumped or slid under).
 */
export function isPassable(row: Row): boolean {
  return LANES.some((lane) => {
    const here = row.obstacles.filter((o) => o.lane === lane);
    if (here.length === 0) return true;
    if (here.length > 1) return false;
    return here[0].kind === 'low' || here[0].kind === 'high';
  });
}
