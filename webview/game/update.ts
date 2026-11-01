import { CONFIG } from './config';
import { hitsObstacle, collectsCoin } from './collision';
import { applyAction, stepPlayer } from './player';
import { speedAt, tierAt, rowGap, multiplierAt } from './difficulty';
import { generateRow, type Row } from './spawner';
import { createInitialState } from './state';
import type { GameState, InputAction, Lane, Obstacle } from './types';

const CRASH_DURATION = 0.8;

/** Lane sets of live rows with two or more stationary obstacles (grouped by z). */
function multiRowLanes(obstacles: readonly Obstacle[]): Lane[][] {
  const byZ = new Map<number, Lane[]>();
  for (const o of obstacles) {
    if (o.kind === 'moving') continue;
    const lanes = byZ.get(o.z);
    if (lanes) lanes.push(o.lane);
    else byZ.set(o.z, [o.lane]);
  }
  return [...byZ.values()].filter((lanes) => lanes.length >= 2);
}

/** Every moving obstacle in the row must sit in a lane shared by all live multi-obstacle rows. */
function cartLanesAllowed(row: Row, multi: Lane[][]): boolean {
  return row.obstacles
    .filter((o) => o.kind === 'moving')
    .every((cart) => multi.every((lanes) => lanes.includes(cart.lane)));
}

/**
 * Advances the game by dt seconds. Pure: the input state is never mutated.
 * Only the 'running' and 'crashed' phases advance; other phases return the state unchanged.
 */
export function update(state: GameState, actions: InputAction[], dt: number): GameState {
  if (state.phase === 'crashed') {
    const crashT = state.crashT + dt;
    return {
      ...state,
      crashT,
      phase: crashT >= CRASH_DURATION ? 'gameover' : 'crashed',
    };
  }
  if (state.phase !== 'running') return state;

  const time = state.time + dt;
  const speed = speedAt(time);
  const multiplier = multiplierAt(time);
  const distance = state.distance + speed * dt;
  const distanceScore = state.distanceScore + speed * dt * multiplier;

  // Input: retry the buffered action first, then apply new actions (which replace the buffer).
  let player = state.player;
  let pending = state.bufferedAction;
  if (pending) {
    const r = applyAction(player, pending.action);
    if (r) {
      player = r;
      pending = null;
    }
  }
  let freshPending = false;
  for (const a of actions) {
    const r = applyAction(player, a);
    if (r) {
      player = r;
      pending = null;
      freshPending = false;
    } else {
      pending = { action: a, age: 0 };
      freshPending = true;
    }
  }
  if (pending && !freshPending) {
    const age = pending.age + dt;
    pending = age > CONFIG.INPUT_BUFFER ? null : { action: pending.action, age };
  }

  player = stepPlayer(player, dt);

  // Move world objects towards the player.
  const obstacles = state.obstacles.map((o) => {
    const v = o.kind === 'moving' ? speed + CONFIG.MOVING_EXTRA_SPEED : speed;
    return { ...o, z: o.z - v * dt };
  });

  let coins = state.coins;
  const coinsList = state.coinsList
    .map((c) => ({ ...c, z: c.z - speed * dt }))
    .map((c) => {
      if (!c.collected && collectsCoin(player, c)) {
        coins += 1;
        return { ...c, collected: true };
      }
      return c;
    })
    .filter((c) => !c.collected && c.z >= CONFIG.DESPAWN_Z);

  // Long trains despawn by their tail so the back half does not vanish while still on screen.
  const allObstacles = obstacles.filter((o) => o.z + o.depth / 2 >= CONFIG.DESPAWN_Z);

  // Spawn rows that have come within SPAWN_DISTANCE.
  let rngState = state.rngState;
  let nextRowZ = state.nextRowZ;
  let nextId = state.nextId;
  const newCoins: typeof coinsList = [];
  while (distance + CONFIG.SPAWN_DISTANCE >= nextRowZ) {
    const z = nextRowZ - distance;
    // A Sigma Cart overtakes rows that are closer to the player, so its lane must be one that
    // every live two-obstacle row also uses. Otherwise the cart and that row could block all lanes.
    const gen = generateRow(rngState, tierAt(time), (row) =>
      cartLanesAllowed(row, multiRowLanes(allObstacles)),
    );
    rngState = gen.rngState;
    for (const o of gen.row.obstacles) {
      allObstacles.push({ id: nextId++, kind: o.kind, lane: o.lane, z, depth: o.depth });
    }
    for (const c of gen.row.coins) {
      newCoins.push({ id: nextId++, lane: c.lane, z: z + c.dz, y: c.y, collected: false });
    }
    nextRowZ += rowGap(speed);
  }

  const allCoins = newCoins.length > 0 ? [...coinsList, ...newCoins] : coinsList;

  const crashed = allObstacles.some((o) => hitsObstacle(player, o));

  return {
    ...state,
    phase: crashed ? 'crashed' : 'running',
    crashT: crashed ? 0 : state.crashT,
    time,
    speed,
    multiplier,
    distance,
    distanceScore,
    score: Math.floor(distanceScore) + coins * CONFIG.COIN_VALUE,
    coins,
    player,
    obstacles: allObstacles,
    coinsList: allCoins,
    nextRowZ,
    nextId,
    rngState,
    bufferedAction: pending,
  };
}

/**
 * Fresh running state. Pass a seed, or an existing state to start a new run with seed + 1.
 */
export function startRun(seed: number): GameState;
export function startRun(state: GameState): GameState;
export function startRun(arg: number | GameState): GameState {
  const seed = typeof arg === 'number' ? arg : arg.seed + 1;
  return createInitialState(seed, 'running');
}

/** Toggles running <-> paused. Other phases are returned unchanged. */
export function togglePause(state: GameState): GameState {
  if (state.phase === 'running') return { ...state, phase: 'paused' };
  if (state.phase === 'paused') return { ...state, phase: 'running' };
  return state;
}
