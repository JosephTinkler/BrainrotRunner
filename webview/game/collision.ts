import { CONFIG } from './config';
import { isSliding, playerX } from './player';
import type { Coin, Lane, Obstacle, PlayerState } from './types';

/** A low obstacle is cleared when the player is above this height. */
const LOW_CLEAR_HEIGHT = 0.6;
const COIN_PICKUP_Z = 0.8;
const COIN_PICKUP_Y = 1.0;

/**
 * The lane used for collisions: the committed lane when settled, otherwise the lane nearest
 * to the player's interpolated position.
 */
export function playerLane(p: PlayerState): Lane {
  if (p.laneT >= 1) return p.lane;
  const r = Math.round(playerX(p));
  if (r <= -1) return -1;
  if (r >= 1) return 1;
  return 0;
}

export function hitsObstacle(p: PlayerState, o: Obstacle): boolean {
  if (o.lane !== playerLane(p)) return false;

  const half = o.depth / 2;
  const overlapsZ =
    o.z - half <= CONFIG.PLAYER_HALF_DEPTH && o.z + half >= -CONFIG.PLAYER_HALF_DEPTH;
  if (!overlapsZ) return false;

  switch (o.kind) {
    case 'low':
      return !(p.y > LOW_CLEAR_HEIGHT);
    case 'high':
      return !isSliding(p);
    case 'block':
    case 'moving':
      return true;
  }
}

export function collectsCoin(p: PlayerState, c: Coin): boolean {
  return (
    c.lane === playerLane(p) && Math.abs(c.z) < COIN_PICKUP_Z && Math.abs(p.y - c.y) < COIN_PICKUP_Y
  );
}
