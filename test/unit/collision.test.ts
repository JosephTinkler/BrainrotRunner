import { describe, expect, it } from 'vitest';
import { collectsCoin, hitsObstacle } from '../../webview/game/collision';
import { playerX } from '../../webview/game/player';
import type { Coin, Obstacle, PlayerState } from '../../webview/game/types';

const grounded = (lane: -1 | 0 | 1 = 0): PlayerState => ({
  lane,
  fromLane: lane,
  laneT: 1,
  y: 0,
  jumpT: -1,
  slideT: -1,
});

const obs = (kind: Obstacle['kind'], lane: -1 | 0 | 1 = 0, z = 0, depth = 1): Obstacle => ({
  id: 1,
  kind,
  lane,
  z,
  depth,
});

describe('hitsObstacle', () => {
  it('a grounded runner hits a low fence', () => {
    expect(hitsObstacle(grounded(), obs('low'))).toBe(true);
  });

  it('a jump above the threshold clears a low fence', () => {
    const airborne: PlayerState = { ...grounded(), y: 1.5, jumpT: 0.3 };
    expect(hitsObstacle(airborne, obs('low'))).toBe(false);
  });

  it('a jump just above the ground still hits a low fence', () => {
    const low: PlayerState = { ...grounded(), y: 0.2, jumpT: 0.02 };
    expect(hitsObstacle(low, obs('low'))).toBe(true);
  });

  it('sliding clears a high bar and standing hits it', () => {
    expect(hitsObstacle(grounded(), obs('high'))).toBe(true);
    const sliding: PlayerState = { ...grounded(), slideT: 0.1 };
    expect(hitsObstacle(sliding, obs('high'))).toBe(false);
  });

  it('a full block always hits in its lane, even while jumping or sliding', () => {
    expect(hitsObstacle(grounded(), obs('block'))).toBe(true);
    expect(hitsObstacle({ ...grounded(), y: 2, jumpT: 0.2 }, obs('block'))).toBe(true);
    expect(hitsObstacle({ ...grounded(), slideT: 0.1 }, obs('block'))).toBe(true);
    expect(hitsObstacle(grounded(), obs('moving'))).toBe(true);
  });

  it('a long train whose centre is ahead still hits the player it overlaps', () => {
    // Spans z in [-1, 9], so the player at z 0 is inside it.
    expect(hitsObstacle(grounded(), obs('block', 0, 4, 10))).toBe(true);
    expect(hitsObstacle(grounded(), obs('moving', 0, 4, 8))).toBe(true);
    expect(hitsObstacle(grounded(1), obs('block', 0, 4, 10))).toBe(false);
  });

  it('adjacent lanes never collide', () => {
    expect(hitsObstacle(grounded(-1), obs('block', 0))).toBe(false);
    expect(hitsObstacle(grounded(1), obs('block', 0))).toBe(false);
    expect(hitsObstacle(grounded(0), obs('block', 1))).toBe(false);
  });

  it('obstacles that do not overlap the player depth do not collide', () => {
    // Player spans z in [-0.6, 0.6]; this block spans [1.5, 2.5].
    expect(hitsObstacle(grounded(), obs('block', 0, 2, 1))).toBe(false);
    // Block spanning [-2.5, -1.5] is behind the player.
    expect(hitsObstacle(grounded(), obs('block', 0, -2, 1))).toBe(false);
  });

  it('uses the nearest lane mid-tween', () => {
    // fromLane -1 -> lane 0 with laneT 0.2 gives x ~ -0.9, nearest lane -1.
    const tweening: PlayerState = { ...grounded(0), fromLane: -1, laneT: 0.2 };
    expect(playerX(tweening)).toBeLessThan(-0.5);
    expect(hitsObstacle(tweening, obs('block', -1))).toBe(true);
    expect(hitsObstacle(tweening, obs('block', 0))).toBe(false);
  });
});

describe('collectsCoin', () => {
  const coin = (lane: -1 | 0 | 1 = 0, z = 0, y = 0): Coin => ({
    id: 1,
    lane,
    z,
    y,
    collected: false,
  });

  it('collects a coin in the same lane at the same height and depth', () => {
    expect(collectsCoin(grounded(), coin())).toBe(true);
  });

  it('does not collect in another lane, too far, or too high', () => {
    expect(collectsCoin(grounded(0), coin(1))).toBe(false);
    expect(collectsCoin(grounded(0), coin(0, 1))).toBe(false);
    expect(collectsCoin(grounded(0), coin(0, 0, 1.5))).toBe(false);
  });

  it('collects an arc coin while jumping through it', () => {
    const airborne: PlayerState = { ...grounded(), y: 1.6, jumpT: 0.3 };
    expect(collectsCoin(airborne, coin(0, 0, 1.4))).toBe(true);
  });
});
