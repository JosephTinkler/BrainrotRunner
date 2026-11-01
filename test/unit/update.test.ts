import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../webview/game/config';
import { update, startRun, togglePause } from '../../webview/game/update';
import { createInitialState } from '../../webview/game/state';
import type { GameState, InputAction, Lane } from '../../webview/game/types';

const DT = CONFIG.FIXED_DT;
const LOOK_AHEAD = 15; // the bot reacts to obstacles this close in its own lane
const CHOICE_AHEAD = 30; // and prefers lanes that stay clear this far ahead
const EVADE_AHEAD = 6; // and jumps or slides an obstacle this close when it cannot change lane
const STEP_AHEAD = 8; // a lane it steps through must be clear this far ahead (oncoming trains close fast)

function runFrames(
  state: GameState,
  frames: number,
  actionsAt: (i: number) => InputAction[] = () => [],
) {
  let s = state;
  for (let i = 0; i < frames && s.phase === 'running'; i++) {
    s = update(s, actionsAt(i), DT);
  }
  return s;
}

/** True if the lane has an obstacle within `ahead` units ahead of (or overlapping) the player. */
function laneBlocked(state: GameState, lane: Lane, ahead: number): boolean {
  return state.obstacles.some((o) => {
    if (o.lane !== lane) return false;
    const half = o.depth / 2;
    return o.z + half > -CONFIG.PLAYER_HALF_DEPTH && o.z - half < ahead;
  });
}

/** Jumps a low fence or slides under a high bar in the current lane when no lane change works. */
function evade(state: GameState): InputAction[] {
  const here = state.obstacles.filter((o) => {
    if (o.lane !== state.player.lane) return false;
    return o.z + o.depth / 2 > -CONFIG.PLAYER_HALF_DEPTH && o.z - o.depth / 2 < EVADE_AHEAD;
  });
  if (here.length !== 1) return [];
  if (here[0].kind === 'low') return ['jump'];
  if (here[0].kind === 'high') return ['slide'];
  return [];
}

/**
 * Simple bot: if the committed lane has an obstacle within LOOK_AHEAD, step towards the nearest
 * lane that is clear for the longer CHOICE_AHEAD horizon (falling back to the short one). It keeps
 * requesting the move while a tween is running; the engine buffers it until the tween finishes.
 */
function botActions(state: GameState): InputAction[] {
  const cur = state.player.lane;
  if (!laneBlocked(state, cur, LOOK_AHEAD)) return [];
  const byDistance = (a: Lane, b: Lane) => Math.abs(a - cur) - Math.abs(b - cur);
  let lanes = CONFIG.LANES.filter((l) => !laneBlocked(state, l, CHOICE_AHEAD)).sort(byDistance);
  if (lanes.length === 0) {
    lanes = CONFIG.LANES.filter((l) => !laneBlocked(state, l, LOOK_AHEAD)).sort(byDistance);
  }
  if (lanes.length === 0) return evade(state);
  // Lanes are changed one step at a time, so the lane in between must be passable right now.
  // Trains are long, so a neighbour lane can still be occupied by a train that has passed.
  const step = (lanes[0] < cur ? cur - 1 : cur + 1) as Lane;
  if (laneBlocked(state, step, STEP_AHEAD)) return evade(state);
  return [lanes[0] < cur ? 'left' : 'right'];
}

describe('update purity and determinism', () => {
  it('never mutates the input state', () => {
    const state: GameState = {
      ...createInitialState(7, 'running'),
      coinsList: [{ id: 900, lane: 0, z: 0.1, y: 0, collected: false }],
      obstacles: [{ id: 901, kind: 'block', lane: 1, z: 40, depth: 1.4 }],
      nextId: 1000,
    };
    const snapshot = JSON.parse(JSON.stringify(state)) as GameState;
    const next = update(state, ['left', 'jump'], DT);
    expect(state).toEqual(snapshot);
    expect(next).not.toBe(state);
  });

  it('same seed and same actions produce identical states', () => {
    const script = (i: number): InputAction[] => {
      if (i === 100) return ['jump'];
      if (i === 300) return ['left'];
      if (i === 450) return ['slide'];
      if (i === 700) return ['right'];
      return [];
    };
    const a = runFrames(startRun(2024), 3000, script);
    const b = runFrames(startRun(2024), 3000, script);
    expect(a).toEqual(b);
    expect(a.time).toBeGreaterThan(0);
  });
});

describe('update running behaviour', () => {
  it('accumulates time and distance while running', () => {
    const s0 = createInitialState(3, 'running');
    const s1 = runFrames(s0, 120);
    expect(s1.time).toBeCloseTo(1, 6);
    // One second at speed between BASE_SPEED and MAX_SPEED.
    expect(s1.distance).toBeGreaterThanOrEqual(CONFIG.BASE_SPEED * 0.99);
    expect(s1.distance).toBeLessThanOrEqual(CONFIG.MAX_SPEED);
  });

  it('does nothing when paused, on the title screen, or at game over', () => {
    for (const phase of ['title', 'paused', 'gameover'] as const) {
      const s = createInitialState(1, phase);
      expect(update(s, ['jump'], DT)).toEqual(s);
    }
  });

  it('steps the multiplier at 30 s', () => {
    const s: GameState = { ...createInitialState(1, 'running'), time: 29.99 };
    const next = update(s, [], 0.02);
    expect(next.multiplier).toBe(2);
  });

  it('collecting a coin adds COIN_VALUE to the score', () => {
    const s: GameState = {
      ...createInitialState(1, 'running'),
      coinsList: [{ id: 500, lane: 0, z: 0.1, y: 0, collected: false }],
      nextId: 1000,
    };
    const next = update(s, [], DT);
    expect(next.coins).toBe(1);
    expect(next.score).toBe(Math.floor(next.distanceScore) + CONFIG.COIN_VALUE);
    expect(next.score - Math.floor(next.distanceScore)).toBe(CONFIG.COIN_VALUE);
    expect(next.coinsList.some((c) => c.id === 500)).toBe(false);
  });

  it('a collision ends the run: running -> crashed -> gameover', () => {
    const s: GameState = {
      ...createInitialState(1, 'running'),
      obstacles: [{ id: 999, kind: 'block', lane: 0, z: 0.2, depth: 1.4 }],
      nextId: 1000,
    };
    const crashed = update(s, [], DT);
    expect(crashed.phase).toBe('crashed');
    expect(crashed.crashT).toBe(0);

    const stillCrashed = update(crashed, [], 0.5);
    expect(stillCrashed.phase).toBe('crashed');

    const over = update(stillCrashed, [], 0.31);
    expect(over.phase).toBe('gameover');
  });

  it('keeps a train whose tail is still on screen and removes it once the tail passes', () => {
    const train = { id: 998, kind: 'block' as const, lane: 1 as const, depth: 10 };
    const base = createInitialState(1, 'running');
    // Centre is past DESPAWN_Z but the tail (z + 5) is not.
    const kept = update(
      { ...base, obstacles: [{ ...train, z: CONFIG.DESPAWN_Z - 2 }], nextId: 1000 },
      [],
      DT,
    );
    expect(kept.obstacles.some((o) => o.id === 998)).toBe(true);
    // Tail is past DESPAWN_Z.
    const gone = update(
      { ...base, obstacles: [{ ...train, z: CONFIG.DESPAWN_Z - 6 }], nextId: 1000 },
      [],
      DT,
    );
    expect(gone.obstacles.some((o) => o.id === 998)).toBe(false);
  });

  it('a run with no input crashes within 60 s', () => {
    const end = runFrames(startRun(1), Math.round(60 / DT));
    expect(end.phase).not.toBe('running');
  });

  it('the bot survives 120 s on several seeds (proves passability in play)', () => {
    const frames = Math.round(120 / DT);
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      let s = startRun(seed);
      for (let i = 0; i < frames && s.phase === 'running'; i++) {
        s = update(s, botActions(s), DT);
      }
      expect(s.phase, `seed ${seed}`).toBe('running');
      expect(s.time).toBeGreaterThanOrEqual(120 - DT);
    }
  });

  it('togglePause switches running and paused and ignores other phases', () => {
    const running = startRun(1);
    const paused = togglePause(running);
    expect(paused.phase).toBe('paused');
    expect(togglePause(paused).phase).toBe('running');
    const title = createInitialState(1, 'title');
    expect(togglePause(title)).toBe(title);
  });
});
