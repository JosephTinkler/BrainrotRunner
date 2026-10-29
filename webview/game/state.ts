import { CONFIG } from './config';
import type { GameState, Phase } from './types';

export function createInitialState(seed: number, phase: Phase = 'title'): GameState {
  return {
    phase,
    time: 0,
    distance: 0,
    speed: CONFIG.BASE_SPEED,
    coins: 0,
    score: 0,
    multiplier: 1,
    player: { lane: 0, fromLane: 0, laneT: 1, y: 0, jumpT: -1, slideT: -1 },
    obstacles: [],
    coinsList: [],
    // First row appears about 2 s of travel ahead, giving the player a clear start.
    nextRowZ: CONFIG.BASE_SPEED * 2,
    nextId: 1,
    seed,
    rngState: seed | 0,
    bufferedAction: null,
    crashT: 0,
    distanceScore: 0,
  };
}
