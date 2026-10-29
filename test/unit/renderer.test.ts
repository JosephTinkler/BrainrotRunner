import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../webview/game/state';
import { startRun, update } from '../../webview/game/update';
import type { GameState, Obstacle, ObstacleKind, Phase } from '../../webview/game/types';
import { render, type RenderOptions } from '../../webview/render/renderer';

/**
 * Permissive stand-in for CanvasRenderingContext2D: any method call or property access works,
 * property writes are stored, and every call returns another dummy (so gradients, paths and
 * measureText results can be chained without special cases).
 */
function makeDummy(store: Map<PropertyKey, unknown> = new Map()): CanvasRenderingContext2D {
  const target = (): unknown => undefined;
  const proxy = new Proxy(target, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      if (store.has(prop)) return store.get(prop);
      return makeDummy();
    },
    set(_t, prop, value) {
      store.set(prop, value);
      return true;
    },
    apply() {
      return makeDummy();
    },
  });
  return proxy as unknown as CanvasRenderingContext2D;
}

const KINDS: ObstacleKind[] = ['low', 'high', 'block', 'moving'];

function withContent(base: GameState, phase: Phase): GameState {
  const obstacles: Obstacle[] = KINDS.map((kind, i) => ({
    id: 100 + i,
    kind,
    lane: ((i % 3) - 1) as -1 | 0 | 1,
    z: 10 + i * 12,
    depth: 1.2,
  }));
  // Obstacles that have already passed the player and one far beyond the spawn distance.
  obstacles.push({ id: 200, kind: 'block', lane: 1, z: -2, depth: 1.4 });
  obstacles.push({ id: 201, kind: 'low', lane: -1, z: 500, depth: 1 });
  const coins = [
    { id: 300, lane: 0 as const, z: 8, y: 0, collected: false },
    { id: 301, lane: -1 as const, z: 4, y: 1.2, collected: false },
    { id: 302, lane: 1 as const, z: -1, y: 0, collected: true },
  ];
  return {
    ...base,
    phase,
    distance: 123.4,
    score: 4321,
    coins: 17,
    multiplier: 3,
    speed: 30,
    obstacles,
    coinsList: coins,
    crashT: phase === 'crashed' ? 0.2 : 0,
  };
}

const opts = (overrides: Partial<RenderOptions> = {}): RenderOptions => ({
  width: 960,
  height: 540,
  dpr: 2,
  reducedMotion: false,
  best: 9000,
  realTime: 3.7,
  ...overrides,
});

describe('render (smoke)', () => {
  it('renders the title screen without throwing', () => {
    const state = createInitialState(7, 'title');
    expect(() => render(makeDummy(), state, opts())).not.toThrow();
  });

  it('renders a running state with obstacles of every kind and coins', () => {
    const state = withContent(startRun(42), 'running');
    expect(() => render(makeDummy(), state, opts())).not.toThrow();
  });

  it('renders the crashed phase with and without reduced motion', () => {
    const state = withContent(startRun(42), 'crashed');
    expect(() => render(makeDummy(), state, opts())).not.toThrow();
    expect(() => render(makeDummy(), state, opts({ reducedMotion: true }))).not.toThrow();
  });

  it('renders paused and game over phases', () => {
    expect(() => render(makeDummy(), withContent(startRun(1), 'paused'), opts())).not.toThrow();
    expect(() => render(makeDummy(), withContent(startRun(1), 'gameover'), opts())).not.toThrow();
  });

  it('survives a long simulated run, including the crash transition', () => {
    let state = startRun(99);
    for (let i = 0; i < 60 * 120; i++) {
      state = update(state, i % 90 === 0 ? ['jump'] : [], 1 / 120);
      if (state.phase === 'gameover') break;
    }
    const ctx = makeDummy();
    expect(() => render(ctx, state, opts())).not.toThrow();
    expect(() => render(ctx, { ...state, phase: 'crashed', crashT: 0.1 }, opts())).not.toThrow();
  });

  it('ignores a zero-sized viewport', () => {
    expect(() => render(makeDummy(), startRun(1), opts({ width: 0, height: 0 }))).not.toThrow();
  });
});
